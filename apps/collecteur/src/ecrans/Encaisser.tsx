import { formatMontant, MISES_PAR_CYCLE, soldeRestituable } from '@kolek/core';
import {
  BandeauHorsLigne,
  Bouton,
  CarteCollecte,
  Icone,
  Onde,
  Pagination,
  Squelette,
  Tampon,
  useEnLigne,
  usePagination,
  type CleNavCollecteur,
} from '@kolek/ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import type { CarteChoisie } from '../Coquille';
import { enregistrerMise } from '../ecritures';
import type { Tournee } from '../hors-ligne/modele';
import { useHorsLigne, type EtatHorsLigne } from '../hors-ligne/useHorsLigne';
import {
  TourneeAbsente,
  cartesAEncaisser,
  etatEnvoiMise,
  type EtatEnvoiMise,
} from '../hors-ligne/vues';
import { LIGNES_AFFICHEES_PAR_PAGE } from '../pagination';
import { correspondClient } from '../recherche';
import { numeroDeRecu } from '../recu';

/**
 * Encaissement d'une mise, en trois temps depuis le 2026-10-02 : choisir la
 * carte, confirmer, encaissé.
 *
 * L'onglet ouvert sans carte disait « Aucune carte choisie » et renvoyait vers
 * Clients : une impasse sur le geste que le collecteur fait trente fois par
 * jour. Il propose maintenant les cartes elles-mêmes, tirées de la tournée du
 * téléphone, donc hors ligne aussi.
 *
 * Deux choix d'avant, qui tiennent toujours.
 *
 * **Le montant n'est pas libre.** Il est celui de la carte, et rien d'autre :
 * le déclencheur `mises_avant_insert` refuse toute mise dont le montant diffère
 * de `cartes.mise`. Proposer un clavier libre laisserait saisir 2 000 sur une
 * carte à 1 000, pour se voir refuser après coup. Le montant s'affiche, il ne
 * se saisit pas.
 *
 * **Pas de champ « Note ».** `mises` n'a pas de colonne pour le recevoir. Un
 * champ qui accepte du texte et le jette ment comme un bouton qui n'écrit rien.
 */
export function Encaisser({
  collecteurId,
  carte,
  onChoisir,
  onNaviguer,
  onEncaisse,
  onRecus,
}: {
  collecteurId: string | null;
  carte: CarteChoisie | null;
  /** Choisir une carte dans la liste, ou y revenir (`null`). */
  onChoisir: (carte: CarteChoisie | null) => void;
  onNaviguer: (cle: CleNavCollecteur) => void;
  onEncaisse: () => void;
  /** Les reçus du client qu'on vient d'encaisser. */
  onRecus: (clientNom: string) => void;
}) {
  const enLigne = useEnLigne();
  const horsLigne = useHorsLigne();
  // Dans la bande sombre, comme sur l'accueil. Il se tait seul quand la file
  // est vide et le réseau là (§8.2).
  const bandeau = (
    <BandeauHorsLigne enLigne={enLigne} compte={horsLigne.file} className="relative z-10 mt-4" />
  );

  return (
    <div className="anim-entree flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-liste">
      {carte ? (
        // La clé remet l'écran à zéro d'une carte à l'autre : l'état
        // « encaissé » d'une cliente ne doit pas survivre sur la suivante.
        <Confirmation
          key={carte.carteId}
          collecteurId={collecteurId}
          carte={carte}
          horsLigne={horsLigne}
          bandeau={bandeau}
          onRetour={() => onChoisir(null)}
          onEncaisse={onEncaisse}
          onRecus={onRecus}
        />
      ) : (
        <Selecteur
          tournee={horsLigne.tournee}
          bandeau={bandeau}
          onChoisir={onChoisir}
          onNaviguer={onNaviguer}
        />
      )}
    </div>
  );
}

/**
 * La bande sombre. Avec l'en-tête de l'accueil, la seule du produit : la
 * journée qui s'ouvre, et le geste qui la paie.
 */
function Bande({
  titre,
  sousTitre,
  onRetour,
  children,
}: {
  titre: string;
  sousTitre?: string;
  onRetour?: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden bg-[image:var(--degrade-hero)] px-marge pb-5 pt-entete lg:rounded-xl lg:pt-6">
      <Onde
        lignes={8}
        traitFixe
        className="pointer-events-none absolute inset-x-0 bottom-0 h-5 w-full text-or/30"
      />
      <div className="relative z-10 flex items-center gap-3">
        {onRetour && (
          <button
            type="button"
            onClick={onRetour}
            aria-label="Revenir à la liste des cartes"
            className="anim-pression flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-white/25 bg-white/10"
          >
            <Icone nom="arrow-left" taille={18} className="text-white" />
          </button>
        )}
        <div className="min-w-0">
          <p className="truncate font-headings text-xl font-bold tracking-tight text-white">
            {titre}
          </p>
          {sousTitre && <p className="truncate font-body text-sm text-white/70">{sousTitre}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}

/** Trente et un traits : l'avancement se lit d'un regard, avant le chiffre. */
function Jauge({ faites }: { faites: number }) {
  return (
    <span aria-hidden className="mt-2 flex gap-px">
      {Array.from({ length: MISES_PAR_CYCLE }, (_, i) => (
        <span key={i} className={`h-2.5 w-0.5 ${i < faites ? 'bg-primary' : 'bg-trait/40'}`} />
      ))}
    </span>
  );
}

/**
 * Temps 1 : la carte du client.
 *
 * Les plus avancées d'abord : ce sont celles qu'il faut finir, et c'est l'ordre
 * de l'accueil, qui montre la première. Une carte pleine n'y est pas : elle
 * n'a plus de case à payer, elle relève du retrait.
 */
function Selecteur({
  tournee,
  bandeau,
  onChoisir,
  onNaviguer,
}: {
  tournee: Tournee | null;
  bandeau: ReactNode;
  onChoisir: (carte: CarteChoisie) => void;
  onNaviguer: (cle: CleNavCollecteur) => void;
}) {
  const [recherche, setRecherche] = useState('');
  const toutes = tournee && tournee.lueLe !== null ? cartesAEncaisser(tournee) : [];
  const terme = recherche.trim();
  const trouvees = toutes.filter((c) =>
    correspondClient({ nom: c.clientNom, marche: c.marche, telephone: c.telephone }, terme),
  );
  const { page, pages, total, visibles, allerA } = usePagination(
    trouvees,
    LIGNES_AFFICHEES_PAR_PAGE,
  );

  // Une recherche nouvelle repart de la page 1 : voir `Clients`.
  const changerRecherche = (valeur: string) => {
    setRecherche(valeur);
    allerA(1);
  };

  return (
    <>
      <Bande titre="Encaisser" sousTitre="Choisis la carte du client.">
        {bandeau}
      </Bande>

      {tournee === null ? (
        <div aria-hidden className="mx-4 mt-4 space-y-2">
          <Squelette hauteur="h-12" largeur="w-full" />
          <Squelette hauteur="h-16" largeur="w-full" />
          <Squelette hauteur="h-16" largeur="w-full" />
        </div>
      ) : tournee.lueLe === null ? (
        <p role="alert" className="mx-4 mt-4 font-body text-sm text-negative">
          {new TourneeAbsente().message}
        </p>
      ) : toutes.length === 0 ? (
        <div className="mx-4 mt-6 rounded-xl border border-hairline bg-surface p-5">
          <p className="font-headings text-lg font-bold text-ink">Aucune carte à encaisser</p>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Les cartes actives de ta tournée viennent ici. Une carte pleine se rend par le retrait.
          </p>
          <Bouton pleineLargeur className="mt-4" onClick={() => onNaviguer('clients')}>
            Voir mes clients
          </Bouton>
        </div>
      ) : (
        <>
          <div className="relative mx-4 mt-4">
            <Icone
              nom="search"
              taille={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            {/* Les mêmes réglages que la recherche de `Clients`, et pour les
                mêmes raisons : `text` et non `search`, ni correcteur ni
                majuscule automatique. */}
            <input
              type="text"
              value={recherche}
              onChange={(e) => changerRecherche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') changerRecherche('');
              }}
              placeholder="Nom, numéro ou marché…"
              aria-label="Chercher une carte"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="min-h-12 w-full rounded-md border border-trait bg-surface pl-10 pr-12 font-body text-champ text-ink placeholder:text-muted-foreground focus:border-primary"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => changerRecherche('')}
                aria-label="Effacer la recherche"
                className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-pill text-muted-foreground hover:text-ink"
              >
                <Icone nom="x" taille={16} />
              </button>
            )}
          </div>

          <div className="mx-4 mt-5 flex items-baseline justify-between gap-3">
            <h2 className="font-headings text-lg font-bold text-ink">Cartes actives</h2>
            <p className="font-body text-xs text-muted-foreground">
              <span className="font-mono">{toutes.length}</span>, les plus avancées d’abord
            </p>
          </div>

          {trouvees.length === 0 ? (
            <div className="mx-4 mt-2 rounded-xl border border-hairline bg-surface p-4">
              <p className="font-body text-base text-ink">Aucune carte ne correspond.</p>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Vérifie l’orthographe, ou efface la recherche.
              </p>
            </div>
          ) : (
            <ul
              aria-label="Cartes à encaisser"
              className="mx-4 mt-2 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface"
            >
              {visibles.map((c) => (
                <li key={c.carteId}>
                  <button
                    type="button"
                    onClick={() =>
                      onChoisir({
                        carteId: c.carteId,
                        clientNom: c.clientNom,
                        mise: c.mise,
                        misesEncaissees: c.misesEncaissees,
                      })
                    }
                    className="anim-pression flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body text-base font-semibold text-ink">
                        {c.clientNom}
                      </span>
                      {/* Le marché se coupe, la mise jamais : elle est en fin de
                          ligne, et dans un seul texte tronqué un marché de
                          soixante lettres la cachait. */}
                      <span className="mt-0.5 flex font-body text-xs text-muted-foreground">
                        {c.marche && (
                          <>
                            <span className="truncate">{c.marche}</span>
                            <span aria-hidden className="shrink-0 px-1">
                              ·
                            </span>
                          </>
                        )}
                        <span className="shrink-0">
                          <span className="font-mono">{formatMontant(c.mise)}</span>/j
                        </span>
                      </span>
                      <Jauge faites={c.misesEncaissees} />
                    </span>
                    <span className="shrink-0 font-mono text-sm text-ink tabular-nums">
                      {c.misesEncaissees}/{MISES_PAR_CYCLE}
                    </span>
                    <Icone
                      nom="chevron-right"
                      taille={16}
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Pagination page={page} pages={pages} total={total} onAller={allerA} />
        </>
      )}

      <div className="min-h-6 flex-1" />
    </>
  );
}

/** Ce qu'il faut garder d'une mise écrite pour dire où elle en est. */
interface MiseEcrite {
  miseId: string;
  operationId: string;
  /** L'heure de l'encaissement : celle que porte le tampon. */
  quand: Date;
  numeroCase: number;
}

const PHRASE_ENVOI: Record<EtatEnvoiMise, string> = {
  envoyee: 'Envoyée.',
  gardee: 'Gardée sur ce téléphone, elle partira avec le réseau.',
  refusee: 'Le serveur a refusé cette mise. Le détail est dans les alertes.',
};

const TEINTE_ENVOI: Record<EtatEnvoiMise, string> = {
  envoyee: 'text-positive',
  gardee: 'text-info',
  refusee: 'text-negative',
};

/**
 * Temps 2 et 3 : confirmer, puis encaissé.
 *
 * Après le succès, le bouton « Encaisser » n'est plus rendu du tout : le
 * serveur accepte deux mises le même jour sur une carte, et l'écran ne doit
 * pas en offrir une seconde. Le geste suivant est « Client suivant ».
 *
 * Le bloc du geste, avant comme après, est collant au-dessus de la barre du bas
 * (`sticky bottom-nav`). Posé au bas du flux, il passait à moitié dessous sur un
 * téléphone de 568 px de haut : le bouton le plus important du produit se
 * trouvait sous un autre. Sur un écran assez haut son emplacement naturel est
 * déjà au-dessus du seuil, et rien ne change.
 */
function Confirmation({
  collecteurId,
  carte,
  horsLigne,
  bandeau,
  onRetour,
  onEncaisse,
  onRecus,
}: {
  collecteurId: string | null;
  carte: CarteChoisie;
  horsLigne: EtatHorsLigne;
  bandeau: ReactNode;
  onRetour: () => void;
  onEncaisse: () => void;
  onRecus: (clientNom: string) => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ecrite, setEcrite] = useState<MiseEcrite | null>(null);
  const etatRef = useRef<HTMLDivElement>(null);
  // La phrase d'envoi : « Reçu », tant qu'il est éteint, la prend pour description.
  const idPhrase = useId();

  // Au succès le bouton « Encaisser » disparaît, et le focus qu'il avait avec
  // lui : il tomberait sur <body>, et la ligne d'état, insérée déjà remplie,
  // resterait muette pour un lecteur d'écran. Elle le reçoit donc, comme le
  // panneau de `Feuille` à son ouverture.
  useEffect(() => {
    if (ecrite !== null) etatRef.current?.focus();
  }, [ecrite]);

  const complet = carte.misesEncaissees >= MISES_PAR_CYCLE;
  const numeroCase = carte.misesEncaissees + 1;
  const etat = ecrite ? etatEnvoiMise(ecrite, horsLigne) : null;
  // Une mise refusée ne remplit pas sa case : la carte la montrerait payée.
  const remplie = ecrite !== null && etat !== 'refusee';
  // Après le succès, la coquille avance la carte d'une case. L'écran lit donc
  // la case écrite, et non celle de la carte, pour ne pas compter deux fois.
  const jour = ecrite
    ? remplie
      ? ecrite.numeroCase
      : ecrite.numeroCase - 1
    : carte.misesEncaissees;

  async function confirmer() {
    if (!collecteurId || envoi || ecrite || complet) return;
    setEnvoi(true);
    setErreur(null);

    const quand = new Date();
    const resultat = await enregistrerMise(collecteurId, carte.carteId, carte.mise, quand);

    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    setEcrite({ miseId: resultat.miseId, operationId: resultat.operationId, quand, numeroCase });
    onEncaisse();
  }

  return (
    <>
      <Bande titre="Encaisser une mise" onRetour={onRetour}>
        {bandeau}
      </Bande>

      <div className="mx-4 mt-4">
        <CarteCollecte
          nomClient={carte.clientNom}
          misePar={formatMontant(carte.mise)}
          jourCourant={jour}
          solde={formatMontant(soldeRestituable(jour, carte.mise))}
          neuve={ecrite && remplie ? ecrite.numeroCase : undefined}
          tampon={
            ecrite && remplie ? (
              <Tampon mot={etat === 'envoyee' ? 'Encaissé' : 'Gardée'} quand={ecrite.quand} />
            ) : undefined
          }
        />
      </div>

      {ecrite === null ? (
        // Sous le pouce : le bloc de caisse descend en bas de l'écran, et s'arrête
        // au-dessus de la barre (`sticky bottom-nav`) quand l'écran est court.
        // Le billet défile derrière lui, d'où le fond opaque ; sur bureau, sans
        // barre, il reprend sa place dans le flux (`lg:static`).
        <section
          aria-label="Caisse"
          className="sticky bottom-nav z-10 mx-4 mt-auto bg-canvas pb-5 pt-6 lg:static"
        >
          <div className="rounded-xl border border-hairline bg-surface p-4">
            {!complet && (
              <div className="mb-4">
                <p className="font-body text-sm text-muted-foreground">
                  Mise du jour, case <span className="font-mono">{numeroCase}</span>
                </p>
                <p className="mt-1 font-mono text-3xl font-medium tracking-tight text-ink tabular-nums">
                  {formatMontant(carte.mise)}{' '}
                  <span className="font-body text-base font-medium tracking-normal text-muted-foreground">
                    FCFA
                  </span>
                </p>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Solde après{' '}
                  <span className="font-mono">
                    {formatMontant(soldeRestituable(numeroCase, carte.mise))}
                  </span>{' '}
                  FCFA
                </p>
              </div>
            )}

            {erreur && (
              <p
                role="alert"
                className="mb-3 rounded-md bg-negative-tint p-3 font-body text-sm font-medium text-negative"
              >
                {erreur}
              </p>
            )}

            {/* `shadow-action` : la seule ombre teintée du Design System
                (§3.5), réservée au geste qui fait vivre Kolek. */}
            <Bouton
              pleineLargeur
              grand
              icone="banknote"
              className="shadow-action"
              nomAccessible={
                envoi
                  ? undefined
                  : `Encaisser ${formatMontant(carte.mise)} FCFA sur la carte de ${carte.clientNom}`
              }
              disabled={envoi || collecteurId === null || complet}
              onClick={confirmer}
            >
              {envoi ? 'Enregistrement…' : 'Encaisser'}
            </Bouton>
            <p className="mt-2 text-center font-body text-xs text-muted-foreground">
              {complet
                ? `Le cycle de ${MISES_PAR_CYCLE} mises est complet. La carte doit être clôturée.`
                : 'Montant fixé à l’ouverture de la carte.'}
            </p>
          </div>
        </section>
      ) : (
        // Collant comme le bloc de caisse, pour la même raison : « Client suivant »
        // est le geste qui suit, il ne doit pas passer sous la barre. La ligne
        // d'état reste avec ses commandes. L'air du haut est dedans (`pt-4`) et
        // non en marge : collé, le bloc coupe le billet net, et la ligne d'état
        // ne doit pas toucher la coupe.
        <div className="sticky bottom-nav z-10 mx-4 flex flex-1 flex-col bg-canvas pt-4 lg:static">
          {/* Le tampon est `aria-hidden` : cette ligne dit la même chose aux
              lecteurs d'écran. Une mise refusée n'a ni tampon ni reçu.

              `tabIndex={-1}` : elle prend le focus par programme (voir l'effet
              plus haut), sans entrer dans l'ordre de tabulation. `outline-none`
              n'éteint pas son anneau : la règle `:focus-visible` de `base.css`
              est hors de toute couche, donc plus forte que lui. Mesuré dans
              Chrome, l'anneau se dessine quand le bouton avait été activé au
              clavier, et pas quand il l'avait été d'un clic ou d'un toucher :
              c'est voulu. */}
          <div ref={etatRef} role="status" tabIndex={-1} className="space-y-1 outline-none">
            <p className="font-body text-base font-semibold text-ink">
              <span className="font-mono">{formatMontant(carte.mise)}</span> FCFA pour{' '}
              {carte.clientNom}, case <span className="font-mono">{ecrite.numeroCase}</span>.
            </p>
            {etat && (
              <p id={idPhrase} className={`font-body text-sm font-medium ${TEINTE_ENVOI[etat]}`}>
                {PHRASE_ENVOI[etat]}
              </p>
            )}
            {remplie && (
              <p className="font-body text-sm text-muted-foreground">
                Reçu n° <span className="font-mono">{numeroDeRecu(ecrite.miseId)}</span>
              </p>
            )}
          </div>

          <div className="mt-auto flex gap-2 pb-5 pt-6">
            <Bouton className="flex-1" onClick={onRetour}>
              Client suivant
            </Bouton>
            {/* « Reçu » garde sa place de la mise gardée à la mise envoyée : éteint
                tant qu'elle attend (l'écran des reçus ne lit que le journal du
                serveur, qui ne la connaît pas encore), allumé une fois partie.
                Il ne doit jamais apparaître sous le pouce : l'envoi arrive un
                aller-retour après l'appui, quand le pouce vise « Client
                suivant », et un bouton qui prendrait alors son tiers de la
                rangée ouvrirait les reçus, dont le retour mène à l'accueil et
                non à la liste. Sur un refus il disparaît (pas de reçu d'une mise
                refusée) : la rangée s'agrandit, ce qui ne détourne aucun appui. */}
            {remplie && (
              <Bouton
                variante="contour"
                icone="receipt-text"
                disabled={etat !== 'envoyee'}
                decritPar={etat === 'gardee' ? idPhrase : undefined}
                onClick={() => onRecus(carte.clientNom)}
              >
                Reçu
              </Bouton>
            )}
          </div>
        </div>
      )}
    </>
  );
}

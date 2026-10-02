import { formatMontant } from '@kolek/core';
import { Carte, Icone, Pagination, SqueletteLigne, usePagination, type NomIcone } from '@kolek/ui';
import { useEffect, useMemo, useState } from 'react';

import { useDonnees } from '../cache';
import {
  chargerHistoriqueCarte,
  chargerJournal,
  type EvenementCarte,
  type EvenementRecu,
  type NatureEvenement,
} from '../lectures-ecrans';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { nu } from '../recherche';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';
import { useEstCollaborateur } from './commission';

/**
 * Les reçus : la preuve de ce qui s'est passé.
 *
 * Ce que cet écran remplace, c'est le carnet à souche. Un client qui conteste
 * veut entendre trois choses : la date, le montant, et un numéro qu'on puisse
 * retrouver. Les trois sont là, et depuis le 2026-09-17 tout le passé l'est
 * aussi.
 *
 * ## Ce qu'il a absorbé, et pourquoi
 *
 * La fiche client portait « Cartes précédentes », un bouton « Historique
 * complet » et « Derniers versements » ; l'accueil portait « Dernières mises ».
 * Quatre endroits pour une seule question — « qu'est-ce qui s'est passé ? » —
 * et aucun qui réponde en entier : la fiche ne montrait qu'un client, l'accueil
 * que cinq lignes, et l'historique complet s'ouvrait par-dessus la fiche.
 *
 * Tout est ici, sur une seule frise. C'est aussi ce qui rend les filtres
 * nécessaires : une liste qui contient tout ne sert à rien si on ne peut pas y
 * chercher.
 *
 * ## Le numéro est l'identifiant du mouvement, abrégé
 *
 * Il est engendré par le téléphone au moment du geste — c'est ce qui empêche un
 * rejeu de synchro de compter deux fois. Ce n'est donc pas un numéro d'ordre,
 * et ça ne peut pas l'être : deux collecteurs encaissent en même temps, et un
 * compteur croissant tenu côté téléphone se contredirait à la remontée.
 *
 * **Pas de bouton « imprimer ».** Rien dans l'application ne parle à une
 * imprimante, et un bouton qui n'imprime pas serait exactement le défaut qu'on
 * a passé la journée à retirer d'ici.
 */

/**
 * Ce que chaque nature porte à l'écran.
 *
 * Les teintes viennent de la palette **sémantique**, et pas des aplats de
 * tuile : ici la couleur dit ce qu'est la ligne, pas où elle mène. Une mise
 * entre, une commission est à toi, un rattrapage est une dette que le serveur
 * a refusée, une clôture est du passé — et le gris du passé n'est pas une
 * absence de couleur, c'est la bonne.
 */
const NATURES: Record<
  NatureEvenement,
  { libelle: string; icone: NomIcone; pastille: string; encre: string }
> = {
  mise: {
    libelle: 'Mise',
    icone: 'circle-dollar-sign',
    pastille: 'bg-positive-tint',
    encre: 'text-positive',
  },
  commission: {
    libelle: 'Commission',
    icone: 'coins',
    pastille: 'bg-info-tint',
    encre: 'text-info',
  },
  rattrapage: {
    libelle: 'Rattrapage',
    icone: 'refresh-cw',
    pastille: 'bg-negative-tint',
    encre: 'text-negative',
  },
  cloture: {
    libelle: 'Carte clôturée',
    icone: 'credit-card',
    pastille: 'bg-muted',
    encre: 'text-muted-foreground',
  },
};

const ORDRE_NATURES: NatureEvenement[] = ['mise', 'commission', 'rattrapage', 'cloture'];

/**
 * Les fenêtres de temps proposées.
 *
 * Des jours, et non des mois de calendrier : « ce mois-ci » le 1er du mois ne
 * montre rien, et c'est le jour où le collecteur a le plus besoin de relire le
 * mois d'avant. `null` ne filtre pas.
 */
const PERIODES: Array<{ cle: string; libelle: string; jours: number | null }> = [
  { cle: 'tout', libelle: 'Tout', jours: null },
  { cle: '7j', libelle: '7 jours', jours: 7 },
  { cle: '30j', libelle: '30 jours', jours: 30 },
  { cle: '90j', libelle: '3 mois', jours: 90 },
];

const PAR_PAGE = 15;

/** Le jour d'un événement, en clé triable et comparable. */
function clefDuJour(iso: string): string {
  return iso.slice(0, 10);
}

function titreDuJour(iso: string): string {
  const jour = new Date(iso);
  const aujourdhui = clefDuJour(new Date().toISOString());
  const hier = clefDuJour(new Date(Date.now() - 86_400_000).toISOString());
  const cle = clefDuJour(iso);

  if (cle === aujourdhui) return "Aujourd'hui";
  if (cle === hier) return 'Hier';

  return jour.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(jour.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function Recus({
  onRetour,
  revision,
  rechercheInitiale = '',
}: {
  onRetour: () => void;
  revision: number;
  /** Le nom d'un client, quand on arrive depuis sa fiche. C'est une valeur
      de départ et non un filtre imposé : elle remplit le champ, que le
      collecteur peut vider d'un geste. L'écran est remonté à chaque
      navigation, donc l'état initial suffit — aucun effet à synchroniser. */
  rechercheInitiale?: string;
}) {
  const estCollaborateur = useEstCollaborateur();
  const { donnees: journal, erreur } = useDonnees('recus', () => chargerJournal(), {
    revision,
    messageErreur: 'Cet écran demande le réseau.',
    besoinReseau: true,
  });
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [natures, setNatures] = useState<NatureEvenement[]>([]);
  const [periode, setPeriode] = useState('tout');
  const [recherche, setRecherche] = useState(rechercheInitiale);
  // La cascade ne joue qu'à l'ouverture de l'écran. `revision` relit la liste
  // après chaque écriture ; rejouer l'escalier à ce moment ferait clignoter
  // l'historique sous les yeux du collecteur.
  const premier = usePremierRendu();

  const filtres = useMemo(() => {
    if (!journal) return [];

    const jours = PERIODES.find((p) => p.cle === periode)?.jours ?? null;
    const depuis = jours === null ? null : Date.now() - jours * 86_400_000;
    const cherche = nu(recherche.trim());

    return journal.filter((e) => {
      if (natures.length > 0 && !natures.includes(e.nature)) return false;
      if (depuis !== null && new Date(e.survenuLe).getTime() < depuis) return false;
      if (cherche && !nu(e.clientNom).includes(cherche)) return false;
      return true;
    });
  }, [journal, natures, periode, recherche]);

  const { page, pages, total, visibles, allerA } = usePagination(filtres, PAR_PAGE);

  /**
   * Les lignes de la page, regroupées par jour.
   *
   * Le regroupement est fait **après** la pagination, et non avant : grouper
   * d'abord obligerait à paginer des jours entiers, donc à montrer trois lignes
   * sur une page et quarante sur la suivante. Un jour peut donc s'étaler sur
   * deux pages, et c'est le moindre des deux défauts.
   *
   * Ce qui n'était pas le moindre : chaque groupe porte `duJour`, le compte
   * du jour **entier**, pris sur la liste filtrée avant qu'on la coupe en
   * pages. Sans lui, un jour coupé par la pagination annonçait « 4 lignes »
   * pour une journée qui en porte douze — et sur un écran de reçus, où l'on
   * répond à un client qui conteste un décompte, c'est le pire chiffre qu'on
   * puisse écrire.
   */
  const parJour = useMemo(() => {
    const duJour = new Map<string, number>();
    for (const evenement of filtres) {
      const jour = clefDuJour(evenement.survenuLe);
      duJour.set(jour, (duJour.get(jour) ?? 0) + 1);
    }

    const groupes: Array<{ jour: string; lignes: EvenementRecu[]; duJour: number }> = [];
    for (const evenement of visibles) {
      const jour = clefDuJour(evenement.survenuLe);
      const dernier = groupes.at(-1);
      if (dernier && dernier.jour === jour) dernier.lignes.push(evenement);
      else groupes.push({ jour, lignes: [evenement], duJour: duJour.get(jour) ?? 1 });
    }
    return groupes;
  }, [filtres, visibles]);

  function basculerNature(nature: NatureEvenement) {
    setNatures((choisies) =>
      choisies.includes(nature) ? choisies.filter((n) => n !== nature) : [...choisies, nature],
    );
    allerA(1);
  }

  const filtreActif = natures.length > 0 || periode !== 'tout' || recherche.trim() !== '';

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Reçus"
        sousTitre={
          journal
            ? filtreActif
              ? `${total} sur ${journal.length} événements`
              : `${journal.length} derniers événements`
            : 'Tout le passé du portefeuille'
        }
        onRetour={onRetour}
        largeur="liste"
        enfants={
          <div className="flex flex-col gap-2.5">
            {/* Le champ fait 16 px : en dessous, Safari zoome à la mise au
                point et l'écran saute sous le doigt. C'est la règle que tient
                `verifier-champs.mjs`. */}
            <label className="relative block">
              <span className="sr-only">Chercher un client</span>
              <Icone
                nom="search"
                taille={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={recherche}
                onChange={(e) => {
                  setRecherche(e.target.value);
                  allerA(1);
                }}
                placeholder="Chercher un client"
                className="w-full rounded-md border border-hairline bg-surface py-2.5 pl-10 pr-3 font-body text-champ text-ink placeholder:text-muted-foreground"
              />
            </label>

            <div className="flex flex-wrap gap-1.5">
              {ORDRE_NATURES.map((nature) => {
                const choisie = natures.includes(nature);
                return (
                  <button
                    key={nature}
                    type="button"
                    aria-pressed={choisie}
                    onClick={() => basculerNature(nature)}
                    className={`anim-pression rounded-pill px-3 py-1.5 font-body text-xs font-semibold cursor-pointer border ${
                      choisie
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-surface text-muted-foreground border-hairline'
                    }`}
                  >
                    {NATURES[nature].libelle}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PERIODES.map((p) => (
                <button
                  key={p.cle}
                  type="button"
                  aria-pressed={periode === p.cle}
                  onClick={() => {
                    setPeriode(p.cle);
                    allerA(1);
                  }}
                  className={`anim-pression rounded-pill px-3 py-1.5 font-body text-xs font-semibold cursor-pointer border ${
                    periode === p.cle
                      ? 'bg-accent text-primary-foreground border-accent'
                      : 'bg-surface text-muted-foreground border-hairline'
                  }`}
                >
                  {p.libelle}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <CorpsEcran
        largeur="liste"
        enfants={
          <>
            {erreur && (
              <p
                role="alert"
                className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md"
              >
                {erreur}
              </p>
            )}

            {!journal && !erreur && (
              <Carte className="p-0 overflow-hidden divide-y divide-hairline">
                <SqueletteLigne />
                <SqueletteLigne />
                <SqueletteLigne />
                <SqueletteLigne />
              </Carte>
            )}

            {journal?.length === 0 && (
              <RienAMontrer
                icone="receipt"
                titre="Aucun encaissement"
                detail="Chaque mise enregistrée laisse ici un reçu, avec sa date et son numéro."
              />
            )}

            {journal && journal.length > 0 && total === 0 && (
              <RienAMontrer
                icone="coins"
                titre="Rien avec ces filtres"
                detail="Élargis la période, ou enlève un type pour retrouver des lignes."
              />
            )}

            {parJour.map(({ jour, lignes, duJour }, rangGroupe) => (
              <section key={jour} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3 pt-1">
                  <h2 className="font-headings font-bold text-sm text-ink">
                    {titreDuJour(lignes[0]!.survenuLe)}
                  </h2>
                  {/* « 4 sur 12 » quand la page coupe la journée, dans les
                      mêmes mots que le sous-titre de l'écran, qui dit déjà
                      « N sur M événements ». */}
                  <span className="font-body text-xs text-muted-foreground tabular-nums">
                    {duJour > lignes.length ? `${lignes.length} sur ${duJour}` : duJour} ligne
                    {duJour > 1 ? 's' : ''}
                  </span>
                </div>

                {lignes.map((evenement, rangLigne) => (
                  <LigneJournal
                    key={evenement.id}
                    evenement={evenement}
                    estCollaborateur={estCollaborateur}
                    ouvert={ouvert === evenement.id}
                    onBasculer={() =>
                      setOuvert(ouvert === evenement.id ? null : evenement.id)
                    }
                    anime={premier}
                    rang={rangGroupe * 3 + rangLigne}
                  />
                ))}
              </section>
            ))}

            {total > PAR_PAGE && (
              <Carte className="p-0 overflow-hidden">
                <Pagination page={page} pages={pages} total={total} onAller={allerA} />
              </Carte>
            )}
          </>
        }
      />
    </div>
  );
}

/**
 * Une ligne, et son dépli.
 *
 * Le dépli n'est pas un luxe : la liste doit rester lisible d'un coup d'œil —
 * qui, combien, quand — et le détail n'intéresse que celui qui conteste. Tout
 * afficher ferait quatre lignes par reçu, et il y en a des centaines.
 */
function LigneJournal({
  evenement,
  estCollaborateur,
  ouvert,
  onBasculer,
  anime,
  rang,
}: {
  evenement: EvenementRecu;
  estCollaborateur: boolean;
  ouvert: boolean;
  onBasculer: () => void;
  anime: boolean;
  rang: number;
}) {
  const quand = new Date(evenement.survenuLe);
  const nature = NATURES[evenement.nature];
  const estCloture = evenement.nature === 'cloture';

  /**
   * Les mises de la carte close, cherchées au dépli et pas avant.
   *
   * C'est ce que portait l'écran « Historique complet » avant le
   * 2026-09-17, et c'est le seul morceau qui ne pouvait pas tenir dans la
   * fenêtre du journal : les mises d'une carte fermée il y a six mois sont
   * loin derrière les deux cents dernières lignes, et ce sont justement
   * celles qu'on vient lire quand un client conteste un vieux cycle.
   *
   * Une requête par carte dépliée, jamais au chargement de l'écran : dix
   * cartes closes à l'affichage feraient dix allers-retours pour un détail
   * que personne n'a demandé.
   */
  /**
   * Ce que la ligne annonce.
   *
   * Une commission ne dit pas la même chose selon qui lit : au titulaire
   * elle revient, au collaborateur elle échappe. Ça se lit sur la ligne
   * fermée et non dans le dépli — un collaborateur qui parcourt ses reçus
   * doit voir d'un coup d'œil ce qui n'est pas à lui, sans ouvrir vingt
   * lignes pour le savoir.
   */
  const libelle =
    evenement.nature === 'commission' && estCollaborateur
      ? 'Commission titulaire'
      : nature.libelle;

  const [detail, setDetail] = useState<EvenementCarte[] | null>(null);
  const [detailEnErreur, setDetailEnErreur] = useState(false);
  const carteId = evenement.carteId;

  useEffect(() => {
    if (!ouvert || !estCloture || !carteId || detail) return;

    let vivant = true;
    chargerHistoriqueCarte(carteId)
      .then((lignes) => {
        if (vivant) setDetail(lignes);
      })
      .catch(() => {
        // La lecture lève plutôt que de rendre une liste vide, et c'est
        // voulu : « aucun versement » serait ici le pire des mensonges.
        if (vivant) setDetailEnErreur(true);
      });

    return () => {
      vivant = false;
    };
  }, [ouvert, estCloture, carteId, detail]);

  return (
    <Carte
      className={`p-0 rounded-lg border border-hairline/80 overflow-hidden ${anime ? 'anim-cascade' : ''}`}
      style={rangCascade(rang, anime)}
    >
      <button
        type="button"
        onClick={onBasculer}
        aria-expanded={ouvert}
        className="w-full p-4 flex items-center gap-3 text-left cursor-pointer"
      >
        <div
          className={`w-10 h-10 rounded-pill ${nature.pastille} flex items-center justify-center shrink-0`}
        >
          <Icone nom={nature.icone} taille={18} className={nature.encre} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-body font-semibold text-sm text-ink truncate">
            {evenement.clientNom}
          </p>
          <p className="font-body text-xs text-muted-foreground">
            {/* Le libellé dans son propre nœud : cherché tel quel par les
                épreuves, il ne doit pas être coupé par le point médian. */}
            <span>{libelle}</span> ·{' '}
            {quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-headings font-bold text-base text-ink tabular-nums">
            {estCloture ? '' : '+'}
            {formatMontant(evenement.montant)}
          </p>
          {estCloture && evenement.cycle && (
            <p className="text-xs font-body text-muted-foreground tabular-nums">
              {evenement.cycle.misesEncaissees}/31 encaissées
            </p>
          )}
        </div>
        <Icone
          nom={ouvert ? 'chevron-down' : 'chevron-right'}
          taille={18}
          className="text-muted-foreground shrink-0"
        />
      </button>

      {ouvert && (
        <div className="px-4 pb-4 pt-0 border-t border-hairline">
          <dl className="text-sm font-body space-y-1.5 pt-3">
            <Detail terme="Type">{libelle}</Detail>

            {!estCloture && (
              <Detail terme="Numéro de reçu">
                <span className="font-mono font-semibold">
                  {evenement.id.slice(0, 8).toUpperCase()}
                </span>
              </Detail>
            )}

            <Detail terme="Mise du carnet">
              <span className="tabular-nums">{formatMontant(evenement.mise)} FCFA / jour</span>
            </Detail>

            <Detail terme={estCloture ? 'Clôturée le' : 'Encaissé le'}>
              {quand.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Detail>

            {estCloture && evenement.cycle && (
              <>
                <Detail terme="Ouverte le">
                  {new Date(evenement.cycle.ouverteLe).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Detail>
                <Detail terme="Cycle rempli">
                  <span className="tabular-nums">
                    {evenement.cycle.misesEncaissees} mises sur 31
                  </span>
                </Detail>
                <Detail terme="Total encaissé">
                  <span className="tabular-nums">{formatMontant(evenement.montant)} FCFA</span>
                </Detail>
              </>
            )}

            {evenement.nature === 'commission' && (
              <p className="text-xs text-muted-foreground pt-2">
                Première mise de la carte : elle {estCollaborateur ? 'revient au titulaire' : 'te revient'},
                conformément au contrat du client.
              </p>
            )}

            {evenement.nature === 'rattrapage' && (
              <p className="text-xs text-muted-foreground pt-2">
                Cette mise a été refusée par le serveur et enregistrée comme dette. Elle reste due.
              </p>
            )}

            {estCloture && (
              <p className="text-xs text-muted-foreground pt-2">
                La carte est fermée : elle ne reçoit plus de mise. Le solde a été restitué au client.
              </p>
            )}

            {estCloture && detailEnErreur && (
              <p className="text-xs text-negative pt-2">
                Le détail de cette carte demande le réseau.
              </p>
            )}

            {estCloture && detail && detail.length > 0 && (
              <div className="pt-3">
                <p className="font-body font-semibold text-xs text-ink mb-1.5">
                  Le détail de cette carte ({detail.length})
                </p>
                <ul className="flex flex-col gap-1">
                  {detail.map((ligne) => (
                    <li
                      key={ligne.id}
                      className="flex items-baseline justify-between gap-3 font-body text-xs"
                    >
                      <span className="text-muted-foreground">
                        {ligne.genre === 'retrait'
                          ? 'Restitution'
                          : ligne.estCommission
                            ? 'Commission'
                            : ligne.genre === 'rattrapage'
                              ? 'Rattrapage'
                              : 'Mise'}{' '}
                        ·{' '}
                        {new Date(ligne.date).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="text-ink tabular-nums shrink-0">
                        {ligne.genre === 'retrait' ? '−' : '+'}
                        {formatMontant(ligne.montant)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </dl>
        </div>
      )}
    </Carte>
  );
}

function Detail({ terme, children }: { terme: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{terme}</dt>
      <dd className="text-ink text-right">{children}</dd>
    </div>
  );
}

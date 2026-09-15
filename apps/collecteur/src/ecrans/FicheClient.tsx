import { MISES_PAR_CYCLE, formatMontant, soldeRestituable } from '@kolek/core';
import {
  BadgeStatut,
  Bouton,
  CarrouselCartes,
  Champ,
  Feuille,
  Icone,
  LigneTransaction,
  useEnLigne,
  type CarteItem,
} from '@kolek/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  annulerMise,
  avancerEnvoi,
  definirConsentementAvis,
  enregistrerMise,
  modifierClient,
  ouvrirCarte,
  type CorrectionClient,
} from '../ecritures';
import {
  estRattrapee,
  misesAffichees,
  SURSIS_MS,
  SURSIS_S,
  type EnAttente,
} from '../encaissement-differe';
import type { Operation } from '../hors-ligne/modele';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { enAttenteSurCarte, identifiantsEnAttente, phraseAttenteCarte } from '../hors-ligne/vues';
import { chargerFicheClient, type CarteFiche, type FicheClient as Fiche } from '../lectures-ecrans';
import { ActiverCarte } from './ActiverCarte';
import { ChoixMise } from './ChoixMise';
import { HistoriqueClient } from './HistoriqueClient';
import { useEstCollaborateur } from './commission';

/**
 * Ce que voit le collecteur quand plus aucune écriture ne peut partir.
 *
 * Dit une seule fois, parce que deux chemins y mènent : le garde-fou d'`ecrire`,
 * et celui d'`encaisser` qui l'anticipe pour ne pas faire attendre six secondes
 * un sursis sans objet. Deux copies du même message finissent par diverger sur
 * une virgule, et c'est le même bandeau qui les affiche.
 */
const SESSION_PERDUE = 'Session perdue. Reconnecte-toi avant de réessayer.';

/**
 * Ce que voit le collecteur quand l'enregistrement sur le téléphone lève au lieu
 * de répondre. `enregistrerMise` rend `{ ok: false }` sur tout refus connu ; un
 * rejet ne dit pas si l'opération a été écrite avant. La phrase ne promet donc
 * rien, et demande de regarder la carte avant de recommencer.
 */
const ENREGISTREMENT_INCERTAIN =
  'Enregistrement incertain sur ce téléphone. Vérifie la carte avant de réessayer.';

/**
 * La fiche d'un client, en panneau flottant.
 *
 * ## Ce qu'elle remplace
 *
 * Rien — et c'est le problème qu'elle règle. La ligne d'un client portait son
 * nom, sa mise, son avancement et deux commandes, et c'était tout ce qu'on
 * pouvait savoir de lui sans quitter l'écran. Ses cartes passées, ses derniers
 * versements, son numéro : invisibles.
 *
 * ## Les trois gestes qu'elle rend possibles
 *
 * **Encaisser** — le même geste que depuis la liste, mais après avoir vu où en
 * est la carte.
 *
 * **Ouvrir une nouvelle carte** — après les 31 mises, après une restitution, ou
 * simplement pour changer de montant. La carte est l'unité qui se répète ; le
 * client, lui, ne s'inscrit qu'une fois.
 *
 * **Prévenir ou ne plus prévenir** — le consentement aux avis, recueilli là où
 * l'on a le client en face.
 *
 * ## Pourquoi les cartes clôturées restent affichées
 *
 * Parce qu'elles ne disparaissent pas de la vie du client. Une carte clôturée,
 * c'est un cycle qu'il a tenu — ou une restitution qu'il a demandée en cours de
 * route. Dans les deux cas il peut reprendre, et le collecteur doit pouvoir
 * dire « c'est ta quatrième carte » plutôt que de faire semblant que rien n'a
 * précédé.
 */
export function FicheClient({
  clientId,
  collecteurId,
  revision,
  onFermer,
  onEcriture,
  onRetrait,
}: {
  clientId: string | null;
  /** Donné par la coquille, qui le lit une fois à l'ouverture. Les blocs
      d'écriture de cette fiche le reçoivent au lieu de relire la session
      chacun de leur côté — chaque lecture est un aller-retour réseau. */
  collecteurId: string | null;
  revision: number;
  onFermer: () => void;
  onEcriture: () => void;
  /** Renvoie vers l'écran de retrait, réduit à ce client. Le nom part avec la
      demande : l'écran doit pouvoir le nommer même quand il ne lui reste
      aucune carte à montrer. */
  onRetrait: (clientNom: string) => void;
}) {
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // La carte choisie vit ici, un cran au-dessus de `CartesEnCours`, et pas
  // dans son propre `useState`. Jusqu'à J2b, `CartesEnCours` démontait et
  // remontait à chaque relecture : la fiche repassait par `null`. Elle ne le
  // fait plus qu'au changement de client, mais un `useState` posé plus bas
  // resterait à la merci du moindre démontage — et se réinitialiserait sur la
  // carte la plus avancée, pas sur celle qu'on vient de payer.
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  // Le brouillon de correction vit ici, et non dans `CorrigerFiche` — même
  // raison que `visibleId` ci-dessus. Jusqu'à J2b, chaque écriture faisait
  // repasser la fiche par `null` et démontait le formulaire : un brouillon
  // logé dedans s'effaçait sous les doigts du collecteur, au moment exact où
  // l'on corrige. Constaté en relisant, le 2026-09-11.
  const [brouillon, setBrouillon] = useState<CorrectionClient | null>(null);
  const enLigne = useEnLigne();
  const { operations } = useHorsLigne();
  /** Ce qui n'a pas encore quitté le téléphone : clients, cartes, mises (§8.3). */
  const pasEnvoyes = useMemo(() => identifiantsEnAttente(operations), [operations]);

  const relire = useCallback(async () => {
    if (!clientId) return;
    try {
      const lue = await chargerFicheClient(clientId);
      if (lue === null) {
        setErreur('Fiche introuvable. Elle a peut-être été supprimée.');
        return;
      }
      setFiche(lue);
      setErreur(null);
    } catch {
      setErreur('Fiche indisponible. Vérifie le réseau.');
    }
  }, [clientId]);

  useEffect(() => {
    // La fiche précédente est effacée au changement de client : sans ça, ouvrir
    // un second client montre un instant les chiffres du premier — et un solde
    // qui appartient à quelqu'un d'autre est la pire chose à afficher ici.
    setFiche(null);
    setErreur(null);
  }, [clientId]);

  useEffect(() => {
    // Une relecture du même client, elle, ne vide rien (J2b) : la tournée est
    // sur le téléphone, la lecture est immédiate, et vider démontait le bandeau
    // du sursis — « Annuler » disparaissait sous le doigt.
    void relire();
  }, [relire, revision]);

  useEffect(() => {
    // Seul le changement de client remet la carte choisie à zéro : une
    // relecture (donc un changement de `revision`) ne doit jamais la faire
    // bouger — c'est justement ce que l'effet précédent provoque en
    // interne, sans que le collecteur ait rien décidé.
    setVisibleId(null);
    // L'historique se referme avec le client : rester dedans en changeant de
    // client montrerait les cartes de l'un sous le nom de l'autre.
    setHistoriqueOuvert(false);
    // Le brouillon de correction aussi : le garder en changeant de client
    // corrigerait la fiche de l'un avec la saisie de l'autre.
    setBrouillon(null);
  }, [clientId]);

  /**
   * Le défilement du document, pendant que l'historique est ouvert.
   *
   * `Feuille` bloque `document.body` et le rend en se démontant. L'historique
   * **remplace** la feuille — c'est un plein écran, et l'imbriquer empilerait
   * deux en-têtes — donc son ouverture rendait le défilement au document
   * derrière lui. Sur un téléphone ça se voit tout de suite : on fait défiler
   * l'historique, on arrive au bout, et c'est la liste des clients qui se met à
   * bouger dessous.
   *
   * La valeur précédente est restaurée plutôt qu'écrasée par `''`, exactement
   * comme le fait `Feuille` : deux panneaux imbriqués ne doivent pas se rendre
   * le défilement par le premier qui ferme.
   */
  useEffect(() => {
    if (!historiqueOuvert) return;

    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = precedent;
    };
  }, [historiqueOuvert]);

  // Le numéro de cycle est une donnée chronologique — la énième carte que ce
  // client a ouverte — et se lit dans la position au sein de `fiche.cartes`,
  // l'ordre d'ouverture décroissant que rend `chargerFicheClient` (la plus
  // ancienne en dernier, donc au cycle 1). Il est calculé ici, avant tout tri
  // d'affichage : un tri par avancement ne doit jamais faire varier le numéro
  // d'une carte qui, elle, n'a pas bougé.
  const total = fiche?.cartes.length ?? 0;
  const actives = (fiche?.cartes ?? [])
    .map((carte, indice) => ({ carte, cycle: total - indice }))
    .filter(({ carte }) => carte.statut === 'active')
    // La plus avancée d'abord : c'est celle dont le cycle se termine en premier,
    // donc celle sur laquelle une décision se présente le plus tôt.
    .sort((a, b) => b.carte.misesEncaissees - a.carte.misesEncaissees);

  // Corriger la fiche et changer les avis restent en ligne (spec §1.2) : ce
  // sont des modifications, et un client pas encore envoyé n'existe pas au
  // serveur — la correction partirait sur une ligne absente.
  const correctionBloquee = !enLigne
    ? 'Corriger la fiche ou les avis demande le réseau.'
    : fiche && pasEnvoyes.has(fiche.id)
      ? 'Client pas encore envoyé : sa fiche se corrige une fois arrivé au serveur.'
      : null;

  // Plein écran, et non dans la `Feuille` : `HistoriqueClient` porte son propre
  // bandeau et attend toute la hauteur. Le glisser dans un panneau modal lui
  // ferait empiler deux en-têtes. La fiche, elle, reste montée sous cet
  // écran — le collecteur la retrouve où il l'avait laissée, carte choisie
  // comprise.
  if (historiqueOuvert && fiche) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas overflow-y-auto flex flex-col">
        <HistoriqueClient
          nomClient={fiche.nom}
          cartes={fiche.cartes}
          revision={revision}
          onFermer={() => setHistoriqueOuvert(false)}
        />
      </div>
    );
  }

  return (
    <Feuille
      titre={fiche?.nom ?? 'Fiche client'}
      sousTitre={fiche ? sousTitre(fiche) : undefined}
      ouverte={clientId !== null}
      onFermer={onFermer}
    >
      {erreur && (
        <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
          {erreur}
        </p>
      )}

      {!fiche && !erreur && (
        <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
      )}

      {fiche && (
        <>
          {brouillon ? (
            <CorrigerFiche
              fiche={fiche}
              saisie={brouillon}
              // Par fonction, et non `{ ...brouillon, … }` : deux frappes
              // rapprochées liraient sinon le même brouillon, et la seconde
              // effacerait la première.
              onChamp={(cle, valeur) =>
                setBrouillon((b) => (b ? { ...b, [cle]: valeur } : b))
              }
              onFini={async () => {
                setBrouillon(null);
                await relire();
                onEcriture();
              }}
              onAnnuler={() => setBrouillon(null)}
            />
          ) : (
            <>
              <Coordonnees
                fiche={fiche}
                bloque={correctionBloquee !== null}
                onChange={onEcriture}
                onRelire={relire}
              />
              {/* Une faute de frappe faite au marché était définitive jusqu'au
                  2026-09-11 : aucun écran, collecteur ou administration, ne
                  modifiait un client. */}
              <Bouton
                variante="fantome"
                pleineLargeur
                disabled={correctionBloquee !== null}
                onClick={() => setBrouillon(origineDe(fiche))}
              >
                Corriger la fiche
              </Bouton>
              {correctionBloquee && (
                <p className="font-body text-xs text-muted-foreground text-center m-0">
                  {correctionBloquee}
                </p>
              )}
            </>
          )}

          {actives.length > 0 ? (
            <CartesEnCours
              actives={actives}
              nomClient={fiche.nom}
              clientId={fiche.id}
              collecteurId={collecteurId}
              operations={operations}
              enLigne={enLigne}
              onRetrait={onRetrait}
              onEcriture={onEcriture}
              visibleId={visibleId}
              onVisible={setVisibleId}
            />
          ) : (
            <NouvelleCarte
              clientId={fiche.id}
              collecteurId={collecteurId}
              premiere={fiche.cartes.length === 0}
              onOuverte={() => {
                void relire();
                onEcriture();
              }}
            />
          )}

          {/* Le `fiche.cartes.length > 1` qui gardait cette section est tombé
              le 2026-09-10 : il la rendait invisible pour un client qui n'a
              qu'une carte, c'est-à-dire la majorité. `Historique` se tait déjà
              seul quand aucune carte n'est close. */}
          <Historique cartes={fiche.cartes} />

          {fiche.cartes.length > 0 && (
            <Bouton
              variante="contour"
              pleineLargeur
              onClick={() => setHistoriqueOuvert(true)}
            >
              Historique complet
            </Bouton>
          )}

          {fiche.mises.length > 0 && (
            <section>
              <p className="font-headings font-bold text-base text-ink mb-2">Derniers versements</p>
              <div className="rounded-lg border border-hairline overflow-hidden">
                {fiche.mises.slice(0, 8).map((m, i, liste) => (
                  <LigneTransaction
                    key={m.id}
                    nom={m.estCommission ? 'Commission' : 'Mise'}
                    meta={`${new Date(m.encaisseLe).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}${pasEnvoyes.has(m.id) ? ' · pas encore envoyée' : ''}`}
                    montant={`+${formatMontant(m.montant)}`}
                    type={m.estCommission ? 'neutre' : 'positive'}
                    derniere={i === Math.min(liste.length, 8) - 1}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Feuille>
  );
}

function sousTitre(fiche: Fiche): string {
  const morceaux = [fiche.marche, fiche.activite, fiche.telephone].filter(
    (x): x is string => Boolean(x),
  );
  return morceaux.length > 0 ? morceaux.join(' · ') : 'Aucune coordonnée renseignée';
}

/** Le numéro, et le consentement aux avis — les deux vont ensemble. */
function Coordonnees({
  fiche,
  bloque,
  onChange,
  onRelire,
}: {
  fiche: Fiche;
  /** Réseau absent, ou client pas encore envoyé : le consentement ne peut pas partir. */
  bloque: boolean;
  onChange: () => void;
  onRelire: () => Promise<void>;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [demande, setDemande] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function poser(accepte: boolean) {
    setEnvoi(true);
    setErreur(null);
    const resultat = await definirConsentementAvis(fiche.id, accepte);
    setEnvoi(false);
    setDemande(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    await onRelire();
    onChange();
  }

  if (!fiche.telephone) {
    return (
      <p className="font-body text-xs text-muted-foreground bg-canvas rounded-md p-3 m-0">
        Ce client n’a pas de numéro : aucun avis ne peut lui être envoyé.
      </p>
    );
  }

  if (demande) {
    return (
      <div className="bg-canvas rounded-md p-3">
        <p className="font-body text-sm text-ink m-0">
          {fiche.nom} accepte-t-il de recevoir un message à chaque mouvement sur son{' '}
          {fiche.telephone} ?
        </p>
        <p className="font-body text-xs text-muted-foreground mt-1">
          Demande-lui avant de confirmer.
        </p>
        <div className="flex gap-2 mt-2">
          <Bouton onClick={() => void poser(true)} disabled={envoi || bloque}>
            {envoi ? 'Enregistrement…' : 'Il a accepté'}
          </Bouton>
          <Bouton variante="contour" onClick={() => setDemande(false)} disabled={envoi}>
            Annuler
          </Bouton>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-canvas rounded-md p-3 flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 min-w-0">
        <Icone
          nom={fiche.avisActifs ? 'bell' : 'bell-off'}
          taille={15}
          className={fiche.avisActifs ? 'text-positive shrink-0' : 'text-muted-foreground shrink-0'}
        />
        <span className="font-body text-xs text-muted-foreground truncate">
          {fiche.avisActifs ? 'Prévenu à chaque mouvement' : 'Non prévenu'}
        </span>
      </span>
      <button
        type="button"
        disabled={envoi || bloque}
        aria-pressed={fiche.avisActifs}
        onClick={() => (fiche.avisActifs ? void poser(false) : setDemande(true))}
        className="anim-pression px-3 py-1.5 rounded-md border border-hairline text-ink text-xs font-body font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40"
      >
        {fiche.avisActifs ? 'Ne plus prévenir' : 'Prévenir'}
      </button>
      {erreur && (
        <p role="alert" className="font-body text-xs text-negative m-0">
          {erreur}
        </p>
      )}
    </div>
  );
}

/** Les quatre champs corrigibles, tels que la fiche les porte en base. */
function origineDe(fiche: Fiche): CorrectionClient {
  return {
    nom: fiche.nom,
    telephone: fiche.telephone ?? '',
    marche: fiche.marche ?? '',
    activite: fiche.activite ?? '',
  };
}

/**
 * Le formulaire de correction d'une fiche client.
 *
 * ## Pourquoi il vit dans la fiche et non dans un écran à lui
 *
 * La fiche est l'endroit où le collecteur constate l'erreur — c'est là qu'il
 * lit « GSM T · BLE ZOKOU · 0709201790 ». Le faire voyager vers un autre écran
 * pour réparer ce qu'il regarde est un détour que rien ne justifie. Le
 * formulaire prend la place du bloc `Coordonnees`, et rien d'autre ne bouge.
 *
 * ## Pourquoi un vrai `<form>`
 *
 * La touche « OK » du clavier Android envoie le formulaire : le collecteur
 * corrige un numéro sans chercher le bouton sous le clavier ouvert. Et le
 * formulaire nommé donne aux épreuves une portée — la fiche porte d'autres
 * « Annuler », dont celui du sursis d'encaissement.
 *
 * ## L'avertissement sur les avis
 *
 * Il paraît **avant** d'enregistrer, dès que le numéro saisi diffère de celui
 * en base, et seulement si les avis étaient actifs. L'apprendre après coup,
 * c'est laisser le collecteur croire que les avis continuent — sur un numéro
 * que personne n'a accepté.
 *
 * Mesuré en production le 2026-09-11 : 68 clients sur 81 ont les avis actifs.
 * C'est le message que cet écran affichera le plus souvent. Il porte donc
 * l'icône `bell-off`, celle que `Coordonnees` montrera juste après
 * l'enregistrement : le collecteur reconnaît le même état aux deux endroits.
 */
function CorrigerFiche({
  fiche,
  saisie,
  onChamp,
  onFini,
  onAnnuler,
}: {
  fiche: Fiche;
  /** Tenu par `FicheClient`, qui survit aux relectures — voir la note sur
      `brouillon`. */
  saisie: CorrectionClient;
  onChamp: (cle: keyof CorrectionClient, valeur: string) => void;
  onFini: () => Promise<void>;
  onAnnuler: () => void;
}) {
  // La référence est la fiche **telle que relue**, pas telle qu'à l'ouverture :
  // si une relecture survient pendant la correction, c'est à l'état présent
  // en base que la saisie se compare.
  const origine = origineDe(fiche);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const numeroChange = saisie.telephone.trim() !== origine.telephone.trim();

  async function enregistrer() {
    // Un double appui sur « OK » enverrait deux fois la même correction. La
    // seconde ne changerait rien en base, mais laisserait une seconde ligne au
    // journal d'audit pour un seul geste.
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    const resultat = await modifierClient(fiche.id, saisie, origine);
    setEnvoi(false);

    if (!resultat.ok) {
      // La saisie reste à l'écran : la retaper au marché, debout, serait la
      // seconde erreur.
      setErreur(resultat.echec.message);
      return;
    }
    await onFini();
  }

  const poser = (cle: keyof CorrectionClient) => (valeur: string) => onChamp(cle, valeur);

  return (
    <form
      aria-label="Corriger la fiche"
      onSubmit={(e) => {
        e.preventDefault();
        void enregistrer();
      }}
      className="bg-canvas rounded-md p-3 space-y-3"
    >
      {erreur && (
        <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md m-0">
          {erreur}
        </p>
      )}

      <Champ libelle="Nom" valeur={saisie.nom} onChange={poser('nom')} requis autoComplete="off" />
      <Champ
        libelle="Téléphone"
        type="tel"
        inputMode="tel"
        valeur={saisie.telephone}
        onChange={poser('telephone')}
        autoComplete="off"
      />
      <Champ libelle="Marché" valeur={saisie.marche} onChange={poser('marche')} autoComplete="off" />
      <Champ
        libelle="Activité"
        valeur={saisie.activite}
        onChange={poser('activite')}
        autoComplete="off"
      />

      {/* Montée avec le formulaire, vide, et non insérée avec son texte : une
          région vive n'annonce que ce qui change **après** son apparition.
          Insérée en même temps que l'avertissement, elle resterait muette —
          la leçon est écrite dans `Pagination.tsx`. */}
      <div aria-live="polite">
        {numeroChange && fiche.avisActifs && (
          <p className="flex items-start gap-2 bg-surface border border-hairline rounded-md p-3 m-0 font-body text-xs text-ink">
            <Icone nom="bell-off" taille={15} className="text-muted-foreground shrink-0 mt-px" />
            <span>
              Les avis seront coupés : {fiche.nom} avait accepté de les recevoir sur son ancien
              numéro. Après l’enregistrement, redemande-lui son accord pour le nouveau.
            </span>
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Bouton type="submit" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </Bouton>
        <Bouton variante="contour" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </Bouton>
      </div>
    </form>
  );
}

/**
 * Les cartes en cours d'un client, et ce qu'on peut faire de celle qu'on regarde.
 *
 * ## Le bouton est entré dans la carte, le 2026-08-31
 *
 * Il vivait sous la rangée, et il quittait la fiche pour un second écran qui
 * remontrait la carte en grand avec un bouton « Confirmer ». Deux écrans pour
 * un geste fait trente fois par matinée, debout, le client en face — et la
 * carte qu'on venait de regarder disparaissait au moment de décider.
 *
 * Deux raisons de le loger dans la carte plutôt que sous elle :
 *
 * - **il n'y a plus de doute sur la carte servie.** Depuis que la rangée sait
 *   montrer deux ou quatre cartes ensemble, un bouton unique posé dessous ne
 *   désigne plus personne. Le liseré aidait ; il ne suffisait pas, et se
 *   tromper de carte ici, c'est encaisser sur le mauvais cycle ;
 * - **il défile avec elle.** Le bandeau de sursis aussi : le collecteur peut
 *   aller regarder une autre carte pendant le décompte sans perdre de vue ce
 *   qui est en train de partir.
 *
 * ## Les six secondes
 *
 * `mises` est append-only — voir `encaissement-differe.ts`, qui porte la règle.
 * Depuis J2b, l'appui écrit l'opération dans la file du téléphone, avec une
 * échéance à six secondes ; le synchroniseur ne l'envoie qu'après, et
 * « Annuler » la retire de la file d'ici là. La case ne se remplit qu'une fois
 * l'opération sur le disque (spec §4.1).
 *
 * Fermer la fiche ou passer l'application en arrière-plan avance l'échéance :
 * plus personne ne regarde « Annuler », la mise part tout de suite. Et un
 * rechargement pendant le sursis ne la perd plus — elle est sur le disque
 * (écart 4).
 *
 * ## Pourquoi l'attente est aussi tenue en référence
 *
 * Un minuteur ne voit que l'état du rendu qui l'a posé. La référence, elle,
 * dit ce qui attend au moment où le minuteur se déclenche — et c'est ce qui
 * permet à `purger` d'être appelée d'ailleurs que d'un gestionnaire de clic.
 */
function CartesEnCours({
  actives,
  nomClient,
  clientId,
  collecteurId,
  operations,
  enLigne,
  onRetrait,
  onEcriture,
  visibleId,
  onVisible,
}: {
  actives: Array<{ carte: CarteFiche; cycle: number }>;
  nomClient: string;
  clientId: string;
  collecteurId: string | null;
  /** La file du téléphone : une opération de la carte encore là ferme le retrait (§7). */
  operations: readonly Operation[];
  enLigne: boolean;
  /** Le nom accompagne la demande : l'écran de retrait s'ouvre réduit à ce
      client et doit pouvoir le nommer même quand il ne lui reste aucune carte. */
  onRetrait: (clientNom: string) => void;
  onEcriture: () => void;
  /** Tenue par `FicheClient`, qui survit à la relecture — voir le
      commentaire posé là-bas sur ce `useState`. */
  visibleId: string | null;
  onVisible: (id: string) => void;
}) {
  const [attente, setAttente] = useState<EnAttente | null>(null);
  const [restant, setRestant] = useState(0);
  /** Un enregistrement sur le téléphone est en vol : le bouton attend sa réponse. */
  const [occupe, setOccupe] = useState(false);

  const enCours = useRef<EnAttente | null>(null);
  /** La même garde, lue sans attendre un rendu : deux appuis dans la même image n'écrivent qu'une mise. */
  const ecriture = useRef(false);
  const sursis = useRef<number | null>(null);
  const decompte = useRef<number | null>(null);
  // Après le démontage, les références restent utiles — l'enregistrement en
  // cours les lit — mais l'état ne peut plus rien afficher.
  const monte = useRef(true);

  // Le contexte suit chaque rendu, pour la même raison que l'attente : la purge
  // part d'endroits qui ne referment rien.
  const contexte = useRef({ collecteurId, onEcriture });
  contexte.current = { collecteurId, onEcriture };

  function poser(en: EnAttente | null) {
    enCours.current = en;
    if (monte.current) setAttente(en);
  }

  function arreter() {
    if (sursis.current !== null) window.clearTimeout(sursis.current);
    if (decompte.current !== null) window.clearInterval(decompte.current);
    sursis.current = null;
    decompte.current = null;
    if (monte.current) setRestant(0);
  }

  /** Avance l'échéance d'une opération en file. Un échec la laisse partir à son heure : rien n'est perdu. */
  function faireAvancer(operationId: string) {
    const id = contexte.current.collecteurId;
    if (!id) return;
    avancerEnvoi(id, operationId).catch(() => {
      // L'opération reste en file avec son échéance d'origine.
    });
  }

  /** Ce qui était en sursis part maintenant : un autre appui, la fiche qui se ferme, l'arrière-plan. */
  function purger() {
    arreter();
    const en = enCours.current;
    // Rien sur le disque, ou déjà envoyable : il n'y a rien à avancer — et
    // surtout rien à réécrire, la mise est déjà dans la file.
    if (!en || en.envoyee || en.operationId === null) return;
    poser({ ...en, envoyee: true });
    faireAvancer(en.operationId);
  }

  async function encaisser(carte: CarteFiche) {
    if (ecriture.current) return;
    // Un second appui pendant un sursis fait partir le premier. Deux mises le
    // même jour sur la même carte sont acceptées par le serveur ; ce n'est pas
    // à cet écran de les interdire, seulement de ne pas les perdre.
    purger();

    const socle: EnAttente = {
      carteId: carte.id,
      mise: carte.mise,
      base: carte.misesEncaissees,
      operationId: null,
      envoyee: true,
    };

    const id = contexte.current.collecteurId;
    if (!id) {
      // Sans identifiant de collecteur, aucune base ne s'ouvre : le dire tout
      // de suite plutôt qu'au bout d'une attente.
      poser({ ...socle, echec: SESSION_PERDUE });
      return;
    }

    ecriture.current = true;
    if (monte.current) setOccupe(true);
    let resultat: Awaited<ReturnType<typeof enregistrerMise>>;
    try {
      resultat = await enregistrerMise(id, carte.id, carte.mise, new Date(), {
        sursisMs: SURSIS_MS,
      });
    } catch {
      poser({ ...socle, echec: ENREGISTREMENT_INCERTAIN });
      return;
    } finally {
      ecriture.current = false;
      if (monte.current) setOccupe(false);
    }

    if (!resultat.ok) {
      // Refusée par le téléphone — carte clôturée, disque plein : rien n'a été
      // écrit, la case ne se remplit pas.
      poser({ ...socle, echec: resultat.echec.message });
      return;
    }

    const operationId = resultat.operationId;
    const en: EnAttente = { ...socle, operationId, envoyee: false };
    if (!monte.current) {
      // La fiche s'est fermée pendant l'enregistrement : la mise est sur le
      // disque, et personne ne verra « Annuler ». Elle part tout de suite.
      faireAvancer(operationId);
      return;
    }

    poser(en);
    setRestant(SURSIS_S);
    decompte.current = window.setInterval(
      () => setRestant((seconde) => Math.max(0, seconde - 1)),
      1000,
    );
    sursis.current = window.setTimeout(() => {
      arreter();
      // L'attente a pu être annulée ou remplacée entre-temps.
      if (enCours.current !== en) return;
      poser({ ...en, envoyee: true });
    }, SURSIS_MS);

    // En dernier, et hors de tout `try` : un rappel qui lève n'a rien à voir
    // avec l'enregistrement, qui a réussi. Pris dans le `catch`, il afficherait
    // un échec sur une mise enregistrée — avec un « Réessayer » qui en
    // écrirait une seconde.
    contexte.current.onEcriture();
  }

  async function annuler() {
    const en = enCours.current;
    const id = contexte.current.collecteurId;
    if (!en || en.envoyee || en.operationId === null || !id) return;
    arreter();

    let issue: 'annulee' | 'partie' | 'absente';
    try {
      issue = await annulerMise(id, en.operationId);
    } catch {
      // Base illisible : l'opération ne peut pas être retirée, elle partira.
      issue = 'partie';
    }
    if (enCours.current !== en) return;

    if (issue === 'annulee') {
      poser(null);
      contexte.current.onEcriture();
      return;
    }
    // L'échéance était passée, ou l'opération a déjà quitté la file : elle est
    // partie. Le bandeau cesse de proposer ce qu'il ne peut plus tenir.
    poser({ ...en, envoyee: true });
  }

  function reessayer() {
    const en = enCours.current;
    if (!en) return;
    const carte = actives.find(({ carte: c }) => c.id === en.carteId)?.carte;
    poser(null);
    // Un appui neuf : un refus n'a rien écrit, et un échec incertain a demandé
    // de regarder la carte avant.
    if (carte) void encaisser(carte);
  }

  useEffect(() => {
    monte.current = true;
    return () => {
      // L'ordre compte : le témoin tombe d'abord, sinon `purger` tenterait de
      // poser un état sur un composant démonté.
      monte.current = false;
      purger();
    };
    // `purger` ne touche que des références : la refermer à chaque rendu ne
    // changerait rien, et ce dénouement appartient au seul démontage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function surMasquage() {
      // L'application passe en arrière-plan : plus personne ne regarde
      // « Annuler », et le système peut la tuer sans prévenir. Ce qui attendait
      // part maintenant.
      if (document.visibilityState === 'hidden') purger();
    }
    document.addEventListener('visibilitychange', surMasquage);
    return () => document.removeEventListener('visibilitychange', surMasquage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le compte réel de la carte qui attend, s'il y en a une et qu'elle est
  // toujours là. `null` quand la carte a disparu de la fiche — clôturée.
  const reelles = attente
    ? (actives.find(({ carte: c }) => c.id === attente.carteId)?.carte.misesEncaissees ?? null)
    : null;

  useEffect(() => {
    if (!attente) return;
    if (reelles === null) {
      poser(null);
      return;
    }
    // Pendant le sursis, le bandeau reste même quand la relecture compte déjà
    // la mise : c'est lui qui porte « Annuler ». Il s'efface une fois
    // l'échéance passée et la mise comptée par la tournée.
    if (attente.envoyee && estRattrapee(reelles, attente)) poser(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attente, reelles]);

  const courant = actives.find(({ carte }) => carte.id === visibleId) ?? actives[0];
  const { carte } = courant;
  const misesCourantes = misesAffichees(carte.id, carte.misesEncaissees, attente);
  // Tant que la mise du jour peut encore être annulée sur cette carte, le cycle
  // n'est pas vraiment terminé : un appui peut encore la retirer. Proposer
  // « Aller au retrait » à cet instant rendrait de l'argent sur un dépôt qui
  // peut disparaître.
  const miseEnSursisSurCetteCarte =
    attente !== null && attente.carteId === carte.id && !attente.envoyee;
  const complete = misesCourantes >= MISES_PAR_CYCLE && !miseEnSursisSurCetteCarte;
  const solde = formatMontant(soldeRestituable(misesCourantes, carte.mise));
  /** Ce qui, sur la carte regardée, n'a pas encore quitté le téléphone (§8.3). */
  const attenteCarte = phraseAttenteCarte(enAttenteSurCarte(operations, carte.id));

  function rendreAction(item: CarteItem, choisie: boolean) {
    const trouvee = actives.find(({ carte: c }) => c.id === item.id);
    if (!trouvee) return null;
    const { carte: c } = trouvee;

    // Le bandeau passe avant le choix : une mise qui attend doit rester sous les
    // yeux même quand on est allé regarder la carte d'à côté. C'est la seule
    // chose qu'une carte non choisie ait le droit de montrer.
    if (attente && attente.carteId === c.id) {
      return (
        <BandeauSursis
          attente={attente}
          restant={restant}
          onAnnuler={() => void annuler()}
          onReessayer={reessayer}
        />
      );
    }

    // La commande d'argent, elle, ne sort que sur la carte choisie : deux
    // boutons visibles ensemble, et se tromper de cycle redevient possible.
    if (!choisie) return null;

    // Une carte au bout de son cycle ne s'encaisse plus : les deux portes de
    // fin de cycle vivent sous la rangée, où elles ont la place de s'expliquer.
    if (misesAffichees(c.id, c.misesEncaissees, attente) >= MISES_PAR_CYCLE) return null;

    return (
      <button
        type="button"
        // Le nom accessible porte le montant en toutes lettres, quelle que soit
        // la largeur : à 160 px le libellé se raccourcit, la mise annoncée non.
        aria-label={`Encaisser ${formatMontant(c.mise)} FCFA`}
        disabled={occupe}
        onClick={() => void encaisser(c)}
        className="anim-pression w-full min-h-11 px-4 rounded-md bg-primary text-primary-foreground border border-primary font-body font-semibold text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 @max-[240px]:min-h-11 @max-[240px]:px-2 @max-[240px]:text-xs @max-[240px]:gap-1"
      >
        <Icone nom="circle-dollar-sign" taille={16} />
        <span aria-hidden="true" className="@max-[240px]:hidden">
          Encaisser {formatMontant(c.mise)} FCFA
        </span>
        <span aria-hidden="true" className="hidden @max-[240px]:inline">
          Encaisser
        </span>
      </button>
    );
  }

  return (
    <section>
      <p className="font-headings font-bold text-base text-ink mb-2">
        {actives.length > 1 ? 'Cartes en cours' : 'Carte en cours'}
      </p>

      <CarrouselCartes
        cartes={actives.map(({ carte: c, cycle: rang }) => {
          const affichees = misesAffichees(c.id, c.misesEncaissees, attente);
          return {
            id: c.id,
            nomClient,
            misePar: formatMontant(c.mise),
            jourCourant: affichees,
            solde: formatMontant(soldeRestituable(affichees, c.mise)),
            cycle: String(rang),
          };
        })}
        visibleId={courant.carte.id}
        onVisible={onVisible}
        rendreAction={rendreAction}
      />

      {/* « Pas encore envoyée » sur la carte regardée (§8.3). C'est aussi ce qui
          dit pourquoi le retrait attend. */}
      {attenteCarte && (
        <p className="font-body text-xs font-medium text-info mt-2 mb-0">{attenteCarte}</p>
      )}

      {complete && (
        <div className="bg-positive-tint rounded-md p-3 mt-3 space-y-3">
          <div>
            <p className="font-body text-sm text-ink m-0">
              Cycle terminé — {MISES_PAR_CYCLE} mises sur {MISES_PAR_CYCLE}.
            </p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Tu peux lui rendre ses {solde} FCFA, ou lui activer une carte de plus juste en
              dessous. Tant qu'il n'y a pas de retrait, cette carte reste ouverte et son solde lui
              est dû.
            </p>
          </div>
          <Bouton
            variante="contour"
            icone="arrow-up-right"
            // La clôture recalcule au serveur ce qui est rendu : tant qu'une
            // opération de la carte est sur le téléphone, ce calcul en manquerait
            // une (§7). Et elle exige le réseau.
            disabled={attenteCarte !== null || !enLigne}
            onClick={() => onRetrait(nomClient)}
          >
            Aller au retrait
          </Bouton>
          {attenteCarte === null && !enLigne && (
            <p className="font-body text-xs text-muted-foreground m-0">
              Le retrait demande le réseau.
            </p>
          )}
        </div>
      )}

      {/* Hors du panneau de fin de cycle, et sans condition d'avancement.
          `cartes_multiples` nomme deux besoins, pas un : « un client épargne
          pour deux choses à deux rythmes » autant que « un client qui a rempli
          sa carte veut continuer ». Ouvrir une carte passe par la file : le
          geste reste permis hors ligne (§1.2).

          La mise préremplie est celle de la carte regardée au moment où ce bloc
          est monté, et elle ne suit pas le carrousel ensuite : `ActiverCarte`
          la lit dans un `useState` initial. C'est délibéré — la remonter à
          chaque défilement effacerait une saisie en cours. */}
      <div className="mt-3">
        <ActiverCarte
          collecteurId={collecteurId}
          clientId={clientId}
          misePreremplie={carte.mise}
          identifiant={`fiche-${carte.id}`}
          onOuverte={onEcriture}
        />
      </div>
    </section>
  );
}

/**
 * Ce que la carte porte pendant les six secondes — et après, si l'écriture a
 * échoué.
 *
 * Le décompte est marqué `aria-hidden` : un nom accessible qui change chaque
 * seconde rendrait le bouton introuvable pour qui le cherche par son nom, et
 * bavard pour qui l'écoute.
 */
function BandeauSursis({
  attente,
  restant,
  onAnnuler,
  onReessayer,
}: {
  attente: EnAttente;
  restant: number;
  onAnnuler: () => void;
  onReessayer: () => void;
}) {
  if (attente.echec) {
    return (
      <div className="rounded-md bg-negative-tint border border-negative/30 p-2 @max-[240px]:p-1.5">
        <p
          role="alert"
          className="font-body text-xs font-semibold text-negative m-0 @max-[240px]:text-[10px]"
        >
          {attente.echec}
        </p>
        <button
          type="button"
          onClick={onReessayer}
          className="anim-pression mt-1.5 w-full min-h-11 rounded-md border border-negative/40 text-negative font-body text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Icone nom="refresh-cw" taille={14} />
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-positive-tint border border-positive/30 p-2 flex items-center justify-between gap-2 @max-[240px]:p-1.5 @max-[240px]:gap-1">
      <span
        role="status"
        className="flex items-center gap-1.5 min-w-0 font-body text-xs font-semibold text-positive @max-[240px]:text-[10px]"
      >
        <Icone nom="check-circle" taille={14} className="shrink-0" />
        <span className="truncate">{formatMontant(attente.mise)} FCFA encaissé</span>
      </span>
      {!attente.envoyee && (
        <button
          type="button"
          onClick={onAnnuler}
          className="anim-pression shrink-0 min-h-11 px-3 rounded-md border border-positive/40 text-positive font-body text-xs font-semibold cursor-pointer @max-[240px]:px-2"
        >
          Annuler{' '}
          <span aria-hidden="true" className="tabular-nums opacity-70">
            {restant} s
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * L'ouverture d'une carte pour un client qui n'en a pas d'active.
 *
 * Le montant se compose : c'est le moment où le collecteur et le client
 * conviennent d'une somme, et elle n'est pas forcément l'un des cinq paliers.
 */
function NouvelleCarte({
  clientId,
  collecteurId,
  premiere,
  onOuverte,
}: {
  clientId: string;
  /** Donné, jamais relu ici : voir la propriété de même nom sur `FicheClient`. */
  collecteurId: string | null;
  premiere: boolean;
  onOuverte: () => void;
}) {
  const estCollaborateur = useEstCollaborateur();
  const [mise, setMise] = useState<number | null>(1000);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ouvrir() {
    if (!collecteurId || mise === null) return;
    setEnvoi(true);
    setErreur(null);
    const resultat = await ouvrirCarte(collecteurId, clientId, mise);
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    onOuverte();
  }

  return (
    <section className="border border-hairline rounded-lg p-4">
      <p className="font-headings font-bold text-base text-ink m-0">
        {premiere ? 'Ouvrir sa première carte' : 'Ouvrir une nouvelle carte'}
      </p>
      <p className="font-body text-sm text-muted-foreground mt-1 mb-3">
        {premiere
          ? 'Ce client est inscrit mais n’a pas encore de carte.'
          : 'Sa carte précédente est clôturée. Il peut reprendre, au même montant ou à un autre.'}
      </p>

      <ChoixMise
        mise={mise}
        onChoisir={setMise}
        identifiant={`carte-${clientId}`}
        estCollaborateur={estCollaborateur}
      />

      {erreur && (
        <p role="alert" className="font-body text-sm text-negative mt-3">
          {erreur}
        </p>
      )}

      <Bouton
        pleineLargeur
        icone="plus"
        className="mt-3"
        disabled={envoi || collecteurId === null || mise === null}
        onClick={() => void ouvrir()}
      >
        {envoi ? 'Ouverture…' : 'Ouvrir la carte'}
      </Bouton>
    </section>
  );
}

/** Les cartes précédentes. Un client qui en a tenu quatre l'a mérité. */
function Historique({ cartes }: { cartes: Fiche['cartes'] }) {
  const passees = cartes.filter((k) => k.statut === 'cloturee');
  if (passees.length === 0) return null;

  return (
    <section>
      <p className="font-headings font-bold text-base text-ink mb-2">
        Cartes précédentes ({passees.length})
      </p>
      <div className="flex flex-col gap-2">
        {passees.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between gap-3 bg-canvas rounded-md px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block font-body text-sm text-ink tabular-nums">
                {formatMontant(k.mise)} FCFA · {k.misesEncaissees}/{MISES_PAR_CYCLE}
              </span>
              <span className="block font-body text-xs text-muted-foreground">
                {new Date(k.ouverteLe).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {k.clotureeLe &&
                  ` → ${new Date(k.clotureeLe).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}`}
              </span>
            </span>
            {/* Pilule dessinée à la main jusqu'au 2026-09-10, avec ses propres
                classes et ses propres mots — « Cycle tenu », « Rendue avant la
                fin ». Ni l'un ni l'autre n'est dans l'union `Statut`, et la
                règle 4.11 du système de design dit « une seule table ». La
                nuance que « Rendue avant la fin » portait est déjà dite à deux
                centimètres de là, par le compte X/31. */}
            <BadgeStatut
              statut={k.misesEncaissees >= MISES_PAR_CYCLE ? 'Cycle terminé' : 'Clôturée'}
              className="px-2.5 py-1 shrink-0"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

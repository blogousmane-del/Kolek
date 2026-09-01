import { MISES_PAR_CYCLE, formatMontant, soldeRestituable } from '@kolek/core';
import { Bouton, CarrouselCartes, Feuille, Icone, LigneTransaction, type CarteItem } from '@kolek/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { definirConsentementAvis, enregistrerMise, ouvrirCarte } from '../ecritures';
import {
  estRattrapee,
  misesAffichees,
  SURSIS_MS,
  SURSIS_S,
  type EnAttente,
} from '../encaissement-differe';
import { chargerFicheClient, type CarteFiche, type FicheClient as Fiche } from '../lectures-ecrans';
import { ActiverCarte } from './ActiverCarte';
import { ChoixMise } from './ChoixMise';

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
  // dans son propre `useState`. `CartesEnCours` démonte et remonte à chaque
  // relecture réussie : l'effet ci-dessous fait passer `fiche` par `null`
  // avant de relire, ce qui emporte tout `{fiche && (…)}`. Un `useState` posé
  // plus bas s'y réinitialiserait sur `actives[0]` — la carte la plus avancée
  // — à chaque encaissement, exactement le défaut que ce bouton devait faire
  // disparaître, simplement relogé un niveau plus bas.
  const [visibleId, setVisibleId] = useState<string | null>(null);

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
    // La fiche précédente est effacée avant la lecture : sans ça, ouvrir un
    // second client montre un instant les chiffres du premier — et un solde
    // qui appartient à quelqu'un d'autre est la pire chose à afficher ici.
    setFiche(null);
    setErreur(null);
    void relire();
  }, [relire, revision]);

  useEffect(() => {
    // Seul le changement de client remet la carte choisie à zéro : une
    // relecture (donc un changement de `revision`) ne doit jamais la faire
    // bouger — c'est justement ce que l'effet précédent provoque en
    // interne, sans que le collecteur ait rien décidé.
    setVisibleId(null);
  }, [clientId]);

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
          <Coordonnees fiche={fiche} onChange={onEcriture} onRelire={relire} />

          {actives.length > 0 ? (
            <CartesEnCours
              actives={actives}
              nomClient={fiche.nom}
              clientId={fiche.id}
              collecteurId={collecteurId}
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

          {fiche.cartes.length > 1 && <Historique cartes={fiche.cartes} />}

          {fiche.mises.length > 0 && (
            <section>
              <p className="font-headings font-bold text-base text-ink mb-2">Derniers versements</p>
              <div className="rounded-lg border border-hairline overflow-hidden">
                {fiche.mises.slice(0, 8).map((m, i, liste) => (
                  <LigneTransaction
                    key={m.id}
                    nom={m.estCommission ? 'Commission' : 'Mise'}
                    meta={new Date(m.encaisseLe).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
  onChange,
  onRelire,
}: {
  fiche: Fiche;
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
          <Bouton onClick={() => void poser(true)} disabled={envoi}>
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
        disabled={envoi}
        aria-pressed={fiche.avisActifs}
        onClick={() => (fiche.avisActifs ? void poser(false) : setDemande(true))}
        className="anim-pression px-3 py-1.5 rounded-pill border border-hairline text-ink text-xs font-body font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40"
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
 * L'appui remplit la case à l'écran et n'écrit rien ; l'insertion part six
 * secondes plus tard, et « Annuler » l'empêche jusque-là.
 *
 * Fermer la fiche ou passer l'application en arrière-plan ne perd pas la mise :
 * elle part tout de suite. Le décompte n'a plus de témoin, et le système peut
 * tuer une application masquée sans prévenir.
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
  onRetrait,
  onEcriture,
  visibleId,
  onVisible,
}: {
  actives: Array<{ carte: CarteFiche; cycle: number }>;
  nomClient: string;
  clientId: string;
  collecteurId: string | null;
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

  const enCours = useRef<EnAttente | null>(null);
  const sursis = useRef<number | null>(null);
  const decompte = useRef<number | null>(null);
  // Après le démontage, les références restent utiles — l'écriture en cours
  // les lit — mais l'état ne peut plus rien afficher. React avertit sur une
  // pose d'état après démontage ; ici elle serait en plus sans effet.
  const monte = useRef(true);

  // Le contexte d'écriture suit chaque rendu, pour la même raison que
  // l'attente : la purge part d'endroits qui ne referment rien.
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

  async function ecrire(en: EnAttente) {
    const { collecteurId: id, onEcriture: prevenir } = contexte.current;
    if (!id) {
      // Sans identifiant de collecteur, rien ne peut partir. Le dire, plutôt
      // que de laisser un bandeau vert sur une écriture qui n'aura pas lieu.
      poser({
        ...en,
        envoyee: true,
        echec: 'Session perdue. Reconnecte-toi avant de réessayer.',
      });
      return;
    }
    // Le `try` ne couvre que l'appel réseau, pas `prevenir()` : ce dernier est
    // le rappel du composant appelant, et un rejet synchrone qui y prendrait
    // naissance n'a rien à voir avec l'écriture, qui a réussi. Le laisser dans
    // le `try` le ferait atterrir dans le `catch` ci-dessous et afficher
    // « Réponse perdue » sur une mise pourtant enregistrée — avec un
    // « Réessayer » qui l'insérerait une seconde fois, irréversiblement. Même
    // découpage que le try/catch d'`ActiverCarte`.
    let resultat;
    try {
      resultat = await enregistrerMise(id, en.carteId, en.mise);
    } catch {
      // `enregistrerMise` rend `{ ok: false }` sur les refus du serveur, mais
      // une coupure franche fait **rejeter** la promesse. Sans ce filet, le
      // bandeau reste vert et figé : « Annuler » a disparu — la mise est
      // peut-être partie — et « Réessayer » n'apparaît jamais. Aucune sortie.
      //
      // Le message ne promet rien, parce que l'écriture a pu aboutir avant que
      // la réponse ne se perde. Même prudence, et presque les mêmes mots, que
      // le try/catch d'`ActiverCarte`.
      poser({
        ...en,
        envoyee: true,
        echec: 'Réponse perdue. Vérifie la carte avant de réessayer.',
      });
      return;
    }
    if (resultat.ok) {
      // L'attente n'est pas levée ici : la relecture s'en charge. La lever
      // maintenant reviderait la case le temps que la fiche revienne.
      prevenir();
      return;
    }
    poser({ ...en, envoyee: true, echec: resultat.echec.message });
  }

  /** Écrit tout de suite ce qui attendait, et rend les minuteurs au repos. */
  function purger() {
    arreter();
    const en = enCours.current;
    if (!en) return;
    // Déjà partie et sans échec : la relecture s'en occupe. La renvoyer
    // écrirait la mise une seconde fois, et rien ne la retirerait.
    if (en.envoyee && !en.echec) return;
    const repris: EnAttente = { ...en, envoyee: true, echec: undefined };
    poser(repris);
    void ecrire(repris);
  }

  function encaisser(carte: CarteFiche) {
    // Un second appui pendant un décompte fait partir le premier. Deux mises
    // le même jour sur la même carte sont acceptées par le serveur ; ce n'est
    // pas à cet écran de les interdire, seulement de ne pas les perdre.
    purger();

    const en: EnAttente = {
      carteId: carte.id,
      mise: carte.mise,
      base: carte.misesEncaissees,
      envoyee: false,
    };

    if (!contexte.current.collecteurId) {
      // Sans identifiant de collecteur, rien ne partira jamais : `ecrire` le
      // découvre déjà, mais seulement six secondes plus tard. Sur une session
      // qu'on sait morte d'avance, faire attendre le décompte à chaque appui
      // n'apprend rien de plus — le dire tout de suite. Le garde-fou dans
      // `ecrire` reste en place : `purger` et `reessayer` l'atteignent par
      // d'autres chemins que celui-ci.
      poser({ ...en, envoyee: true, echec: 'Session perdue. Reconnecte-toi avant de réessayer.' });
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
      const partie: EnAttente = { ...en, envoyee: true };
      poser(partie);
      void ecrire(partie);
    }, SURSIS_MS);
  }

  function annuler() {
    arreter();
    poser(null);
  }

  function reessayer() {
    const en = enCours.current;
    if (!en) return;
    const repris: EnAttente = { ...en, envoyee: true, echec: undefined };
    poser(repris);
    void ecrire(repris);
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
      // L'application passe en arrière-plan : le sursis n'a plus de témoin, et
      // le système peut la tuer sans prévenir. Ce qui attendait part maintenant.
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
    if (reelles === null || estRattrapee(reelles, attente)) poser(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attente, reelles]);

  const courant = actives.find(({ carte }) => carte.id === visibleId) ?? actives[0];
  const { carte } = courant;
  const misesCourantes = misesAffichees(carte.id, carte.misesEncaissees, attente);
  // Tant que la mise du jour peut encore être annulée sur cette carte, le
  // cycle n'est pas vraiment terminé : rien n'est inscrit en base. Proposer
  // « Aller au retrait » à cet instant rendrait de l'argent sur un dépôt qui
  // n'existe pas encore — et « Aller au retrait » démonte cette section, ce
  // qui purge et commet la mise avant la fin des six secondes, en silence.
  const miseEnSursisSurCetteCarte =
    attente !== null && attente.carteId === carte.id && !attente.envoyee;
  const complete = misesCourantes >= MISES_PAR_CYCLE && !miseEnSursisSurCetteCarte;
  const solde = formatMontant(soldeRestituable(misesCourantes, carte.mise));

  function rendreAction(item: CarteItem, choisie: boolean) {
    const trouvee = actives.find(({ carte: c }) => c.id === item.id);
    if (!trouvee) return null;
    const { carte: c } = trouvee;

    // Le bandeau passe avant le choix : une mise qui part doit rester sous les
    // yeux même quand on est allé regarder la carte d'à côté. C'est la seule
    // chose qu'une carte non choisie ait le droit de montrer.
    if (attente && attente.carteId === c.id) {
      return (
        <BandeauSursis
          attente={attente}
          restant={restant}
          onAnnuler={annuler}
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
        onClick={() => encaisser(c)}
        className="anim-pression w-full min-h-11 px-4 rounded-md bg-primary text-primary-foreground border border-primary font-body font-semibold text-base flex items-center justify-center gap-2 cursor-pointer @max-[240px]:min-h-11 @max-[240px]:px-2 @max-[240px]:text-xs @max-[240px]:gap-1"
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

      {complete && (
        <div className="bg-positive-tint rounded-md p-3 mt-3 space-y-3">
          <div>
            <p className="font-body text-sm text-ink m-0">
              Cycle terminé — {MISES_PAR_CYCLE} mises sur {MISES_PAR_CYCLE}.
            </p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Tu peux lui rendre ses {solde} FCFA, ou lui activer une carte de plus. Tant qu'il n'y
              a pas de retrait, cette carte reste ouverte et son solde lui est dû.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Bouton variante="contour" icone="arrow-up-right" onClick={() => onRetrait(nomClient)}>
              Aller au retrait
            </Bouton>
            <ActiverCarte
              collecteurId={collecteurId}
              clientId={clientId}
              misePreremplie={carte.mise}
              identifiant={`fiche-${carte.id}`}
              onOuverte={onEcriture}
            />
          </div>
        </div>
      )}
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
          className="anim-pression shrink-0 min-h-11 px-3 rounded-pill border border-positive/40 text-positive font-body text-xs font-semibold cursor-pointer @max-[240px]:px-2"
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
  const [mise, setMise] = useState(1000);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ouvrir() {
    if (!collecteurId) return;
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

      <ChoixMise mise={mise} onChoisir={setMise} identifiant={`carte-${clientId}`} />

      {erreur && (
        <p role="alert" className="font-body text-sm text-negative mt-3">
          {erreur}
        </p>
      )}

      <Bouton
        pleineLargeur
        icone="plus"
        className="mt-3"
        disabled={envoi || collecteurId === null}
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
            <span
              className={`px-2.5 py-1 rounded-pill text-xs font-body font-semibold whitespace-nowrap shrink-0 ${
                k.misesEncaissees >= MISES_PAR_CYCLE
                  ? 'bg-positive-tint text-positive'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {k.misesEncaissees >= MISES_PAR_CYCLE ? 'Cycle tenu' : 'Rendue avant la fin'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

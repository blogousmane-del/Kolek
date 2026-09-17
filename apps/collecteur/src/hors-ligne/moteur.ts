import type { SupabaseClient } from '@supabase/supabase-js';

import type { Operation, ProfilLocal, RefusLocal, Tournee } from './modele';
import { creerPlanificateur, type Planificateur } from './planificateur';
import { rafraichir } from './rafraichir';
import {
  compterFile,
  demanderPersistance,
  effacerDonneesDeTournee,
  lireProfil,
  lireRefus,
  lireTournee,
  ouvrirBase,
  type EtatStockage,
} from './stockage-local';
import { passe, verifierSession, type BilanPasse } from './synchroniseur';

/**
 * Le moteur du hors-ligne, pour le collecteur connecté.
 *
 * Un seul à la fois : `demarrerMoteur` arrête le précédent. Il porte ce que les
 * écrans et les écritures partagent sans se passer de propriétés — le
 * collecteur courant, l'avis « quelque chose a changé », et la demande de
 * passe après un geste.
 *
 * **Deux onglets.** `navigator.locks` garantit qu'un seul envoie. Là où l'API
 * manque, deux passes simultanées restent inoffensives : chaque envoi est
 * idempotent par identifiant, et chaque conclusion relit (§5.2). Dans une même
 * page, un verrou tenu en mémoire les sépare quand même.
 */

type Ecouteur = () => void;

const ecouteurs = new Set<Ecouteur>();
let courant: { collecteurId: string; planificateur: Planificateur; arreter: () => void } | null = null;
let stockage: EtatStockage = 'inconnu';
let dernier: BilanPasse | null = null;
/** Combien de fois la tournée de chaque collecteur a été effacée dans cette page. */
const effacements = new Map<string, number>();

export function ecouterChangements(ecouteur: Ecouteur): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

export function signalerChangement(): void {
  for (const ecouteur of [...ecouteurs]) {
    try {
      ecouteur();
    } catch (e) {
      // Un écran qui lève ne prive pas les autres de l'avis.
      console.error(e);
    }
  }
}

export function collecteurCourant(): string | null {
  return courant?.collecteurId ?? null;
}

export function etatDuStockage(): EtatStockage {
  return stockage;
}

export function dernierBilan(): BilanPasse | null {
  return dernier;
}

/** Les verrous tenus dans cette page, là où `navigator.locks` manque. */
const tenusIci = new Set<string>();

export async function sousVerrou<T>(
  nom: string,
  travail: () => Promise<T>,
  siOccupe: () => T,
): Promise<T> {
  const verrous =
    typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;
  if (!verrous) {
    // Sans l'API, deux onglets ne se voient pas. Dans cette page, au moins, deux
    // moteurs — un redémarrage pendant un tour — ne s'entrecroisent pas.
    if (tenusIci.has(nom)) return siOccupe();
    tenusIci.add(nom);
    try {
      return await travail();
    } finally {
      tenusIci.delete(nom);
    }
  }
  return verrous.request(nom, { ifAvailable: true }, (verrou) => (verrou ? travail() : siOccupe()));
}

export function demarrerMoteur(client: SupabaseClient, collecteurId: string): () => void {
  arreterMoteur();
  const verrou = `kolek-synchro-${collecteurId}`;

  const planificateur = creerPlanificateur(
    {
      passe: () =>
        sousVerrou(
          verrou,
          async () =>
            passe({
              client,
              base: await ouvrirBase(collecteurId),
              collecteurId,
              // Le bandeau décroît pendant la passe, et non d’un coup à la fin.
              // Le rappel de fin, plus bas, reste : il porte aussi le
              // rechargement de tournée, que celui-ci ne couvre pas.
              surProgres: signalerChangement,
            }),
          // Un autre onglet envoie : on repassera dans trente secondes.
          () => ({ etat: 'attente' as const, reveil: Date.now() + 30_000, traitees: 0 }),
        ),
      rafraichir: () =>
        sousVerrou(
          verrou,
          async () => {
            // Chaque lecture lit la session avant `fetch`, sans délai : une
            // session qui pend tiendrait le verrou. Bornée ici comme dans la
            // passe (décision de l'exploitant, 2026-09-14) ; sans session sûre,
            // rien ne se relit, et la demande reste due.
            if ((await verifierSession(client, collecteurId)) !== 'ok') return 'impossible' as const;
            const avant = effacements.get(collecteurId) ?? 0;
            const base = await ouvrirBase(collecteurId);
            const issue = await rafraichir(client, base, collecteurId);
            // La session a pris fin pendant le rechargement : l'effacement est
            // passé avant cette écriture, et la tournée est revenue. On efface de
            // nouveau. Un rechargement lancé après la fin de session, lui, ne peut
            // rien écrire : sans session, la fiche du collecteur est illisible.
            if ((effacements.get(collecteurId) ?? 0) !== avant) {
              await effacerDonneesDeTournee(base);
              return 'impossible' as const;
            }
            return issue;
          },
          () => 'impossible' as const,
        ),
    },
    (bilan, rafraichie) => {
      dernier = bilan;
      if (bilan.traitees > 0 || rafraichie) signalerChangement();
    },
  );

  const surReseau = () => {
    void planificateur.demander({ rafraichir: true });
  };
  const surVisibilite = () => {
    if (document.visibilityState === 'visible') void planificateur.demander({ rafraichir: true });
  };
  window.addEventListener('online', surReseau);
  document.addEventListener('visibilitychange', surVisibilite);

  const arreter = () => {
    window.removeEventListener('online', surReseau);
    document.removeEventListener('visibilitychange', surVisibilite);
    planificateur.arreter();
    if (courant?.planificateur === planificateur) courant = null;
  };
  courant = { collecteurId, planificateur, arreter };

  void demanderPersistance().then((etat) => {
    stockage = etat;
    signalerChangement();
  });
  void planificateur.demander({ rafraichir: true });

  return arreter;
}

export function arreterMoteur(): void {
  courant?.arreter();
}

/** Après un geste : les écrans relisent, et la file part au plus tôt. */
export function apresGeste(): void {
  signalerChangement();
  void courant?.planificateur.demander();
}

/** Après un geste resté en ligne — clôture, correction, consentement : la tournée se relit. */
export function demanderRafraichissement(): void {
  void courant?.planificateur.demander({ rafraichir: true });
}

/** Tout ce que les écrans de collecte lisent, pour le collecteur connecté. */
export async function lectureCourante(): Promise<{
  tournee: Tournee;
  operations: Operation[];
  refus: RefusLocal[];
  profil: ProfilLocal | null;
}> {
  const id = collecteurCourant();
  if (!id) throw new Error('Aucun collecteur connecté.');
  const base = await ouvrirBase(id);
  const [{ tournee, operations }, refus, profil] = await Promise.all([
    lireTournee(base),
    lireRefus(base),
    lireProfil(base),
  ]);
  return { tournee, operations, refus, profil };
}

/** `null` quand la base ne peut pas être lue : on ne déconnecte pas sur un doute. */
export async function compterFileDe(collecteurId: string): Promise<number | null> {
  try {
    return await compterFile(await ouvrirBase(collecteurId));
  } catch {
    return null;
  }
}

export async function effacerTourneeDe(collecteurId: string): Promise<void> {
  // Noté avant tout : un rechargement en vol saura qu'il doit effacer après lui.
  effacements.set(collecteurId, (effacements.get(collecteurId) ?? 0) + 1);
  try {
    await effacerDonneesDeTournee(await ouvrirBase(collecteurId));
  } catch {
    // Base illisible : il n'y a rien à effacer qu'on puisse atteindre. Le
    // prochain rafraîchissement remplacera la tournée de toute façon.
  }
}

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
import { passe, type BilanPasse } from './synchroniseur';

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
 * idempotent par identifiant, et chaque conclusion relit (§5.2).
 */

type Ecouteur = () => void;

const ecouteurs = new Set<Ecouteur>();
let courant: { collecteurId: string; planificateur: Planificateur; arreter: () => void } | null = null;
let stockage: EtatStockage = 'inconnu';
let dernier: BilanPasse | null = null;

export function ecouterChangements(ecouteur: Ecouteur): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

export function signalerChangement(): void {
  for (const ecouteur of [...ecouteurs]) ecouteur();
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

export async function sousVerrou<T>(
  nom: string,
  travail: () => Promise<T>,
  siOccupe: () => T,
): Promise<T> {
  const verrous =
    typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;
  if (!verrous) return travail();
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
          async () => passe({ client, base: await ouvrirBase(collecteurId), collecteurId }),
          // Un autre onglet envoie : on repassera dans trente secondes.
          () => ({ etat: 'attente' as const, reveil: Date.now() + 30_000, traitees: 0 }),
        ),
      rafraichir: () =>
        sousVerrou(
          verrou,
          async () => rafraichir(client, await ouvrirBase(collecteurId), collecteurId),
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
  try {
    await effacerDonneesDeTournee(await ouvrirBase(collecteurId));
  } catch {
    // Base illisible : il n'y a rien à effacer qu'on puisse atteindre. Le
    // prochain rafraîchissement remplacera la tournée de toute façon.
  }
}

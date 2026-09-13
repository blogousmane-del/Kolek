import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import { reappliquer } from './appliquer';
import {
  tourneeVide,
  type Operation,
  type ProfilLocal,
  type RefusLocal,
  type Tournee,
} from './modele';

/**
 * Le disque du téléphone : ouvrir, lire, compter, effacer. Aucune règle métier.
 *
 * ## Une base par collecteur
 *
 * Deux collecteurs se relaient parfois sur un même téléphone. Chacun a sa base,
 * `kolek-collecteur-<id>`, et le code n'ouvre jamais que celle de la session.
 * C'est plus sûr qu'un filtre : une requête oubliée ne peut pas lire les
 * opérations d'un autre, puisqu'elles ne sont pas dans la base ouverte.
 *
 * ## Pourquoi le disque, alors que `cache.ts` s'y refusait
 *
 * Décision de l'exploitant du 2026-09-13, spec §5.1 : le hors-ligne l'exige, et
 * la tournée s'efface à la déconnexion. La file, elle, reste : c'est de
 * l'argent qui n'est pas encore arrivé.
 */

export const PREFIXE_BASE = 'kolek-collecteur-';

/** Le numéro du schéma local. On ne modifie jamais une version publiée : on en ajoute une. */
export const VERSION_BASE = 1;

export const CLE_INSTANTANE = 'instantane';
export const CLE_PROFIL = 'profil';

export interface SchemaKolek extends DBSchema {
  file: { key: string; value: Operation; indexes: { par_sequence: number } };
  tournee: { key: string; value: Tournee };
  profil: { key: string; value: ProfilLocal };
  refus: { key: string; value: RefusLocal };
}

export type BaseLocale = IDBPDatabase<SchemaKolek>;

export function nomBase(collecteurId: string): string {
  return `${PREFIXE_BASE}${collecteurId}`;
}

/**
 * Le travail d'une transaction, et sa fin, attendus ensemble.
 *
 * `tx.done` rejette quand la transaction avorte — une contrainte violée, un
 * disque plein. Attendre le travail seul laisserait ce rejet sans preneur, et
 * attendre `tx.done` seul laisserait passer l'erreur du travail. `Promise.all`
 * prend les deux : le premier échec remonte, l'autre est tenu.
 */
export async function dans<T>(tx: { done: Promise<void> }, travail: () => Promise<T>): Promise<T> {
  const [resultat] = await Promise.all([travail(), tx.done]);
  return resultat;
}

const ouvertes = new Map<string, Promise<BaseLocale>>();

/**
 * Ouvre la base du collecteur, une fois par collecteur pour toute la session.
 *
 * `blocking` : une version plus récente de l'application, dans un autre onglet,
 * demande à faire monter le schéma. On ferme pour ne pas la bloquer ; le
 * prochain appel rouvre à la nouvelle version.
 */
export function ouvrirBase(collecteurId: string): Promise<BaseLocale> {
  const deja = ouvertes.get(collecteurId);
  if (deja) return deja;

  const ouverture: Promise<BaseLocale> = openDB<SchemaKolek>(nomBase(collecteurId), VERSION_BASE, {
    upgrade(db, ancienne) {
      if (ancienne < 1) {
        db.createObjectStore('file', { keyPath: 'id' }).createIndex('par_sequence', 'sequence', {
          unique: true,
        });
        db.createObjectStore('tournee');
        db.createObjectStore('profil');
        db.createObjectStore('refus', { keyPath: 'id' });
      }
    },
    blocking() {
      ouvertes.delete(collecteurId);
      void ouverture.then((base) => base.close());
    },
    terminated() {
      ouvertes.delete(collecteurId);
    },
  });

  ouvertes.set(collecteurId, ouverture);
  // Une ouverture ratée ne doit pas rester en mémoire : le prochain appel réessaie.
  void ouverture.catch(() => ouvertes.delete(collecteurId));
  return ouverture;
}

/** Ferme tout. Sert aux épreuves, qui simulent ainsi un rechargement de la page. */
export async function fermerBases(): Promise<void> {
  const toutes = [...ouvertes.values()];
  ouvertes.clear();
  for (const ouverture of toutes) {
    const base = await ouverture.catch(() => null);
    base?.close();
  }
}

export function lireOperations(base: BaseLocale): Promise<Operation[]> {
  return base.getAllFromIndex('file', 'par_sequence');
}

/** La tournée que l'écran montre, et la file qui y a été réappliquée — lues ensemble. */
export async function lireTournee(
  base: BaseLocale,
): Promise<{ tournee: Tournee; operations: Operation[] }> {
  const tx = base.transaction(['tournee', 'file'], 'readonly');
  const [instantane, operations] = await dans(tx, () =>
    Promise.all([
      tx.objectStore('tournee').get(CLE_INSTANTANE),
      tx.objectStore('file').index('par_sequence').getAll(),
    ]),
  );
  return { tournee: reappliquer(instantane ?? tourneeVide(), operations), operations };
}

export async function lireProfil(base: BaseLocale): Promise<ProfilLocal | null> {
  return (await base.get('profil', CLE_PROFIL)) ?? null;
}

export function lireRefus(base: BaseLocale): Promise<RefusLocal[]> {
  return base.getAll('refus');
}

export function compterFile(base: BaseLocale): Promise<number> {
  return base.count('file');
}

/** Change l'instantané après un geste resté en ligne — une clôture, une correction. */
export async function modifierInstantane(
  base: BaseLocale,
  modifier: (t: Tournee) => void,
): Promise<void> {
  const tx = base.transaction('tournee', 'readwrite');
  await dans(tx, async () => {
    const t = (await tx.store.get(CLE_INSTANTANE)) ?? tourneeVide();
    modifier(t);
    await tx.store.put(t, CLE_INSTANTANE);
  });
}

/** La déconnexion : tournée, profil et copie des refus. La file n'est jamais touchée ici. */
export async function effacerDonneesDeTournee(base: BaseLocale): Promise<void> {
  const tx = base.transaction(['tournee', 'profil', 'refus'], 'readwrite');
  await dans(tx, () =>
    Promise.all([
      tx.objectStore('tournee').clear(),
      tx.objectStore('profil').clear(),
      tx.objectStore('refus').clear(),
    ]),
  );
}

/**
 * Le nombre d'opérations qui attendent sur ce téléphone, tous comptes confondus.
 *
 * Lu avant toute connexion, pour l'écran de connexion (§8.6). `count()` ne lit
 * aucune opération : ni nom, ni montant ne sort d'ici. `null` là où le
 * navigateur ne sait pas lister ses bases — mieux vaut se taire qu'annoncer
 * zéro à tort.
 */
export async function compterOperationsSurCeTelephone(): Promise<number | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
  try {
    let total = 0;
    for (const { name } of await indexedDB.databases()) {
      if (!name?.startsWith(PREFIXE_BASE)) continue;
      // Sans numéro de version : ouvre la base telle qu'elle est, sans la créer
      // ni la faire monter.
      const base = await openDB<SchemaKolek>(name);
      try {
        if (base.objectStoreNames.contains('file')) total += await base.count('file');
      } finally {
        base.close();
      }
    }
    return total;
  } catch {
    return null;
  }
}

export type EtatStockage = 'persistant' | 'non_garanti' | 'inconnu';

/**
 * Demande au navigateur de ne pas vider la base quand la place manque (§4.6).
 *
 * `inconnu` là où l'API manque : on ne prévient pas d'un risque qu'on ne sait
 * pas mesurer.
 */
export async function demanderPersistance(): Promise<EtatStockage> {
  const stockage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (typeof stockage?.persist !== 'function' || typeof stockage.persisted !== 'function') {
    return 'inconnu';
  }
  try {
    if (await stockage.persisted()) return 'persistant';
    return (await stockage.persist()) ? 'persistant' : 'non_garanti';
  } catch {
    return 'inconnu';
  }
}

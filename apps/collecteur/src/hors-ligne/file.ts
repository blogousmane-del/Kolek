import { PHRASES, phraseEcriture, type EchecEcriture } from '../phrases';
import { appliquer, reappliquer } from './appliquer';
import { chargeUtileDe, tourneeVide, type Operation, type Tournee } from './modele';
import { CLE_INSTANTANE, dans, type BaseLocale } from './stockage-local';

/**
 * La file : chaque changement en une transaction, et rien d'autre.
 *
 * ## Un geste est une seule écriture
 *
 * La tournée montrée à l'écran est l'instantané **plus** la file réappliquée
 * (`lireTournee`). Ajouter une opération suffit donc à la montrer : il n'y a pas
 * de seconde écriture à tenir d'accord avec la première, et la garantie §4.1 —
 * « rien n'est fait avant d'être sur le disque » — ne dépend d'aucune
 * discipline. Si l'ajout échoue, rien n'est montré.
 *
 * ## Quitter la file
 *
 * Deux sorties seulement, chacune dans une transaction avec sa conséquence :
 * `retirerAcceptee` applique l'opération à l'instantané en même temps qu'elle la
 * retire ; `retirerEnRefus` en garde la copie dans `refus`. Entre les deux, une
 * coupure laisse l'opération dans la file, jamais nulle part.
 */

export type Construction<O extends Operation> = (
  tournee: Tournee,
  operations: readonly Operation[],
  sequence: number,
) => { ok: true; operation: O } | { ok: false; echec: EchecEcriture };

export type ResultatAjout<O extends Operation> =
  | { ok: true; operation: O }
  | { ok: false; echec: EchecEcriture };

/**
 * IndexedDB lève des `DOMException` : base fermée, transaction avortée, valeur
 * impossible à cloner — et le disque plein, `QuotaExceededError`, sous-interface
 * qui porte sa propre étiquette. `instanceof` reconnaît la famille dans le même
 * domaine d'exécution ; l'étiquette la reconnaît quand l'erreur vient d'un autre
 * (le clone structuré, une épreuve sous jsdom).
 */
function vientDuStockage(e: unknown): boolean {
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) return true;
  return /^\[object (DOMException|QuotaExceededError)\]$/.test(Object.prototype.toString.call(e));
}

/**
 * Vérifie le geste contre la tournée telle que l'écran la montre, et l'ajoute —
 * dans la même transaction, pour qu'aucun autre geste ne se glisse entre les
 * deux.
 */
export async function ajouter<O extends Operation>(
  base: BaseLocale,
  construire: Construction<O>,
): Promise<ResultatAjout<O>> {
  try {
    const tx = base.transaction(['file', 'tournee'], 'readwrite');
    const file = tx.objectStore('file');
    return await dans(tx, async () => {
      const [instantane, operations] = await Promise.all([
        tx.objectStore('tournee').get(CLE_INSTANTANE),
        file.index('par_sequence').getAll(),
      ]);
      const sequence = (operations.at(-1)?.sequence ?? 0) + 1;
      const resultat = construire(
        reappliquer(instantane ?? tourneeVide(), operations),
        operations,
        sequence,
      );
      if (resultat.ok) await file.add(resultat.operation);
      return resultat;
    });
  } catch (e) {
    if (vientDuStockage(e)) {
      // Disque plein, stockage bloqué, base fermée : le geste est refusé à
      // l'écran, jamais montré comme réussi (§4.1).
      return { ok: false, echec: { code: 'STOCKAGE', message: PHRASES.STOCKAGE! } };
    }
    // Un défaut du code, pas du disque : « Libère de la place » enverrait le
    // collecteur vers un remède qui ne marchera pas. Rien n'a été écrit —
    // `dans` a avorté la transaction — et la cause part dans la console.
    console.error(e);
    return { ok: false, echec: phraseEcriture('INCONNU') };
  }
}

/**
 * « Annuler » pendant le sursis (§7). Sans risque : l'opération n'est jamais
 * partie tant que l'heure est avant `envoyableApres`.
 */
export async function annuler(
  base: BaseLocale,
  operationId: string,
  maintenant: number = Date.now(),
): Promise<'annulee' | 'partie' | 'absente'> {
  const tx = base.transaction('file', 'readwrite');
  return dans(tx, async () => {
    const op = await tx.store.get(operationId);
    if (!op) return 'absente' as const;
    if (Date.parse(op.envoyableApres) <= maintenant) return 'partie' as const;
    await tx.store.delete(operationId);
    return 'annulee' as const;
  });
}

/** Fait partir tout de suite une opération encore en sursis : la fiche se ferme, l'application passe en arrière-plan. */
export async function avancer(
  base: BaseLocale,
  operationId: string,
  maintenant: number = Date.now(),
): Promise<void> {
  const tx = base.transaction('file', 'readwrite');
  await dans(tx, async () => {
    const op = await tx.store.get(operationId);
    if (op && Date.parse(op.envoyableApres) > maintenant) {
      await tx.store.put({ ...op, envoyableApres: new Date(maintenant).toISOString() });
    }
  });
}

/** Réécrit une opération encore en file. Ne ressuscite jamais une opération retirée entre-temps. */
export async function mettreAJour(base: BaseLocale, op: Operation): Promise<void> {
  const tx = base.transaction('file', 'readwrite');
  await dans(tx, async () => {
    if (await tx.store.get(op.id)) await tx.store.put(op);
  });
}

/** Le serveur a l'opération : elle quitte la file et entre dans l'instantané, ensemble. */
export async function retirerAcceptee(base: BaseLocale, op: Operation): Promise<void> {
  const tx = base.transaction(['file', 'tournee'], 'readwrite');
  const tournee = tx.objectStore('tournee');
  await dans(tx, async () => {
    const instantane = (await tournee.get(CLE_INSTANTANE)) ?? tourneeVide();
    await tournee.put(appliquer(instantane, op), CLE_INSTANTANE);
    await tx.objectStore('file').delete(op.id);
  });
}

/** Le refus est consigné au serveur : l'opération quitte la file, sa copie reste lisible hors ligne. */
export async function retirerEnRefus(
  base: BaseLocale,
  op: Operation,
  maintenant: number = Date.now(),
): Promise<void> {
  const tx = base.transaction(['file', 'refus'], 'readwrite');
  await dans(tx, async () => {
    await tx.objectStore('refus').put({
      id: op.id,
      motif: op.motif ?? 'INCONNU',
      chargeUtile: chargeUtileDe(op),
      creeLe: new Date(maintenant).toISOString(),
    });
    await tx.objectStore('file').delete(op.id);
  });
}

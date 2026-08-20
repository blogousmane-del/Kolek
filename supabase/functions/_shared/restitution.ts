/**
 * Le partage d'une carte au moment de sa clôture.
 *
 * La règle du métier, cahier des charges §4 : **la première mise de chaque carte
 * est la commission du collecteur.** Le client récupère les autres. Un cycle
 * complet de 31 mises rend donc 30 mises et en laisse une.
 *
 * ## Pourquoi cette formule est écrite deux fois
 *
 * `packages/core/src/calcul.ts` la porte déjà, pour les écrans. Deno ne sait pas
 * importer un paquet de l'espace de travail npm, et engendrer un module comme on
 * le fait pour la grille tarifaire serait lourd pour une multiplication.
 *
 * La duplication est donc assumée — mais pas laissée sans garde-fou :
 * `supabase/tests/restitution.test.ts` importe les deux implémentations et
 * vérifie qu'elles rendent le même chiffre sur tout le domaine. Le jour où l'une
 * bouge sans l'autre, la suite tombe. C'est ce qui distingue une duplication
 * surveillée d'une divergence silencieuse.
 */

/** Reprise de `MISES_PAR_CYCLE` dans `packages/core`. Voir le test de parité. */
export const MISES_PAR_CYCLE = 31;

export interface Partage {
  /** Ce qui revient au client. */
  montantRestitue: number;
  /** Ce qui reste au collecteur. */
  commission: number;
}

/**
 * `misesEncaissees` vient de la base, jamais du client : c'est le compteur que
 * le déclencheur `mises_avant_insert` tient. Le passer depuis le téléphone
 * laisserait un écran périmé décider du montant rendu.
 */
export function partager(misesEncaissees: number, mise: number): Partage {
  if (!Number.isInteger(misesEncaissees) || misesEncaissees < 0) {
    throw new Error('MISES_INVALIDES');
  }
  if (!Number.isInteger(mise) || mise <= 0) {
    throw new Error('MISE_INVALIDE');
  }

  // `max(… , 0)` et non un simple `mises - 1` : une carte ouverte sans aucune
  // mise se clôture légitimement — le client a changé d'avis le jour même — et
  // doit rendre zéro, pas moins que rien.
  return {
    montantRestitue: Math.max(misesEncaissees - 1, 0) * mise,
    commission: Math.min(misesEncaissees, 1) * mise,
  };
}

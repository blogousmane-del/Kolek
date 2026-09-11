import { formatMontant } from '@kolek/core';

/**
 * Les mises en forme partagées par les onglets du Super Admin.
 *
 * Elles vivaient dans `SuperAdmin.tsx`. Elles n'y restent pas : les onglets
 * qui les appellent sont importés par `SuperAdmin.tsx`, et les leur faire
 * importer de là fermerait une boucle. Un module sans composant, en bout de
 * chaîne, ne dépend de rien du Super Admin et ne fait lever aucun
 * `only-export-components`.
 */

export function dateLisible(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Un MRR nul se lit « — » et non « 0 FCFA » : le collecteur est en essai, il ne
    paie pas encore ; zéro laisserait croire à un impayé. */
export function mrrLisible(mrr: number): string {
  return mrr === 0 ? '—' : `${formatMontant(mrr)} FCFA`;
}

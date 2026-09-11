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

const UNITES = ['o', 'Ko', 'Mo', 'Go', 'To'] as const;

/**
 * 19 922 944 → « 19 Mo ». Une décimale sous dix, aucune au-delà, et une
 * insécable avant l'unité : « 19 » et « Mo » ne se séparent pas en fin de
 * ligne.
 */
export function tailleLisible(octets: number): string {
  let valeur = octets;
  let rang = 0;
  while (valeur >= 1024 && rang < UNITES.length - 1) {
    valeur /= 1024;
    rang += 1;
  }
  const nombre =
    rang === 0 || valeur >= 10
      ? Math.round(valeur).toString()
      : Number(valeur.toFixed(1)).toString().replace('.', ',');
  return `${nombre}\u00a0${UNITES[rang]}`;
}

/**
 * « 2026-09-12 » → « 12 sept. 2026 ». Lu en UTC, qui est l'heure d'Abidjan :
 * `dateLisible` lirait minuit dans le fuseau du navigateur, et un poste réglé
 * à l'ouest afficherait la veille.
 */
export function jourLisible(jour: string): string {
  return new Date(`${jour}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

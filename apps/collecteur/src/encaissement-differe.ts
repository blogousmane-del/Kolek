/**
 * Ce qui se décide pendant les six secondes de sursis, sans horloge ni réseau.
 *
 * ## Pourquoi un sursis, et pas une annulation
 *
 * `mises` est append-only : le trigger `mises_immuables` refuse `update` et
 * `delete`, et il est `BEFORE`, donc il s'applique aussi aux accès par clé de
 * service que RLS ne filtre pas. Une mise écrite ne se défait pas.
 *
 * « Annuler » ne peut donc exister qu'avant l'écriture. La case se remplit à
 * l'écran tout de suite — c'est ce que le collecteur vient de faire — et
 * l'insertion part six secondes plus tard.
 *
 * ## Pourquoi ces fonctions sont pures
 *
 * Le minuteur vit dans l'écran, où il a un cycle de vie. Ce qui se *décide* —
 * quel compte montrer, quand l'attente n'a plus d'objet — se teste sans
 * attendre six secondes, et se relit sans dérouler un rendu.
 */

/** Le sursis, en secondes. C'est aussi ce que le bouton « Annuler » décompte. */
export const SURSIS_S = 6;

/** Le même sursis, en millisecondes, pour le minuteur d'écriture. */
export const SURSIS_MS = SURSIS_S * 1000;

export interface EnAttente {
  carteId: string;
  mise: number;
  /** `misesEncaissees` au moment de l'appui. Sert à savoir quand purger. */
  base: number;
  /** L'insertion est partie ; on attend seulement que la relecture la ramène. */
  envoyee: boolean;
  /** Renseigné quand l'écriture a échoué. */
  echec?: string;
}

/**
 * Le compte à montrer sur une carte, une fois l'optimisme pris en compte.
 *
 * `Math.max` et non `base + 1` : entre l'écriture et la relecture, le compte
 * réel rattrape l'optimisme, et il peut même le dépasser. C'est lui qui dit
 * vrai — mais la case ne doit jamais se revider en chemin.
 */
export function misesAffichees(
  carteId: string,
  reelles: number,
  attente: EnAttente | null,
): number {
  if (!attente || attente.carteId !== carteId) return reelles;
  return Math.max(reelles, attente.base + 1);
}

/** La relecture a-t-elle ramené la mise qu'on tenait à bout de bras ? */
export function estRattrapee(reelles: number, attente: EnAttente): boolean {
  return reelles > attente.base;
}

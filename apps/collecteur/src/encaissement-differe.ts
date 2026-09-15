/**
 * Ce qui se décide pendant les six secondes de sursis, sans horloge ni réseau.
 *
 * ## Pourquoi un sursis, et pas une annulation
 *
 * `mises` est append-only : le trigger `mises_immuables` refuse `update` et
 * `delete`, et il est `BEFORE`, donc il s'applique aussi aux accès par clé de
 * service que RLS ne filtre pas. Une mise écrite au serveur ne se défait pas.
 *
 * « Annuler » ne peut donc exister qu'avant l'envoi. Depuis J2b, l'appui écrit
 * l'opération dans la file du téléphone avec une échéance à six secondes ; le
 * synchroniseur ne l'envoie qu'après, et « Annuler » la retire de la file d'ici
 * là (`hors-ligne/file.ts`, `annuler`). Un rechargement pendant le sursis ne
 * perd plus rien : l'opération est sur le disque.
 *
 * ## Pourquoi ces fonctions sont pures
 *
 * Le minuteur vit dans l'écran, où il a un cycle de vie. Ce qui se *décide* —
 * quel compte montrer, quand l'attente n'a plus d'objet — se teste sans
 * attendre six secondes, et se relit sans dérouler un rendu.
 */

/** Le sursis, en secondes. C'est aussi ce que le bouton « Annuler » décompte. */
export const SURSIS_S = 6;

/** Le même sursis, en millisecondes, pour l'échéance de l'opération. */
export const SURSIS_MS = SURSIS_S * 1000;

export interface EnAttente {
  carteId: string;
  mise: number;
  /** `misesEncaissees` au moment de l'appui. Sert à savoir quand purger. */
  base: number;
  /** L'opération dans la file du téléphone. `null` : rien n'a été écrit. */
  operationId: string | null;
  /** L'échéance est passée ou a été avancée : « Annuler » n'a plus d'objet. */
  envoyee: boolean;
  /** Renseigné quand l'enregistrement a échoué. */
  echec?: string;
}

/**
 * Le compte à montrer sur une carte.
 *
 * Le jour de plus ne compte que si l'opération est sur le disque (spec J2b
 * §4.1) : un refus n'a rien écrit, la case ne se remplit pas.
 *
 * `Math.max` et non `base + 1` : la relecture de la tournée compte déjà la mise
 * en file, et peut compter davantage. C'est elle qui dit vrai — mais la case ne
 * doit jamais se revider en chemin.
 */
export function misesAffichees(
  carteId: string,
  reelles: number,
  attente: EnAttente | null,
): number {
  if (!attente || attente.carteId !== carteId || attente.operationId === null) return reelles;
  return Math.max(reelles, attente.base + 1);
}

/** La relecture a-t-elle ramené la mise qu'on tenait à bout de bras ? */
export function estRattrapee(reelles: number, attente: EnAttente): boolean {
  return reelles > attente.base;
}

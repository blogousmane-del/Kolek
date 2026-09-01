import type { Carte } from './types';

export const MISES_PAR_CYCLE = 31;
export const MISE_MIN = 500;

/**
 * Au-delà, l'écran demande confirmation. Ce n'est plus un refus.
 *
 * C'est l'ancien plafond. Le choix du chiffre est délibéré : tout ce qui était
 * interdit hier demande aujourd'hui une confirmation, et tout ce qui passait
 * hier passe encore sans rien demander.
 */
export const MISE_INHABITUELLE = 10_000;

/**
 * Ce que la colonne `integer` de Postgres sait porter.
 *
 * Borne physique, pas commerciale : sans elle, la base refuserait avec
 * « value out of range for type integer », que le collecteur ne peut pas
 * comprendre ni corriger.
 */
export const MISE_MAX_STOCKABLE = 2_147_483_647;

function verifierEntrees(misesEncaissees: number, mise: number): void {
  if (!Number.isInteger(misesEncaissees) || misesEncaissees < 0 || misesEncaissees > MISES_PAR_CYCLE) {
    throw new RangeError(`Nombre de mises hors cycle : ${misesEncaissees}`);
  }
  if (!validerMise(mise)) {
    throw new RangeError(`Mise journalière invalide : ${mise}`);
  }
}

export function validerMise(montant: number): boolean {
  return Number.isInteger(montant) && montant >= MISE_MIN && montant <= MISE_MAX_STOCKABLE;
}

/**
 * Vrai pour une mise valide mais au-dessus du seuil de confirmation.
 *
 * Faux pour une mise invalide : une valeur que la base refuserait n'est pas
 * « inhabituelle », elle n'existe pas. L'écran doit lui montrer une erreur, pas
 * une case à cocher.
 */
export function miseInhabituelle(montant: number): boolean {
  return validerMise(montant) && montant > MISE_INHABITUELLE;
}

/**
 * Solde à restituer au client : (mises encaissées − 1) × mise.
 * La 1ʳᵉ mise de chaque carte est la commission du collecteur.
 */
export function soldeRestituable(misesEncaissees: number, mise: number): number {
  verifierEntrees(misesEncaissees, mise);
  if (misesEncaissees <= 1) return 0;
  return (misesEncaissees - 1) * mise;
}

/** Commission du collecteur : une mise, dès le premier encaissement. */
export function commission(misesEncaissees: number, mise: number): number {
  verifierEntrees(misesEncaissees, mise);
  return misesEncaissees >= 1 ? mise : 0;
}

export function progression(misesEncaissees: number): {
  encaissees: number;
  total: number;
  ratio: number;
} {
  return {
    encaissees: misesEncaissees,
    total: MISES_PAR_CYCLE,
    ratio: misesEncaissees / MISES_PAR_CYCLE,
  };
}

export function cycleComplet(misesEncaissees: number): boolean {
  return misesEncaissees >= MISES_PAR_CYCLE;
}

export function peutEncaisser(carte: Carte): boolean {
  return carte.statut === 'active' && !cycleComplet(carte.misesEncaissees);
}

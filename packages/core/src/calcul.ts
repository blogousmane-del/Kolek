import type { Carte } from './types';

export const MISES_PAR_CYCLE = 31;
export const MISE_MIN = 500;
export const MISE_MAX = 10_000;

function verifierEntrees(misesEncaissees: number, mise: number): void {
  if (!Number.isInteger(misesEncaissees) || misesEncaissees < 0 || misesEncaissees > MISES_PAR_CYCLE) {
    throw new RangeError(`Nombre de mises hors cycle : ${misesEncaissees}`);
  }
  if (!validerMise(mise)) {
    throw new RangeError(`Mise journalière invalide : ${mise}`);
  }
}

export function validerMise(montant: number): boolean {
  return Number.isInteger(montant) && montant >= MISE_MIN && montant <= MISE_MAX;
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

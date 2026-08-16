import { describe, expect, it } from 'vitest';
import {
  MISES_PAR_CYCLE,
  commission,
  cycleComplet,
  peutEncaisser,
  progression,
  soldeRestituable,
  validerMise,
} from './calcul';
import type { Carte } from './types';

const carte = (partiel: Partial<Carte> = {}): Carte => ({
  id: 'c1',
  collecteurId: 'col1',
  clientId: 'cli1',
  mise: 1000,
  statut: 'active',
  misesEncaissees: 0,
  ...partiel,
});

describe('tableau de vérification du cahier §4 (M = 1 000 FCFA)', () => {
  it('carte complète — 31 mises : 30 000 restitués, 1 000 gardés', () => {
    expect(soldeRestituable(31, 1000)).toBe(30000);
    expect(commission(31, 1000)).toBe(1000);
  });

  it('retrait anticipé — 15 mises : 14 000 restitués, 1 000 gardés', () => {
    expect(soldeRestituable(15, 1000)).toBe(14000);
    expect(commission(15, 1000)).toBe(1000);
  });

  it('retrait après 1 seule mise : 0 restitué, 1 000 gardés', () => {
    expect(soldeRestituable(1, 1000)).toBe(0);
    expect(commission(1, 1000)).toBe(1000);
  });

  it('aucune mise encaissée : rien à restituer, rien à garder', () => {
    expect(soldeRestituable(0, 1000)).toBe(0);
    expect(commission(0, 1000)).toBe(0);
  });
});

describe('soldeRestituable', () => {
  it('plafonne à 30 fois la mise sur un cycle complet', () => {
    expect(soldeRestituable(MISES_PAR_CYCLE, 5000)).toBe(150000);
  });

  it('refuse un nombre de mises hors du cycle', () => {
    expect(() => soldeRestituable(32, 1000)).toThrow(RangeError);
    expect(() => soldeRestituable(-1, 1000)).toThrow(RangeError);
  });

  it('refuse une mise hors des bornes 500 – 10 000', () => {
    expect(() => soldeRestituable(10, 499)).toThrow(RangeError);
    expect(() => soldeRestituable(10, 10001)).toThrow(RangeError);
  });
});

describe('validerMise', () => {
  it('accepte les bornes et les paliers usuels', () => {
    for (const m of [500, 1000, 2000, 5000, 10000]) {
      expect(validerMise(m)).toBe(true);
    }
  });

  it('refuse hors bornes et non entiers', () => {
    expect(validerMise(499)).toBe(false);
    expect(validerMise(10001)).toBe(false);
    expect(validerMise(1000.5)).toBe(false);
    expect(validerMise(Number.NaN)).toBe(false);
  });
});

describe('progression et cycleComplet', () => {
  it('rapporte la progression sur 31 cases', () => {
    expect(progression(0)).toEqual({ encaissees: 0, total: 31, ratio: 0 });
    expect(progression(31)).toEqual({ encaissees: 31, total: 31, ratio: 1 });
  });

  it('le cycle est complet à 31 mises, pas avant', () => {
    expect(cycleComplet(30)).toBe(false);
    expect(cycleComplet(31)).toBe(true);
  });
});

describe('peutEncaisser', () => {
  it('accepte une carte active non terminée', () => {
    expect(peutEncaisser(carte({ misesEncaissees: 30 }))).toBe(true);
  });

  it('refuse une carte clôturée', () => {
    expect(peutEncaisser(carte({ statut: 'cloturee' }))).toBe(false);
  });

  it('refuse une carte au cycle complet', () => {
    expect(peutEncaisser(carte({ misesEncaissees: 31 }))).toBe(false);
  });
});

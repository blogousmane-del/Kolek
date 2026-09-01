import { describe, expect, it } from 'vitest';
import {
  MISES_PAR_CYCLE,
  MISE_INHABITUELLE,
  MISE_MAX_STOCKABLE,
  commission,
  cycleComplet,
  miseInhabituelle,
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

  it('refuse une mise sous le plancher', () => {
    expect(() => soldeRestituable(10, 499)).toThrow(RangeError);
  });

  it("calcule sans broncher au-dessus de l'ancien plafond", () => {
    // 1 500 000 000 : au-delà de ce que l'ancienne borne de 10 000 autorisait,
    // et bien au-delà de ce qu'un `integer` porterait sur 31 mises. Le calcul
    // se fait en JavaScript, où le nombre est exact jusqu'à 2^53.
    expect(soldeRestituable(31, 50_000_000)).toBe(1_500_000_000);
  });
});

describe('validerMise', () => {
  it('accepte le plancher, les paliers usuels et bien au-delà', () => {
    for (const m of [500, 1000, 2000, 5000, 10000, 50_000, 50_000_000, MISE_MAX_STOCKABLE]) {
      expect(validerMise(m), `${m} doit être acceptée`).toBe(true);
    }
  });

  it('refuse sous le plancher, au-delà du stockable, et les non-entiers', () => {
    expect(validerMise(499)).toBe(false);
    expect(validerMise(MISE_MAX_STOCKABLE + 1)).toBe(false);
    expect(validerMise(1000.5)).toBe(false);
    expect(validerMise(Number.NaN)).toBe(false);
  });
});

describe('miseInhabituelle', () => {
  it("laisse passer l'ancien plafond sans rien demander", () => {
    // 10 000 est le seuil, pas au-dessus. Tout ce qui passait hier sans
    // confirmation passe encore sans confirmation : c'est la promesse du
    // chantier, et c'est le cas limite qu'on casse le plus facilement.
    expect(miseInhabituelle(MISE_INHABITUELLE)).toBe(false);
    expect(miseInhabituelle(10_001)).toBe(true);
  });

  it('est faux pour une mise invalide, quelle que soit sa taille', () => {
    // Une valeur refusée n'est pas « inhabituelle » : elle n'existe pas. Sans
    // ce test, l'écran afficherait une case à cocher sous un message d'erreur.
    expect(miseInhabituelle(499)).toBe(false);
    expect(miseInhabituelle(MISE_MAX_STOCKABLE + 1)).toBe(false);
    expect(miseInhabituelle(20_000.5)).toBe(false);
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

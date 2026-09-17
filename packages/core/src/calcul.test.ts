import { describe, expect, it } from 'vitest';
import {
  CAISSE_MAX,
  ENTIER_MAX,
  MISES_PAR_CYCLE,
  MISE_INHABITUELLE,
  MISE_MAX_RESTITUABLE,
  commission,
  cycleComplet,
  miseInhabituelle,
  peutEncaisser,
  progression,
  soldeRestituable,
  validerCaisse,
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
    for (const m of [500, 1000, 2000, 5000, 10000, 50_000, 50_000_000, MISE_MAX_RESTITUABLE]) {
      expect(validerMise(m), `${m} doit être acceptée`).toBe(true);
    }
  });

  it('refuse sous le plancher, au-delà du restituable, et les non-entiers', () => {
    expect(validerMise(499)).toBe(false);
    expect(validerMise(MISE_MAX_RESTITUABLE + 1)).toBe(false);
    expect(validerMise(1000.5)).toBe(false);
    expect(validerMise(Number.NaN)).toBe(false);
  });

  it('refuse une mise dont la restitution ne tiendrait pas', () => {
    // 30 × mise, parce qu'une carte pleine rend 30 mises sur 31 — la première
    // est la commission. Écrit ainsi plutôt qu'en dur : si le cycle change, le
    // test dit lequel des deux nombres a bougé.
    expect((MISES_PAR_CYCLE - 1) * MISE_MAX_RESTITUABLE).toBeLessThanOrEqual(2_147_483_647);
    expect((MISES_PAR_CYCLE - 1) * (MISE_MAX_RESTITUABLE + 1)).toBeGreaterThan(2_147_483_647);
    expect(validerMise(MISE_MAX_RESTITUABLE)).toBe(true);
    expect(validerMise(MISE_MAX_RESTITUABLE + 1)).toBe(false);
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
    expect(miseInhabituelle(MISE_MAX_RESTITUABLE + 1)).toBe(false);
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


/**
 * La borne de la caisse déclarée.
 *
 * `caisses_jour.cash_declare` est un `integer`, et n'a qu'une borne basse en
 * base (`check (cash_declare >= 0)`). Au-dessus de 2 147 483 647, PostgreSQL
 * rend `22003` — mesuré contre la pile locale le 2026-09-17 — que la file ne
 * savait pas lire.
 */
describe('validerCaisse', () => {
  it('accepte zéro, un montant courant, et la borne exacte', () => {
    for (const m of [0, 4500, 250_000, CAISSE_MAX]) {
      expect(validerCaisse(m), `${m} doit être acceptée`).toBe(true);
    }
  });

  it('refuse au-dessus de la borne, sous zéro, et ce qui n’est pas entier', () => {
    expect(validerCaisse(CAISSE_MAX + 1)).toBe(false);
    expect(validerCaisse(-1)).toBe(false);
    expect(validerCaisse(1.5)).toBe(false);
    expect(validerCaisse(Number.NaN)).toBe(false);
  });

  it('borne exactement ce qu’une colonne integer porte', () => {
    expect(CAISSE_MAX).toBe(2_147_483_647);
    expect(ENTIER_MAX).toBe(2_147_483_647);
  });
});

/**
 * Le témoin du chantier.
 *
 * `MISE_MAX_RESTITUABLE` écrivait `2_147_483_647` en clair dans son calcul ;
 * il dérive maintenant d'`ENTIER_MAX`. Cette épreuve écrit la valeur attendue
 * en dur, sans la recalculer : recalculer reproduirait l'erreur qu'on cherche
 * à exclure.
 */
describe('nommer ENTIER_MAX n’a rien déplacé', () => {
  it('laisse MISE_MAX_RESTITUABLE à sa valeur', () => {
    expect(MISE_MAX_RESTITUABLE).toBe(71_582_788);
  });
});
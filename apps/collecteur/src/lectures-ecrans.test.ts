import { MISES_PAR_CYCLE } from '@kolek/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ce que les alertes disent d'une carte arrivée au bout de son cycle.
 *
 * Elles annonçaient : « La carte **doit** être clôturée et 30 000 FCFA
 * restitués. » C'était vrai tant qu'un client ne pouvait tenir qu'une carte à la
 * fois — il fallait fermer l'ancienne pour en ouvrir une neuve, donc rendre
 * l'argent. La contrainte est tombée le 2026-08-25, et cette phrase avec elle :
 * le client peut désormais laisser son épargne chez le collecteur et repartir
 * sur une carte de plus.
 *
 * Une alerte qui présente un choix comme une obligation ne se contente pas
 * d'être imprécise. Elle pousse le collecteur à réclamer une clôture que
 * personne ne demande, et à rendre un argent que le client voulait garder.
 *
 * Le seuil, lui, ne bouge pas — ni celui-ci ni celui de la dormance. Le cycle
 * est un compte de 31 mises, pas 31 jours de calendrier ; les alertes de jours
 * sans mise restent des repères de tournée, pas des reproches, et leurs textes
 * disent déjà des faits.
 */

const from = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { from: (table: string) => from(table) },
}));

const { chargerAlertes } = await import('./lectures-ecrans');

const CLIENTS = [{ id: 'cli1', nom: 'Hj' }];

/** Une seule carte, pleine, et toujours active : la base ne clôture qu'au retrait. */
const CARTES = [
  {
    id: 'k1',
    client_id: 'cli1',
    mise: 1000,
    statut: 'active',
    mises_encaissees: MISES_PAR_CYCLE,
    ouverte_le: '2026-07-01T08:00:00.000Z',
  },
];

const MISES = [{ carte_id: 'k1', encaisse_le: new Date().toISOString() }];

beforeEach(() => {
  from.mockImplementation((table: string) => {
    if (table === 'cartes') return { select: () => Promise.resolve({ data: CARTES, error: null }) };
    if (table === 'clients') return { select: () => Promise.resolve({ data: CLIENTS, error: null }) };
    if (table === 'mises') {
      return {
        select: () => ({
          gte: () => ({ order: () => Promise.resolve({ data: MISES, error: null }) }),
        }),
      };
    }
    return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) };
  });
});

afterEach(() => {
  from.mockReset();
});

describe('alerte d’une carte au bout de son cycle', () => {
  it('ne présente plus le retrait comme une obligation', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    expect(complete).toBeTruthy();
    // « doit être clôturée » était la règle d'une seule carte active. Elle est
    // tombée avec l'index unique.
    expect(complete?.detail).not.toContain('doit');
  });

  it('nomme les deux issues, et dit que le solde reste dû', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    // Les deux portes se valent : une alerte qui n'en montre qu'une choisit à la
    // place du client.
    expect(complete?.detail).toContain('restituer');
    expect(complete?.detail).toContain('carte de plus');
    // Sans ce rappel, laisser l'argent ressemble à le perdre.
    expect(complete?.detail).toContain('dû');
  });

  it('rappelle toujours le montant en jeu', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    // 31 mises de 1 000, moins la première qui est la commission du collecteur.
    expect(complete?.detail).toContain('30 000');
  });
});

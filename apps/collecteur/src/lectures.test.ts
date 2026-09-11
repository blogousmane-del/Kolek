import { soldeRestituable } from '@kolek/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { tableFactice, type Ligne } from './postgrest-factice';

/**
 * L'accueil d'un collecteur au-delà de mille lignes.
 *
 * C'est l'écran qui s'ouvre à chaque lancement, et il porte l'encours : ce
 * que le collecteur doit à ses clients. Coupé à mille cartes, ce chiffre ment
 * vers le bas, et rien à l'écran ne le laisse deviner.
 */

const from = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { from: (table: string) => from(table) },
}));

const { chargerTableauCollecteur } = await import('./lectures');

const N = 1001;
const rang = (i: number) => String(i).padStart(4, '0');

beforeEach(() => {
  const tables: Record<string, Ligne[]> = {
    clients: Array.from({ length: N }, (_, i) => ({ id: `c${rang(i)}`, nom: `Client ${rang(i)}` })),
    cartes: Array.from({ length: N }, (_, i) => ({
      id: `k${rang(i)}`,
      client_id: `c${rang(i)}`,
      mise: 500,
      statut: 'active',
      mises_encaissees: 2,
    })),
    mises: [],
  };
  from.mockImplementation((table: string) => tableFactice(tables[table] ?? []));
});

describe('l’accueil d’un collecteur au-delà de mille lignes', () => {
  it('compte tous ses clients, toutes ses cartes, et tout ce qu’il doit', async () => {
    const tableau = await chargerTableauCollecteur();

    expect(tableau.clients).toBe(N);
    expect(tableau.cartesActives).toBe(N);
    expect(tableau.encoursTotal).toBe(N * soldeRestituable(2, 500));
  });
});

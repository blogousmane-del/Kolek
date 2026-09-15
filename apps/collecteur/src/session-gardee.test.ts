import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { cleSessionPour, lireSessionGardee } from './session-gardee';

const memoire = (valeurs: Record<string, string>) => ({
  getItem: (cle: string) => valeurs[cle] ?? null,
});

describe('la clé sous laquelle supabase-js garde la session', () => {
  it.each([
    ['https://abcdefghijklmnopqrst.supabase.co', 'sb-abcdefghijklmnopqrst-auth-token'],
    ['http://127.0.0.1:54321', 'sb-127-auth-token'],
  ])('%s se garde sous %s', (url, cle) => {
    expect(cleSessionPour(url)).toBe(cle);
  });

  it('est exactement celle que supabase-js calcule : une autre déconnecterait tout le monde', () => {
    for (const url of ['https://abcdefghijklmnopqrst.supabase.co', 'http://127.0.0.1:54321']) {
      const client = createClient(url, 'cle-publique', {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect(cleSessionPour(url)).toBe((client as unknown as { storageKey: string }).storageKey);
    }
  });
});

describe('la session gardée, lue sans réseau', () => {
  const CLE = 'sb-test-auth-token';

  it('rend le collecteur d’une session complète', () => {
    const session = JSON.stringify({
      access_token: 'a',
      refresh_token: 'r',
      expires_at: 1,
      user: { id: 'col-1' },
    });
    expect(lireSessionGardee(memoire({ [CLE]: session }), CLE)).toEqual({ userId: 'col-1' });
  });

  it('ne rend rien sans session, ou sous une autre clé', () => {
    expect(lireSessionGardee(memoire({}), CLE)).toBeNull();
    expect(lireSessionGardee(memoire({ autre: '{}' }), CLE)).toBeNull();
  });

  it.each([
    ['illisible', '{pas du json'],
    ['sans jeton de renouvellement', JSON.stringify({ user: { id: 'col-1' } })],
    ['sans utilisateur', JSON.stringify({ refresh_token: 'r' })],
    ['nulle', 'null'],
  ])('ne rend rien d’une session %s', (_cas, brut) => {
    expect(lireSessionGardee(memoire({ [CLE]: brut }), CLE)).toBeNull();
  });

  it('se tait quand le stockage du navigateur lève', () => {
    const bloque = {
      getItem: () => {
        throw new Error('stockage bloqué');
      },
    };
    expect(lireSessionGardee(bloque, CLE)).toBeNull();
  });
});

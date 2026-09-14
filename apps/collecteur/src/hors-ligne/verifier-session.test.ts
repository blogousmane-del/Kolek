import { AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELAI_REQUETE_MS } from '../delai-requete';
import { MARGE_SESSION_MS, renouvelerSession, verifierSession } from './synchroniseur';

const MAINTENANT = Date.parse('2026-09-14T09:00:00.000Z');

const pendante = () => new Promise<never>(() => {});

/** Une session de `id`, qui expire dans `resteMs`. `expires_at` est en secondes, comme dans supabase-js. */
const session = (id: string, resteMs: number) => ({
  user: { id },
  expires_at: Math.floor((MAINTENANT + resteMs) / 1000),
});

function clientAuth(auth: { getSession?: () => Promise<unknown>; refreshSession?: () => Promise<unknown> }) {
  const getSession = vi.fn(auth.getSession ?? (async () => ({ data: { session: null }, error: null })));
  const refreshSession = vi.fn(auth.refreshSession ?? (async () => ({ data: { session: null }, error: null })));
  return { client: { auth: { getSession, refreshSession } } as unknown as SupabaseClient, refreshSession };
}

/** Suit une promesse sans l'attendre : l'épreuve lit son issue après avoir avancé l'horloge. */
function suivre<T>(promesse: Promise<T>): { issue: T | 'en vol' } {
  const etat: { issue: T | 'en vol' } = { issue: 'en vol' };
  void promesse.then((valeur) => {
    etat.issue = valeur;
  });
  return etat;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(MAINTENANT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('une session qui ne répond pas', () => {
  it('vaut un échec passager au bout du délai, pas avant', async () => {
    const { client } = clientAuth({ getSession: pendante });
    const suivi = suivre(verifierSession(client, 'col-1'));

    await vi.advanceTimersByTimeAsync(DELAI_REQUETE_MS - 1);
    expect(suivi.issue).toBe('en vol');

    await vi.advanceTimersByTimeAsync(1);
    expect(suivi.issue).toBe('passager');
  });

  it('un renouvellement qui ne répond pas aussi', async () => {
    const { client } = clientAuth({ refreshSession: pendante });
    const suivi = suivre(renouvelerSession(client, 'col-1'));

    await vi.advanceTimersByTimeAsync(DELAI_REQUETE_MS - 1);
    expect(suivi.issue).toBe('en vol');

    await vi.advanceTimersByTimeAsync(1);
    expect(suivi.issue).toBe('passager');
  });

  it('ne laisse aucun minuteur derrière une réponse arrivée à temps', async () => {
    const { client } = clientAuth({
      getSession: async () => ({ data: { session: session('col-1', 3_600_000) }, error: null }),
    });

    expect(await verifierSession(client, 'col-1')).toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('une session qui expire bientôt', () => {
  it('est renouvelée avant d’envoyer, sous cinq minutes de validité', async () => {
    expect(MARGE_SESSION_MS).toBe(5 * 60_000);
    const { client, refreshSession } = clientAuth({
      getSession: async () => ({ data: { session: session('col-1', MARGE_SESSION_MS - 60_000) }, error: null }),
      refreshSession: async () => ({ data: { session: session('col-1', 3_600_000) }, error: null }),
    });

    expect(await verifierSession(client, 'col-1')).toBe('ok');
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('vaut un échec passager si le renouvellement ne répond pas à temps', async () => {
    const { client } = clientAuth({
      getSession: async () => ({ data: { session: session('col-1', 60_000) }, error: null }),
      refreshSession: pendante,
    });
    const suivi = suivre(verifierSession(client, 'col-1'));

    await vi.advanceTimersByTimeAsync(DELAI_REQUETE_MS);

    expect(suivi.issue).toBe('passager');
  });

  it('n’est pas renouvelée quand il reste plus que la marge', async () => {
    const { client, refreshSession } = clientAuth({
      getSession: async () => ({ data: { session: session('col-1', MARGE_SESSION_MS + 60_000) }, error: null }),
    });

    expect(await verifierSession(client, 'col-1')).toBe('ok');
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('sans échéance lisible, laisse supabase-js seul juge', async () => {
    const { client, refreshSession } = clientAuth({
      getSession: async () => ({ data: { session: { user: { id: 'col-1' } } }, error: null }),
    });

    expect(await verifierSession(client, 'col-1')).toBe('ok');
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('un renouvellement anticipé refusé ne finit pas une session encore valide', async () => {
    // Trop de demandes, jeton déjà tourné par un autre onglet : supabase-js garde
    // la session, qui vaut encore une minute. On revient plus tard.
    const { client } = clientAuth({
      getSession: async () => ({ data: { session: session('col-1', 60_000) }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: new AuthSessionMissingError() }),
    });

    expect(await verifierSession(client, 'col-1')).toBe('passager');
  });

  it('une session déjà expirée dont le renouvellement est refusé est finie', async () => {
    const { client } = clientAuth({
      getSession: async () => ({ data: { session: session('col-1', -60_000) }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: new AuthSessionMissingError() }),
    });

    expect(await verifierSession(client, 'col-1')).toBe('finie');
  });

  it('sous une autre identité, reste une autre identité', async () => {
    const { client, refreshSession } = clientAuth({
      getSession: async () => ({ data: { session: session('col-2', 60_000) }, error: null }),
    });

    expect(await verifierSession(client, 'col-1')).toBe('autre_compte');
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

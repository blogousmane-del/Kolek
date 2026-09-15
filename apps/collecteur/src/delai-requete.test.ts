import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELAI_REQUETE_MS, OPTIONS_DONNEES } from './delai-requete';
import { classer } from './hors-ligne/classer';

const URL_BASE = 'http://127.0.0.1:54321';

/** Un réseau qui ne répond jamais, mais qui s'arrête quand on l'annule — comme `fetch`. */
function reseauMuet() {
  const appels: { adresse: string; init: RequestInit | undefined }[] = [];
  let signalerAppel: () => void = () => {};
  /**
   * Résolue au premier appel du réseau. supabase-js ne part qu'au premier
   * `then`, et passe par la session avant `fetch` : avancer l'horloge avant cet
   * appel ne ferait courir aucun délai.
   */
  const premierAppel = new Promise<void>((resoudre) => {
    signalerAppel = resoudre;
  });
  const fetchBase = vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
    appels.push({ adresse: String(entree), init });
    signalerAppel();
    return new Promise<Response>((_resoudre, rejeter) => {
      init?.signal?.addEventListener('abort', () => rejeter(init.signal!.reason), { once: true });
    });
  });
  return { fetchBase: fetchBase as unknown as typeof fetch, appels, espion: fetchBase, premierAppel };
}

/** Le client tel que `supabase.ts` le construit, sur un réseau factice. */
function clientSur(fetchBase: typeof fetch) {
  return createClient(URL_BASE, 'cle-publique', {
    auth: { persistSession: false, autoRefreshToken: false },
    db: OPTIONS_DONNEES,
    global: { fetch: fetchBase },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('une requête de données sans réponse', () => {
  it('vaut trente secondes', () => {
    expect(DELAI_REQUETE_MS).toBe(30_000);
    expect(OPTIONS_DONNEES).toEqual({ timeout: DELAI_REQUETE_MS });
  });

  it('est coupée à trente secondes, pas avant, et la file la classe passagère', async () => {
    const { fetchBase, premierAppel } = reseauMuet();
    const enVol = clientSur(fetchBase)
      .from('mises')
      .insert({ id: 'mise-1', montant: 500 })
      .then((r) => r);
    let reponse: Awaited<typeof enVol> | undefined;
    void enVol.then((r) => {
      reponse = r;
    });
    await premierAppel;

    await vi.advanceTimersByTimeAsync(DELAI_REQUETE_MS - 1);
    expect(reponse).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(reponse).toBeDefined());
    expect(reponse!.status).toBe(0);
    expect(classer(reponse!, 'mise')).toEqual({ cas: 'passager' });
  });

  it('ne fait pas réessayer une lecture par supabase-js : un seul appel au réseau', async () => {
    const { fetchBase, espion, premierAppel } = reseauMuet();
    const enVol = clientSur(fetchBase)
      .from('clients')
      .select('id')
      .eq('id', 'c-1')
      .maybeSingle()
      .then((r) => r);
    await premierAppel;

    await vi.advanceTimersByTimeAsync(DELAI_REQUETE_MS);
    await vi.advanceTimersByTimeAsync(10 * DELAI_REQUETE_MS);

    // Compté avant d'attendre la réponse : un nouvel essai pendrait, et
    // l'épreuve rougirait sur son assertion plutôt que par dépassement.
    expect(espion).toHaveBeenCalledTimes(1);
    expect((await enVol).status).toBe(0);
  });

  it('laisse passer une réponse arrivée à temps, sans minuteur restant', async () => {
    const fetchBase = vi.fn(
      async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ) as unknown as typeof fetch;

    const reponse = await clientSur(fetchBase).from('cartes').select('id');

    expect(reponse.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('obéit toujours à une annulation demandée par l’appelant', async () => {
    const { fetchBase, premierAppel } = reseauMuet();
    const appelant = new AbortController();
    const enVol = clientSur(fetchBase)
      .from('mises')
      .select('id')
      .abortSignal(appelant.signal)
      .then((r) => r);
    await premierAppel;

    appelant.abort();
    const reponse = await enVol;

    expect(reponse.status).toBe(0);
    expect(reponse.error?.message).toContain('AbortError');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ce qui n’est jamais coupé', () => {
  it('un encaissement pour un coéquipier (Edge Function)', async () => {
    const { fetchBase, appels, premierAppel } = reseauMuet();
    let fini = false;
    void clientSur(fetchBase)
      .functions.invoke('collecteur-encaisser-pour', { body: { miseId: 'mise-1' } })
      .then(() => {
        fini = true;
      });
    await premierAppel;

    await vi.advanceTimersByTimeAsync(20 * DELAI_REQUETE_MS);

    expect(appels[0]!.adresse).toContain('/functions/v1/collecteur-encaisser-pour');
    expect(fini).toBe(false);
  });

  it('un renouvellement de session', async () => {
    const { fetchBase, appels, premierAppel } = reseauMuet();
    let fini = false;
    void clientSur(fetchBase)
      .auth.refreshSession({ refresh_token: 'r' })
      .then(() => {
        fini = true;
      });
    await premierAppel;

    await vi.advanceTimersByTimeAsync(20 * DELAI_REQUETE_MS);

    expect(appels[0]!.adresse).toContain('/auth/v1/token');
    expect(fini).toBe(false);
  });
});

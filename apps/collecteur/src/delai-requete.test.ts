import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { avecDelai, DELAI_REQUETE_MS } from './delai-requete';
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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('une requête de données sans réponse', () => {
  it('vaut trente secondes', () => {
    expect(DELAI_REQUETE_MS).toBe(30_000);
  });

  it('est coupée à trente secondes, pas avant', async () => {
    const { fetchBase } = reseauMuet();
    let issue: unknown = 'en vol';
    avecDelai(fetchBase)(`${URL_BASE}/rest/v1/mises`, { method: 'POST' }).then(
      () => (issue = 'répondue'),
      (e: unknown) => (issue = e),
    );

    await vi.advanceTimersByTimeAsync(DELAI_REQUETE_MS - 1);
    expect(issue).toBe('en vol');

    await vi.advanceTimersByTimeAsync(1);
    expect((issue as { name?: string }).name).toBe('AbortError');
  });

  it('rend une insertion en statut 0, que la file classe passagère', async () => {
    const { fetchBase, premierAppel } = reseauMuet();
    const client = createClient(URL_BASE, 'cle-publique', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: avecDelai(fetchBase) },
    });

    const enVol = client
      .from('mises')
      .insert({ id: 'mise-1', montant: 500 })
      .then((r) => r);
    await premierAppel;
    await vi.advanceTimersByTimeAsync(DELAI_REQUETE_MS);
    const reponse = await enVol;

    expect(reponse.status).toBe(0);
    expect(classer(reponse, 'mise')).toEqual({ cas: 'passager' });
  });

  it('ne fait pas réessayer une lecture par supabase-js : un seul appel au réseau', async () => {
    const { fetchBase, espion, premierAppel } = reseauMuet();
    const client = createClient(URL_BASE, 'cle-publique', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: avecDelai(fetchBase) },
    });

    const enVol = client
      .from('clients')
      .select('id')
      .eq('id', 'c-1')
      .maybeSingle()
      .then((r) => r);
    await premierAppel;
    await vi.advanceTimersByTimeAsync(DELAI_REQUETE_MS);
    const reponse = await enVol;
    await vi.advanceTimersByTimeAsync(10 * DELAI_REQUETE_MS);

    expect(reponse.status).toBe(0);
    expect(espion).toHaveBeenCalledTimes(1);
  });

  it('laisse passer une réponse arrivée à temps, sans minuteur restant', async () => {
    const reponse = new Response('[]', { status: 200 });
    const fetchBase = vi.fn(async () => reponse) as unknown as typeof fetch;

    await expect(avecDelai(fetchBase)(`${URL_BASE}/rest/v1/cartes`)).resolves.toBe(reponse);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('obéit toujours à une annulation demandée par l’appelant', async () => {
    const { fetchBase } = reseauMuet();
    const appelant = new AbortController();
    let issue: unknown = 'en vol';
    avecDelai(fetchBase)(`${URL_BASE}/rest/v1/mises`, { signal: appelant.signal }).then(
      () => (issue = 'répondue'),
      (e: unknown) => (issue = e),
    );

    appelant.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(issue).not.toBe('en vol');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ce qui n’est jamais coupé', () => {
  it.each([
    ['un encaissement pour un coéquipier', '/functions/v1/collecteur-encaisser-pour'],
    ['un paiement d’abonnement', '/functions/v1/abonnement-payer'],
    ['un renouvellement de session', '/auth/v1/token?grant_type=refresh_token'],
  ])('%s : la requête part telle quelle, sans délai', async (_cas, chemin) => {
    const { fetchBase, appels } = reseauMuet();
    const init: RequestInit = { method: 'POST' };
    let issue: unknown = 'en vol';
    avecDelai(fetchBase)(`${URL_BASE}${chemin}`, init).then(
      () => (issue = 'répondue'),
      (e: unknown) => (issue = e),
    );

    await vi.advanceTimersByTimeAsync(20 * DELAI_REQUETE_MS);

    expect(issue).toBe('en vol');
    expect(appels[0]!.init).toBe(init);
    expect(vi.getTimerCount()).toBe(0);
  });
});

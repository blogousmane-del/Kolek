import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ATTENTE_SESSION_DEMARRAGE_MS } from './session-gardee';

/**
 * Le démarrage de l'application, avec et sans réseau (plan J2b, précisions 1
 * et 2). Le critère de réussite de la spec commence ici : « téléphone redémarré
 * au marché, il ouvre l'application et voit sa tournée ».
 */

const getSession = vi.fn();
const maybeSingle = vi.fn();
const effacerTourneeDe = vi.fn();
let surChangement: (evenement: string, session: unknown) => void = () => {};

vi.mock('./supabase', () => ({
  CLE_SESSION: 'sb-test-auth-token',
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (rappel: typeof surChangement) => {
        surChangement = rappel;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: () => Promise.resolve({ error: null }),
    },
    from: () => ({ select: () => ({ maybeSingle: () => maybeSingle() }) }),
  },
}));
vi.mock('./hors-ligne/moteur', () => ({
  effacerTourneeDe: (id: string) => effacerTourneeDe(id),
}));
vi.mock('./cache', () => ({ viderCache: () => {} }));
vi.mock('./Connexion', () => ({ Connexion: () => <div>écran de connexion</div> }));
vi.mock('./Coquille', () => ({
  Coquille: ({ collecteurId }: { collecteurId: string }) => <div>coquille de {collecteurId}</div>,
}));
vi.mock('./ecrans/MotDePasseOublie', () => ({ MotDePasseOublie: () => null }));
vi.mock('./ecrans/NouveauMotDePasse', () => ({ NouveauMotDePasse: () => null }));

const { default: App } = await import('./App');

const SESSION = { user: { id: 'col-1' } };
const GARDEE = JSON.stringify({
  access_token: 'a',
  refresh_token: 'r',
  expires_at: 1,
  user: { id: 'col-1' },
});

beforeEach(() => {
  maybeSingle.mockResolvedValue({ data: { id: 'col-1' }, error: null });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  getSession.mockReset();
  maybeSingle.mockReset();
  effacerTourneeDe.mockReset();
});

describe('ouvrir l’application', () => {
  it('ouvre la tournée du collecteur connecté', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });

    render(<App />);

    expect(await screen.findByText('coquille de col-1')).toBeTruthy();
  });

  it('sans réseau et jeton expiré, reprend la session gardée sur le téléphone', async () => {
    localStorage.setItem('sb-test-auth-token', GARDEE);
    getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });

    render(<App />);

    expect(await screen.findByText('coquille de col-1')).toBeTruthy();
  });

  it('ne reprend rien quand l’échec ne vient pas du réseau', async () => {
    // Une session que le serveur a refusée est finie : la rouvrir enverrait la
    // file sous une identité morte.
    localStorage.setItem('sb-test-auth-token', GARDEE);
    getSession.mockResolvedValue({ data: { session: null }, error: new AuthSessionMissingError() });

    render(<App />);

    expect(await screen.findByText('écran de connexion')).toBeTruthy();
  });

  it('renvoie à la connexion sans session gardée, même sans réseau', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });

    render(<App />);

    expect(await screen.findByText('écran de connexion')).toBeTruthy();
  });
});

describe('le compte non rattaché', () => {
  it('ne se déclare pas sur une lecture en échec (précision 2)', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'TypeError: Failed to fetch', code: '' },
    });

    render(<App />);
    await screen.findByText('coquille de col-1');
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.queryByText('Compte non rattaché')).toBeNull();
    expect(screen.getByText('coquille de col-1')).toBeTruthy();
  });

  it('se déclare quand la fiche est vraiment absente', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    render(<App />);

    expect(await screen.findByText('Compte non rattaché')).toBeTruthy();
  });
});

describe('la fin de session', () => {
  it('efface la tournée du collecteur qui sort, et rend l’écran de connexion', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    render(<App />);
    await screen.findByText('coquille de col-1');

    act(() => surChangement('SIGNED_OUT', null));

    expect(effacerTourneeDe).toHaveBeenCalledWith('col-1');
    expect(await screen.findByText('écran de connexion')).toBeTruthy();
  });
});

describe('une session qui ne répond pas au démarrage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ouvre la tournée gardée après l’attente, pas avant', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    localStorage.setItem('sb-test-auth-token', GARDEE);
    getSession.mockReturnValue(new Promise(() => {}));

    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTENTE_SESSION_DEMARRAGE_MS - 1);
    });
    expect(screen.queryByText('coquille de col-1')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('coquille de col-1')).toBeTruthy();
  });

  it('renvoie à la connexion après l’attente, sans session gardée', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    getSession.mockReturnValue(new Promise(() => {}));

    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTENTE_SESSION_DEMARRAGE_MS);
    });

    expect(screen.getByText('écran de connexion')).toBeTruthy();
  });

  it('rend la connexion quand la session répond enfin qu’elle est finie', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    localStorage.setItem('sb-test-auth-token', GARDEE);
    let repondre: (valeur: unknown) => void = () => {};
    getSession.mockReturnValue(
      new Promise((r) => {
        repondre = r;
      }),
    );

    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTENTE_SESSION_DEMARRAGE_MS);
    });
    expect(screen.getByText('coquille de col-1')).toBeTruthy();

    await act(async () => {
      repondre({ data: { session: null }, error: new AuthSessionMissingError() });
    });

    expect(screen.getByText('écran de connexion')).toBeTruthy();
  });

  it('ne reste pas blanc quand la lecture de la session lève', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const panne = new Error('stockage plein');
      getSession.mockRejectedValue(panne);

      render(<App />);

      expect(await screen.findByText('écran de connexion')).toBeTruthy();
      expect(espion).toHaveBeenCalledWith(panne);
    } finally {
      espion.mockRestore();
    }
  });
});

describe('la tournée d’un collecteur dont la session s’arrête sans déconnexion', () => {
  it('s’efface quand la session gardée se révèle finie au chargement', () => {
    localStorage.setItem('sb-test-auth-token', GARDEE);
    getSession.mockReturnValue(new Promise(() => {}));
    render(<App />);

    act(() => surChangement('SIGNED_OUT', null));

    expect(effacerTourneeDe).toHaveBeenCalledWith('col-1');
  });

  it('s’efface quand un autre compte s’ouvre à sa place', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    render(<App />);
    await screen.findByText('coquille de col-1');

    act(() => surChangement('SIGNED_IN', { user: { id: 'col-2' } }));

    expect(effacerTourneeDe).toHaveBeenCalledWith('col-1');
    expect(effacerTourneeDe).not.toHaveBeenCalledWith('col-2');
    expect(await screen.findByText('coquille de col-2')).toBeTruthy();
  });

  it('ne s’efface pas quand la même session se renouvelle', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    render(<App />);
    await screen.findByText('coquille de col-1');

    act(() => surChangement('TOKEN_REFRESHED', SESSION));

    expect(effacerTourneeDe).not.toHaveBeenCalled();
  });
});

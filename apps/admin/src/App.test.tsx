import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ce que ce fichier garde : **l'ordre des trois portes**.
 *
 * `App` n'a que trois branches, et leur ordre est la seule chose qui décide qui
 * voit quoi. Du 2026-09-05 au 2026-09-06, la démonstration passait devant la
 * session :
 *
 * ```tsx
 * if (modeDemo) return <Coquille estSuper={true} … />;   // avant tout le reste
 * if (!session) return <Connexion … />;
 * return <Portillon … />;
 * ```
 *
 * Deux conséquences, et aucun test ne posait la question — c'est la leçon de F1,
 * répétée. D'abord un drapeau `localStorage` posé une fois rendait la coquille
 * *avant* que la session soit seulement regardée, avec `estSuper` forcé à vrai.
 * Ensuite, et c'est la moitié la plus coûteuse, `useVueGlobale` lisait le même
 * drapeau de son côté : une console réelle et authentifiée, ouverte dans un autre
 * onglet, remplaçait ses totaux par ceux de la démonstration au premier
 * rechargement — sans bandeau, puisque son `App` avait démarré hors
 * démonstration.
 *
 * Rien de tout cela n'était exploitable : le serveur ne cède rien à un navigateur
 * qui affirme être administrateur, la RLS et `est_admin()` sont inchangées. Ce
 * qui était en jeu n'est pas l'accès, c'est la **véracité de ce qui s'affiche** —
 * et sur un tableau de bord qui chiffre l'argent d'autrui, c'est du même ordre.
 */

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: unknown) => onAuthStateChange(cb),
    },
  },
}));

// Trois témoins. Ce test porte sur l'aiguillage, pas sur les écrans qu'il
// dessine — et chaque témoin dit ce qu'il a reçu, puisque c'est précisément ce
// qui a été faux.
vi.mock('./Portillon', () => ({
  Portillon: () => <div data-testid="portillon">portillon</div>,
}));

vi.mock('./Coquille', () => ({
  Coquille: ({ estSuper, vueDemo }: { estSuper?: boolean; vueDemo?: { genereLe: string } }) => (
    <div data-testid="coquille" data-super={String(estSuper)} data-demo={String(Boolean(vueDemo))}>
      coquille
    </div>
  ),
}));

vi.mock('./Connexion', () => ({
  Connexion: ({ onActiverDemo }: { onActiverDemo?: () => void }) => (
    <button type="button" data-testid="connexion" onClick={onActiverDemo}>
      connexion
    </button>
  ),
}));

const { default: App } = await import('./App');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
});

afterEach(cleanup);

function sansSession() {
  getSession.mockResolvedValue({ data: { session: null } });
}

function avecSession() {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } });
}

describe('App — l’ordre des portes', () => {
  it('une session ouverte mène au portillon, jamais à la coquille', async () => {
    avecSession();
    render(<App />);

    expect(await screen.findByTestId('portillon')).toBeTruthy();
    expect(screen.queryByTestId('coquille')).toBeNull();
  });

  it('un drapeau de démonstration posé dans le navigateur ne rend rien du tout', async () => {
    // La forme exacte du drapeau d'origine. Il ne doit plus rien commander :
    // aucun module ne le lit.
    localStorage.setItem('kolek_admin_demo', 'true');
    avecSession();
    render(<App />);

    expect(await screen.findByTestId('portillon')).toBeTruthy();
    expect(screen.queryByTestId('coquille')).toBeNull();
  });

  it('le même drapeau ne contourne pas non plus l’écran de connexion', async () => {
    localStorage.setItem('kolek_admin_demo', 'true');
    sansSession();
    render(<App />);

    expect(await screen.findByTestId('connexion')).toBeTruthy();
    expect(screen.queryByTestId('coquille')).toBeNull();
  });

  it('sans session, la démonstration s’ouvre au clic — et sans le niveau plateforme', async () => {
    sansSession();
    const { getByTestId } = render(<App />);

    (await screen.findByTestId('connexion')).click();

    await waitFor(() => expect(getByTestId('coquille')).toBeTruthy());
    const coquille = getByTestId('coquille');
    expect(coquille.getAttribute('data-demo')).toBe('true');
    // `estSuper` était forcé à vrai : la console de plateforme s'ouvrait à un
    // visiteur qui n'avait pas de compte.
    expect(coquille.getAttribute('data-super')).toBe('false');
  });

  it('la démonstration ne laisse aucune trace dans le navigateur', async () => {
    sansSession();
    render(<App />);

    (await screen.findByTestId('connexion')).click();
    await waitFor(() => expect(screen.getByTestId('coquille')).toBeTruthy());

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

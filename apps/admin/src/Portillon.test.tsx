import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Le contrat serveur du portillon est déjà tenu par `supabase/tests/isolation.test.ts`
 * — `est_admin()` rend faux pour un collecteur ordinaire, vrai une fois inscrit
 * aux admins, et la table `admins` reste inaccessible dans les deux cas.
 *
 * Ce qu'aucun test ne posait, c'est la question de la branche d'interface : que
 * fait l'écran quand la réponse n'arrive pas ? Un portillon qui s'ouvre parce
 * qu'il ne sait pas est pire qu'un portillon absent — il donne l'apparence d'un
 * contrôle. Les trois cas de refus comptent donc autant que le cas passant.
 */

const rpc = vi.fn();
const signOut = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { signOut: () => signOut() },
  },
}));

// La coquille est remplacée par un témoin : ce test porte sur le portillon, pas
// sur le tableau de bord qu'il protège.
vi.mock('./Coquille', () => ({
  Coquille: () => <div>coquille admin</div>,
}));

const { Portillon } = await import('./Portillon');

afterEach(() => {
  // Nettoyage explicite : `@testing-library/react` ne branche le sien qu'avec
  // les globales de vitest, que ce dépôt n'active pas. Sans lui, le rendu d'un
  // test reste dans le document et le suivant trouve la coquille du précédent —
  // un test de refus qui passe pour une mauvaise raison.
  cleanup();
  rpc.mockReset();
  signOut.mockReset();
});

describe('portillon du Dashboard Admin', () => {
  it('ouvre la coquille quand est_admin rend vrai', async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    render(<Portillon />);

    expect(await screen.findByText('coquille admin')).toBeDefined();
  });

  it('refuse un compte qui n’est pas administrateur', async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    render(<Portillon />);

    expect(await screen.findByText('Accès réservé')).toBeDefined();
    expect(screen.queryByText('coquille admin')).toBeNull();
  });

  it('reste fermé quand la vérification renvoie une erreur', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'réseau' } });

    render(<Portillon />);

    expect(await screen.findByText('Vérification impossible')).toBeDefined();
    expect(screen.queryByText('coquille admin')).toBeNull();
  });

  it('reste fermé quand l’appel lève', async () => {
    // `supabase.rpc` rend un « thenable », pas une Promise : une coupure se
    // présente comme un jet, pas comme un `error` peuplé. C'est la raison du
    // `try` dans le composant, et ce cas-ci est ce qui l'empêche de disparaître
    // à la prochaine relecture.
    rpc.mockRejectedValue(new Error('coupure'));

    render(<Portillon />);

    expect(await screen.findByText('Vérification impossible')).toBeDefined();
    expect(screen.queryByText('coquille admin')).toBeNull();
  });

  it('ne rend rien tant que la réponse n’est pas arrivée', () => {
    // Ni coquille, ni écran de refus : afficher l'un ou l'autre par défaut
    // reviendrait à trancher avant de savoir.
    rpc.mockReturnValue(new Promise(() => {}));

    const { container } = render(<Portillon />);

    expect(container.textContent).toBe('');
  });
});

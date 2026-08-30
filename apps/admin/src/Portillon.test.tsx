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
 *
 * ## Deux questions, une seule porte
 *
 * Depuis le second niveau, le portillon pose aussi `est_super_admin()`. Les deux
 * questions ne pèsent pas le même poids : la première ouvre ou ferme, la seconde
 * ne fait qu'ajouter une entrée de menu. Une panne sur la seconde laisse donc
 * entrer sans accorder le niveau — fermer le Dashboard entier punirait
 * l'administrateur métier pour une fonction qui ne le concerne pas.
 *
 * Ce que cacher l'entrée ne fait pas : protéger quoi que ce soit. Les deux Edge
 * Functions redemandent `est_super_admin()` sous l'identité de l'appelant.
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
// sur le tableau de bord qu'il protège. Le témoin dit le niveau qu'il a reçu,
// puisque c'est désormais la moitié de ce que le portillon transmet.
vi.mock('./Coquille', () => ({
  Coquille: ({ estSuper }: { estSuper?: boolean }) => (
    <div>{estSuper ? 'coquille admin · super' : 'coquille admin'}</div>
  ),
}));

const { Portillon } = await import('./Portillon');

interface Reponse {
  data: unknown;
  error: unknown;
}

const OUI: Reponse = { data: true, error: null };
const NON: Reponse = { data: false, error: null };
const PANNE: Reponse = { data: null, error: { message: 'réseau' } };

/** Deux appels partent désormais : les distinguer par leur nom évite qu'un test
    donne à l'un la réponse destinée à l'autre sans que rien ne le signale. */
function repondre(reponses: Record<string, Reponse>) {
  rpc.mockImplementation((nom: string) => {
    const reponse = reponses[nom];
    if (!reponse) throw new Error(`Appel inattendu à ${nom}`);
    return Promise.resolve(reponse);
  });
}

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
    repondre({ est_admin: OUI, est_super_admin: NON });

    render(<Portillon />);

    expect(await screen.findByText('coquille admin')).toBeDefined();
  });

  it('refuse un compte qui n’est pas administrateur', async () => {
    repondre({ est_admin: NON, est_super_admin: NON });

    render(<Portillon />);

    expect(await screen.findByText('Accès réservé')).toBeDefined();
    expect(screen.queryByText('coquille admin')).toBeNull();
  });

  it('reste fermé quand la vérification renvoie une erreur', async () => {
    repondre({ est_admin: PANNE, est_super_admin: NON });

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

describe('le niveau du compte', () => {
  it('n’est pas super par défaut', async () => {
    repondre({ est_admin: OUI, est_super_admin: NON });

    render(<Portillon />);

    expect(await screen.findByText('coquille admin')).toBeDefined();
    expect(rpc).toHaveBeenCalledWith('est_super_admin');
  });

  it('est transmis à la coquille quand est_super_admin rend vrai', async () => {
    repondre({ est_admin: OUI, est_super_admin: OUI });

    render(<Portillon />);

    expect(await screen.findByText('coquille admin · super')).toBeDefined();
  });

  it('ouvre la porte sans l’accorder quand la question du niveau échoue', async () => {
    repondre({ est_admin: OUI, est_super_admin: PANNE });

    render(<Portillon />);

    expect(await screen.findByText('coquille admin')).toBeDefined();
    expect(rpc).toHaveBeenCalledWith('est_super_admin');
  });

  it('ouvre la porte sans l’accorder quand la question du niveau lève', async () => {
    rpc.mockImplementation((nom: string) =>
      nom === 'est_admin' ? Promise.resolve(OUI) : Promise.reject(new Error('coupure')),
    );

    render(<Portillon />);

    expect(await screen.findByText('coquille admin')).toBeDefined();
  });

  it('n’affiche la coquille qu’une fois les deux réponses arrivées', async () => {
    // Sans cette attente, la coquille s'ouvrirait sur le menu court puis
    // l'entrée Super Admin apparaîtrait toute seule une fraction de seconde
    // plus tard — un menu qui bouge sous le curseur.
    let repondreNiveau!: (r: Reponse) => void;
    rpc.mockImplementation((nom: string) =>
      nom === 'est_admin'
        ? Promise.resolve(OUI)
        : new Promise<Reponse>((resoudre) => {
            repondreNiveau = resoudre;
          }),
    );

    const { container } = render(<Portillon />);
    await Promise.resolve();
    expect(container.textContent).toBe('');

    repondreNiveau(OUI);
    expect(await screen.findByText('coquille admin · super')).toBeDefined();
  });
});

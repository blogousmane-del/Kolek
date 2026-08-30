import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VueGlobale } from './donnees';

/**
 * La coquille : ce que le menu montre, et où chaque entrée mène.
 *
 * ## Une entrée de menu qui ne mène nulle part est un défaut
 *
 * `BarreLaterale.tsx` porte deux fois la leçon — entrées mortes retirées le
 * 2026-08-21, raccourcis grisés retirés le 2026-08-22. Le chevron double de
 * l'encart « Kolek · Admin » était le dernier survivant : il annonçait un
 * choix d'espace qui n'existait pas. Il en ouvre un depuis le 2026-08-30, et
 * ces tests sont ce qui l'empêche de redevenir décoratif.
 *
 * Ce que cacher le sélecteur ne fait pas : protéger quoi que ce soit. Les deux
 * Edge Functions redemandent `est_super_admin()` sous l'identité de l'appelant.
 * Le cacher évite d'apprendre à l'administrateur métier qu'il existe un niveau
 * au-dessus du sien, rien de plus.
 */

const VUE = { collecteurs: [], abonnements: {}, totaux: {} } as unknown as VueGlobale;

vi.mock('./donnees', () => ({
  useVueGlobale: () => ({ statut: 'ok', vue: VUE, recharger: vi.fn() }),
}));

vi.mock('./supabase', () => ({
  supabase: { auth: { signOut: () => Promise.resolve({ error: null }) } },
}));

// Les écrans sont remplacés par des témoins : ce test porte sur la navigation,
// pas sur ce que chaque écran affiche. La console de plateforme affiche en plus
// l'entrée qu'on lui a demandée — c'est la barre latérale qui la lui donne
// maintenant, et c'est précisément ce qu'il faut vérifier.
vi.mock('./ecrans/TableauDeBord', () => ({ TableauDeBord: () => <div>écran tableau</div> }));
vi.mock('./ecrans/SuperAdmin', () => ({
  SuperAdmin: ({ onglet }: { onglet: string }) => <div>console plateforme · {onglet}</div>,
}));

const { Coquille } = await import('./Coquille');

afterEach(cleanup);

/** Bascule vers la console de plateforme par le sélecteur d'espace. */
function allerALaPlateforme() {
  fireEvent.click(screen.getByRole('button', { name: /changer d’espace/i }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Kolek · Super Admin/ }));
}

describe('la coquille d’administration', () => {
  it('n’offre pas le sélecteur d’espace à un administrateur métier', () => {
    render(<Coquille />);

    expect(screen.queryByRole('button', { name: /changer d’espace/i })).toBeNull();
    expect(screen.getByText('écran tableau')).toBeDefined();
  });

  it('offre le sélecteur quand le compte est super admin', () => {
    render(<Coquille estSuper />);

    expect(screen.getByRole('button', { name: /changer d’espace/i })).toBeDefined();
    // Toujours sur le Dashboard tant qu'on n'a rien choisi : le niveau ouvre une
    // porte, il ne pousse personne au travers.
    expect(screen.getByText('écran tableau')).toBeDefined();
  });

  it('ouvre la console de plateforme sur son entrée par défaut', () => {
    render(<Coquille estSuper />);

    allerALaPlateforme();

    expect(screen.getByText('console plateforme · abonnements')).toBeDefined();
    expect(screen.queryByText('écran tableau')).toBeNull();
  });

  it('navigue à l’intérieur de la console de plateforme', () => {
    render(<Coquille estSuper />);

    allerALaPlateforme();
    fireEvent.click(screen.getByText('Sécurité'));

    expect(screen.getByText('console plateforme · securite')).toBeDefined();
  });

  it('retrouve chaque espace là où on l’avait laissé', () => {
    render(<Coquille estSuper />);

    allerALaPlateforme();
    fireEvent.click(screen.getByText('Plateforme'));
    expect(screen.getByText('console plateforme · plateforme')).toBeDefined();

    // Retour au Dashboard, puis retour à la plateforme : l'aller-retour ne coûte
    // pas la navigation en plus du trajet.
    fireEvent.click(screen.getByRole('button', { name: /changer d’espace/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Kolek · Admin/ }));
    expect(screen.getByText('écran tableau')).toBeDefined();

    allerALaPlateforme();
    expect(screen.getByText('console plateforme · plateforme')).toBeDefined();
  });
});

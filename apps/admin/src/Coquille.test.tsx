import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VueGlobale } from './donnees';

/**
 * La coquille : ce que le menu montre, et où chaque entrée mène.
 *
 * ## Une entrée de menu qui ne mène nulle part est un défaut
 *
 * `BarreLaterale.tsx` porte deux fois la leçon — entrées mortes retirées le
 * 2026-08-21, raccourcis grisés retirés le 2026-08-22. Ces deux tests sont ce
 * qui empêche l'entrée « Super Admin » de devenir la troisième : elle
 * n'apparaît que pour un super administrateur, et elle ouvre un écran.
 *
 * Ce que cacher l'entrée ne fait pas : protéger quoi que ce soit. Les deux Edge
 * Functions redemandent `est_super_admin()` sous l'identité de l'appelant.
 * Cacher l'entrée évite d'apprendre à l'administrateur métier qu'il existe un
 * niveau au-dessus du sien, rien de plus.
 */

const VUE = { collecteurs: [], abonnements: {}, totaux: {} } as unknown as VueGlobale;

vi.mock('./donnees', () => ({
  useVueGlobale: () => ({ statut: 'ok', vue: VUE, recharger: vi.fn() }),
}));

vi.mock('./supabase', () => ({
  supabase: { auth: { signOut: () => Promise.resolve({ error: null }) } },
}));

// Les écrans sont remplacés par des témoins : ce test porte sur la navigation,
// pas sur ce que chaque écran affiche.
vi.mock('./ecrans/TableauDeBord', () => ({ TableauDeBord: () => <div>écran tableau</div> }));
vi.mock('./ecrans/SuperAdmin', () => ({ SuperAdmin: () => <div>écran super admin</div> }));

const { Coquille } = await import('./Coquille');

afterEach(cleanup);

describe('la coquille d’administration', () => {
  it('ne montre pas l’entrée Super Admin à un administrateur métier', () => {
    render(<Coquille />);

    expect(screen.queryByText('Super Admin')).toBeNull();
    expect(screen.getByText('écran tableau')).toBeDefined();
  });

  it('montre l’entrée quand le compte est super admin', () => {
    render(<Coquille estSuper />);

    expect(screen.getByText('Super Admin')).toBeDefined();
  });

  it('ouvre l’écran Super Admin au clic', () => {
    render(<Coquille estSuper />);

    // `fireEvent` plutôt qu'un `.click()` natif : il enveloppe le geste dans
    // `act`, donc le rendu qui suit le changement de page est bien vidé avant
    // l'assertion. Sans lui, l'écran demandé n'est pas encore là.
    fireEvent.click(screen.getByText('Super Admin'));

    expect(screen.getByText('écran super admin')).toBeDefined();
    expect(screen.queryByText('écran tableau')).toBeNull();
  });
});

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavMobile } from './NavMobile';

afterEach(cleanup);

function barre() {
  return screen.getByRole('navigation', { name: 'Navigation principale' });
}

/**
 * La barre du bas du collecteur.
 *
 * Le bouton rond qui flottait au-dessus de la barre (`-mt-5`, 56 px de
 * diamètre) était la signature la plus reconnaissable des gabarits de 2023.
 * « Encaisser » reste le geste du métier, et il reste distinct ; il le fait
 * dans la barre, en touche pleine, comme sur un tiroir-caisse.
 */
describe('la barre du bas', () => {
  it('porte cinq entrées, dans l’ordre du métier', () => {
    render(<NavMobile actif="accueil" onNaviguer={vi.fn()} />);
    expect(within(barre()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Accueil',
      'Clients',
      'Encaisser',
      'Bilans',
      'Profil',
    ]);
  });

  it('pose la touche « Encaisser » dans la barre, et non au-dessus', () => {
    render(<NavMobile actif="accueil" onNaviguer={vi.fn()} />);
    const touche = within(barre()).getByRole('button', { name: 'Encaisser' });
    expect(touche.className).not.toMatch(/-mt-/);
    expect(touche.className).toContain('rounded-lg');
    expect(touche.className).toContain('bg-primary');
  });

  it('dessine un billet sur la touche, plus un « $ »', () => {
    render(<NavMobile actif="accueil" onNaviguer={vi.fn()} />);
    const svg = within(barre()).getByRole('button', { name: 'Encaisser' }).querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('lucide-banknote');
    expect(svg?.getAttribute('class')).not.toContain('circle-dollar-sign');
  });

  it('dit quelle entrée est la page ouverte', () => {
    render(<NavMobile actif="clients" onNaviguer={vi.fn()} />);
    expect(within(barre()).getByRole('button', { name: 'Clients' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(barre()).getByRole('button', { name: 'Accueil' }).hasAttribute('aria-current')).toBe(
      false,
    );
  });

  it('le dit aussi de la touche, quand on encaisse', () => {
    render(<NavMobile actif="encaisser" onNaviguer={vi.fn()} />);
    expect(
      within(barre()).getByRole('button', { name: 'Encaisser' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('mène où l’on touche', () => {
    const onNaviguer = vi.fn();
    render(<NavMobile actif="accueil" onNaviguer={onNaviguer} />);
    fireEvent.click(within(barre()).getByRole('button', { name: 'Encaisser' }));
    fireEvent.click(within(barre()).getByRole('button', { name: 'Bilans' }));
    expect(onNaviguer.mock.calls).toEqual([['encaisser'], ['bilans']]);
  });
});

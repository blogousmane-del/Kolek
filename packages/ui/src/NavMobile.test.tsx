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
    // Une marge négative, un décalage ou une translation verticale la feraient
    // flotter de nouveau. On ne lit que la classe de la touche : le filet de
    // l'onglet ouvert porte son propre `-top-3`, et c'est licite.
    expect(touche.className).not.toMatch(/-(mt|top|translate-y)-/);
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

  it('pose un filet sur l’onglet ouvert, hors du flux, et sur lui seul', () => {
    render(<NavMobile actif="clients" onNaviguer={vi.fn()} />);
    const filets = barre().querySelectorAll('span[aria-hidden="true"]');
    expect(filets.length).toBe(1);
    const filet = filets[0];
    expect(filet?.parentElement).toBe(within(barre()).getByRole('button', { name: 'Clients' }));
    // Hors du flux : un filet qui compterait dans la hauteur de l'onglet ferait
    // grandir la barre, et la marge que la page lui réserve ne suffirait plus.
    expect(filet?.className).toContain('absolute');
  });

  it('ne dessine aucun filet quand c’est la touche qui est ouverte', () => {
    render(<NavMobile actif="encaisser" onNaviguer={vi.fn()} />);
    expect(barre().querySelectorAll('span[aria-hidden="true"]').length).toBe(0);
  });

  it('cerne la touche seulement quand on encaisse', () => {
    const { rerender } = render(<NavMobile actif="accueil" onNaviguer={vi.fn()} />);
    expect(within(barre()).getByRole('button', { name: 'Encaisser' }).className).not.toContain(
      'ring-2',
    );
    rerender(<NavMobile actif="encaisser" onNaviguer={vi.fn()} />);
    expect(within(barre()).getByRole('button', { name: 'Encaisser' }).className).toContain('ring-2');
  });

  it('mène où l’on touche', () => {
    const onNaviguer = vi.fn();
    render(<NavMobile actif="accueil" onNaviguer={onNaviguer} />);
    fireEvent.click(within(barre()).getByRole('button', { name: 'Encaisser' }));
    fireEvent.click(within(barre()).getByRole('button', { name: 'Bilans' }));
    expect(onNaviguer.mock.calls).toEqual([['encaisser'], ['bilans']]);
  });
});

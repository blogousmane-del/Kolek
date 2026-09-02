import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Navbar } from './Navbar';

// `globals` n'est pas activé : sans cet appel, chaque rendu s'ajoute au
// précédent et les requêtes trouvent deux barres de navigation.
afterEach(cleanup);

/**
 * Ce que ces tests protègent : jusqu'au 2026-09-02, les quatre liens de section
 * étaient `hidden … md:block` et **rien** ne les remplaçait en dessous. Sur la
 * cible déclarée du produit — un téléphone — la navigation n'existait pas.
 *
 * Aucun test ne pouvait le voir, parce que `hidden md:block` est une classe CSS
 * que jsdom n'applique pas. Le panneau, lui, se teste : il porte l'attribut
 * `hidden`, que jsdom comprend.
 */
describe('la navigation au téléphone', () => {
  it('garde le panneau replié à l’arrivée', () => {
    render(<Navbar />);

    expect(screen.getByRole('button', { name: /ouvrir le menu/i }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect((document.getElementById('menu-vitrine') as HTMLElement).hidden).toBe(true);
  });

  it('déplie les quatre liens de section', () => {
    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /ouvrir le menu/i }));

    const panneau = document.getElementById('menu-vitrine') as HTMLElement;
    expect(panneau.hidden).toBe(false);
    expect(screen.getByRole('button', { name: /fermer le menu/i }).getAttribute('aria-expanded')).toBe(
      'true',
    );

    const cibles = [...panneau.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(cibles).toContain('#produit');
    expect(cibles).toContain('#methode');
    expect(cibles).toContain('#tarifs');
    expect(cibles).toContain('#acces');
  });

  it('se referme à l’Échap', () => {
    // Le seul moyen d'en sortir pour qui navigue sans souris.
    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /ouvrir le menu/i }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect((document.getElementById('menu-vitrine') as HTMLElement).hidden).toBe(true);
  });

  it('se referme quand on suit un lien', () => {
    // Sans cela, le panneau resterait posé sur la section qu'on vient d'atteindre.
    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /ouvrir le menu/i }));
    const panneau = document.getElementById('menu-vitrine') as HTMLElement;
    fireEvent.click(panneau.querySelector('a[href="#tarifs"]') as HTMLElement);

    expect(panneau.hidden).toBe(true);
  });
});

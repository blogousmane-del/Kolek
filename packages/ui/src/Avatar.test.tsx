import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar, fondPour, initiales } from './Avatar';

describe('initiales', () => {
  it('prend la première lettre du prénom et du nom', () => {
    expect(initiales('Mariam Koné')).toBe('MK');
  });

  it('gère les noms composés sans produire trois lettres', () => {
    expect(initiales('Jean-Luc Bamba')).toBe('JB');
  });

  it('se contente d’une lettre quand il n’y a qu’un mot', () => {
    expect(initiales('Awa')).toBe('A');
  });

  it('ne casse pas sur une chaîne vide', () => {
    // Le nom vient de la base ; une ligne mal saisie ne doit pas blanchir
    // l'écran entier du collecteur.
    expect(initiales('   ')).toBe('?');
  });
});

describe('fondPour', () => {
  it('donne toujours la même couleur au même nom', () => {
    // Le collecteur reconnaît ses clients à la pastille avant de lire le
    // texte : une couleur qui change d'un rendu à l'autre détruit ce repère.
    expect(fondPour('Mariam Koné')).toBe(fondPour('Mariam Koné'));
  });

  it('ne sort que des couleurs de la palette data-viz', () => {
    const palette = ['bg-chart-mint', 'bg-chart-blue', 'bg-chart-teal', 'bg-chart-slate'];
    for (const nom of ['Awa', 'Mariam Koné', 'Sékou Traoré', 'Fatoumata Diallo', 'Z']) {
      expect(palette).toContain(fondPour(nom));
    }
  });
});

describe('Avatar', () => {
  it('affiche les initiales et garde le nom complet accessible', () => {
    render(<Avatar nom="Adja Touré" />);
    expect(screen.getByText('AT')).toBeDefined();
    expect(screen.getByTitle('Adja Touré')).toBeDefined();
  });
});

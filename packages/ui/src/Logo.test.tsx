import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Logo, Marque } from './Logo';

// `globals` n'est pas activé dans la configuration Vitest de ce paquet :
// `@testing-library/react` ne peut donc pas brancher son nettoyage tout seul.
// Sans cette ligne, les rendus s'empilent dans le document et la deuxième
// requête par rôle en trouve deux.
afterEach(cleanup);

/**
 * Ces tests ne jugent pas le dessin — ils tiennent les deux propriétés qui font
 * qu'un logo reste visible et cohérent partout où on le pose.
 */

describe('le mot suit la couleur de son emplacement', () => {
  it('peint le mot en currentColor et jamais en couleur fixe', () => {
    // Le défaut du 2026-08-24. La planche fournie peignait le mot en `#0E2A1E`
    // dans quatre fichiers sur sept, alors que les cinq emplacements du produit
    // sont sur fond sombre : contraste 1,02:1 dans la barre latérale du
    // collecteur. Un logo invisible passe toutes les revues de code — il ne se
    // voit qu'à l'écran, et seulement si quelqu'un ouvre l'écran en question.
    const { container } = render(<Logo />);
    const traits = container.querySelectorAll('[stroke]');

    const couleurs = [...traits].map((t) => t.getAttribute('stroke'));
    expect(couleurs).toContain('currentColor');
    for (const couleur of couleurs) {
      expect(couleur).not.toMatch(/^#/);
    }
  });
});

describe('la pièce ne dérive pas de la palette', () => {
  it('prend ses deux couleurs aux jetons, jamais à un hexadécimal', () => {
    // `tokens.ts` est la source unique des valeurs visuelles. Un or écrit en
    // dur ici ferait un deuxième or dans le dépôt, et personne ne saurait
    // lequel fait foi.
    const { container } = render(<Marque />);

    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('var(--color-or)');
    expect(container.querySelector('g[stroke]')?.getAttribute('stroke')).toBe(
      'var(--color-sidebar)',
    );
  });
});

describe('nom accessible', () => {
  it('s’annonce « Kolek » par défaut', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Kolek' })).toBeDefined();
  });

  it('se tait quand le parent porte déjà le nom', () => {
    // Le lien de la vitrine est déjà `aria-label="Kolek — haut de page"`. Sans
    // ce mode, un lecteur d'écran annoncerait le nom deux fois.
    const { container } = render(<Marque decoratif />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

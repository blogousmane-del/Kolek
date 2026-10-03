import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Onde } from './Guilloche';

// `globals` n'est pas activé dans la configuration Vitest de ce paquet.

afterEach(cleanup);

function traits(conteneur: HTMLElement) {
  return [...conteneur.querySelectorAll('svg path')];
}

describe('Onde', () => {
  it('trace par défaut un trait qui suit l’étirement de la bande', () => {
    // Les grandes bandes (hero, inscription, connexion, mots de passe) comptent
    // dessus : leur trait grossit avec elles, ce qui est voulu. Le trait fixe
    // ne vaut que pour les bandes minces, sur demande.
    const { container } = render(<Onde lignes={5} />);
    const t = traits(container);
    expect(t).toHaveLength(5);
    expect(t.every((p) => !p.hasAttribute('vector-effect'))).toBe(true);
    expect(t.every((p) => p.getAttribute('stroke-width') === '0.6')).toBe(true);
  });

  it('garde un demi-pixel à l’écran quand on lui demande un trait fixe', () => {
    const { container } = render(<Onde lignes={5} traitFixe />);
    const t = traits(container);
    expect(t).toHaveLength(5);
    expect(t.every((p) => p.getAttribute('vector-effect') === 'non-scaling-stroke')).toBe(true);
    expect(t.every((p) => p.getAttribute('stroke-width') === '0.5')).toBe(true);
  });
});

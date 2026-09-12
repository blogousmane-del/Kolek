import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Repli } from './Repli';

/**
 * Un repli qui démonte son contenu le retire aussi des lecteurs d'écran et de
 * la recherche du navigateur. `<details>` le garde dans le document et confie
 * la visibilité au navigateur : c'est ce qu'il faut ici.
 *
 * La première épreuve est la seule qui compte vraiment. Deux épreuves d'écran
 * lisent les libellés de volumes à travers `getByTestId` : un repli qui
 * démonterait ses enfants les ferait échouer, et les ferait disparaître pour
 * un lecteur d'écran sans que rien ne le signale.
 */

afterEach(cleanup);

describe('Repli', () => {
  it('garde son contenu dans le document même fermé', () => {
    render(
      <Repli titre="Détail technique">
        <p>Collecteurs : 65</p>
      </Repli>,
    );

    expect(screen.getByText('Collecteurs : 65')).toBeDefined();
  });

  it('est fermé par défaut', () => {
    const { container } = render(
      <Repli titre="Détail technique">
        <p>Collecteurs : 65</p>
      </Repli>,
    );

    expect(container.querySelector('details')?.open).toBe(false);
  });

  it('s’ouvre quand on le lui demande', () => {
    const { container } = render(
      <Repli titre="Détail technique" ouvertParDefaut>
        <p>Collecteurs : 65</p>
      </Repli>,
    );

    expect(container.querySelector('details')?.open).toBe(true);
  });

  it('porte son titre dans le résumé', () => {
    render(
      <Repli titre="Détail technique">
        <p>Collecteurs : 65</p>
      </Repli>,
    );

    expect(screen.getByText('Détail technique')).toBeDefined();
  });
});

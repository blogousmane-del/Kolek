import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Feuille } from './Feuille';

afterEach(cleanup);

function rendre(onFermer = vi.fn()) {
  render(
    <Feuille titre="Rendre 30 000 FCFA ?" sousTitre="à Rokia" ouverte onFermer={onFermer}>
      <p>contenu</p>
    </Feuille>,
  );
  return onFermer;
}

describe('la feuille', () => {
  it('se nomme par son titre', () => {
    rendre();
    expect(screen.getByRole('dialog', { name: 'Rendre 30 000 FCFA ?' })).toBeTruthy();
  });

  it('voile la page de la nuit du coffre, et non de noir', () => {
    rendre();
    // Le voile est le premier des deux boutons « Fermer » : il couvre la page.
    const voile = screen.getAllByRole('button', { name: 'Fermer' })[0];
    expect(voile?.className).toContain('bg-dark-canvas/48');
    expect(voile?.className).not.toContain('bg-black');
  });

  it('se ferme à Échap', () => {
    const onFermer = rendre();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onFermer).toHaveBeenCalledOnce();
  });
});

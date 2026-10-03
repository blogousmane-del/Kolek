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

  it('laisse le sous-titre passer à la ligne : un nom long ne se coupe pas d’une ellipse', () => {
    // Le montant tient dans le titre, qui reste sur une ligne. Le sous-titre porte
    // le nom du client, qui peut être long : coupé, le collecteur confirmerait un
    // retrait sans lire pour qui. Il passe donc à la ligne, et casse un mot trop
    // long pour la largeur plutôt que de déborder.
    const NOM = 'à Awa Traoré Koné, marché de gros de la zone industrielle de Yopougon Sud';
    render(
      <Feuille titre="Rendre 30 000 FCFA ?" sousTitre={NOM} ouverte onFermer={vi.fn()}>
        <p>contenu</p>
      </Feuille>,
    );

    const sousTitre = screen.getByText(NOM);

    expect(sousTitre.classList.contains('truncate')).toBe(false);
    expect(sousTitre.classList.contains('break-words')).toBe(true);
  });
});

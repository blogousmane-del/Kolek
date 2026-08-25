import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionsCarte } from './ActionsCarte';

// `globals` n'est pas activé dans la configuration Vitest de ce paquet : sans
// cet appel, chaque rendu s'ajoute au précédent et les requêtes trouvent deux
// boutons du même nom.
afterEach(cleanup);

describe('ActionsCarte', () => {
  it('rend un bouton par action', () => {
    render(
      <ActionsCarte
        actions={[
          { icone: 'circle-dollar-sign', libelle: 'Encaisser', onActiver: vi.fn() },
          { icone: 'arrow-up-right', libelle: 'Retrait', onActiver: vi.fn() },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Encaisser' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retrait' })).toBeTruthy();
  });

  it('garde une action indisponible affichée, et la désactive', () => {
    // Le retirer ferait glisser les autres sous un doigt déjà en route — et le
    // doigt appuierait sur ce qui a pris la place. Sur cette rangée, la place
    // qui suit « Encaisser » est « Retrait » : un geste qui sort de l'argent.
    render(
      <ActionsCarte
        actions={[
          { icone: 'circle-dollar-sign', libelle: 'Encaisser', indisponible: 'Cycle terminé' },
          { icone: 'arrow-up-right', libelle: 'Retrait', onActiver: vi.fn() },
        ]}
      />,
    );

    const encaisser = screen.getByRole('button', { name: 'Encaisser' }) as HTMLButtonElement;
    expect(encaisser.disabled).toBe(true);
    expect(encaisser.title).toBe('Cycle terminé');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('appelle le rappel de l’action touchée, et elle seule', () => {
    const encaisser = vi.fn();
    const retrait = vi.fn();
    render(
      <ActionsCarte
        actions={[
          { icone: 'circle-dollar-sign', libelle: 'Encaisser', onActiver: encaisser },
          { icone: 'arrow-up-right', libelle: 'Retrait', onActiver: retrait },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retrait' }));
    expect(retrait).toHaveBeenCalledTimes(1);
    expect(encaisser).not.toHaveBeenCalled();
  });
});

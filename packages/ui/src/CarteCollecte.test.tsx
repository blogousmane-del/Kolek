import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CarteCollecte } from './CarteCollecte';

// `globals` n'est pas activé dans la configuration Vitest de ce paquet.

afterEach(cleanup);

function rendre(action?: React.ReactNode) {
  return render(
    <CarteCollecte
      nomClient="Aïcha"
      misePar="5 000"
      jourCourant={3}
      solde="10 000"
      cycle="1"
      action={action}
    />,
  );
}

describe('CarteCollecte — la fente du pied', () => {
  it('ne porte rien tant qu\'on ne lui donne rien', () => {
    // La fente n'appartient qu'à la carte choisie. Une carte qu'on regarde
    // sans l'avoir touchée ne doit rien proposer.
    rendre();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pose ce qu\'on lui donne, sous le solde', () => {
    rendre(
      <button type="button">Encaisser 5 000 FCFA</button>,
    );

    const bouton = screen.getByRole('button', { name: 'Encaisser 5 000 FCFA' });
    expect(bouton).toBeTruthy();

    // Sous le solde, et non par-dessus : le solde est précisément ce qu'on
    // regarde avant d'encaisser. Un calque l'aurait masqué.
    const solde = screen.getByText('Solde restituable');
    expect(solde.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Outils, type Outil } from './Outils';

afterEach(cleanup);

/**
 * La grille des outils de l'accueil du collecteur.
 *
 * Elle remplace, sur l'accueil seulement, les tuiles pastel d'`ActionsRapides`
 * et leurs quatre familles de couleur. `ActionsRapides` reste : le tableau de
 * bord de l'administration s'en sert, et l'administration a son propre
 * chantier.
 */
const OUTILS: Outil[] = [
  { icone: 'user-plus', libelle: 'Souscrire', onActiver: vi.fn() },
  { icone: 'scale', libelle: 'Rapprochement', onActiver: vi.fn() },
  { icone: 'receipt-text', libelle: 'Reçus', onActiver: vi.fn() },
];

describe('les outils', () => {
  it('rendent un bouton par outil, nommé par son libellé', () => {
    render(<Outils outils={OUTILS} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Souscrire',
      'Rapprochement',
      'Reçus',
    ]);
  });

  it('ouvrent l’outil touché', () => {
    const onActiver = vi.fn();
    render(<Outils outils={[{ icone: 'bell', libelle: 'Alertes', onActiver }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alertes' }));
    expect(onActiver).toHaveBeenCalledOnce();
  });

  it('ne portent aucune couleur de famille', () => {
    const { container } = render(<Outils outils={OUTILS} />);
    expect(container.innerHTML).not.toMatch(/tuile/);
  });

  it('étirent le dernier outil quand la rangée de deux est incomplète', () => {
    render(<Outils outils={OUTILS} />);
    expect(screen.getByRole('button', { name: 'Reçus' }).className).toContain('col-span-2');
    expect(screen.getByRole('button', { name: 'Souscrire' }).className).not.toContain('col-span-2');
  });

  it('éteignent un outil sans destination, et le disent', () => {
    render(<Outils outils={[{ icone: 'bell', libelle: 'Alertes' }]} />);
    const bouton = screen.getByRole('button', { name: 'Alertes' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(bouton.title).toBe('À venir');
  });
});
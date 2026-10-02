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

  it('se rangent sur deux colonnes, quatre avec la barre latérale', () => {
    const { container } = render(<Outils outils={OUTILS} />);
    const grille = container.querySelector('.grid');
    expect(grille?.className).toContain('grid-cols-2');
    expect(grille?.className).toContain('lg:grid-cols-4');
    expect(grille?.className).not.toMatch(/sm:grid-cols/);
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
    const dernier = screen.getByRole('button', { name: 'Reçus' });
    const premier = screen.getByRole('button', { name: 'Souscrire' });
    expect(dernier.className).toContain('col-span-2');
    expect(dernier.className).not.toContain('col-span-1');
    expect(premier.className).not.toContain('col-span-2');
    // Sans `break-words`, « Rapprochement » (environ 100 px) reste sur une
    // seule ligne dans les 86 px que laisse une tuile à 320 px, et
    // `line-clamp-2` le rogne en silence.
    const libelle = dernier.querySelector('span');
    expect(libelle?.className).toContain('break-words');
    expect(libelle?.className).toContain('line-clamp-2');
    expect(libelle?.className).not.toContain('truncate');
  });

  it('éteignent un outil sans destination, et le disent', () => {
    render(<Outils outils={[{ icone: 'bell', libelle: 'Alertes' }]} />);
    const bouton = screen.getByRole('button', { name: 'Alertes' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(bouton.title).toBe('À venir');
  });
});

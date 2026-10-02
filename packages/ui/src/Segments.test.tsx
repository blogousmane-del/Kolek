import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Segments, type Segment } from './Segments';

afterEach(cleanup);

type Cle = 'Toutes' | 'Cycle terminé' | 'En cours';
const SEGMENTS: Segment<Cle>[] = [
  { cle: 'Toutes', libelle: 'Toutes', compte: 38 },
  { cle: 'Cycle terminé', libelle: 'Cycle terminé', compte: 3 },
  { cle: 'En cours', libelle: 'En cours', compte: 35 },
];

function rendre(onChoisir = vi.fn(), choisi: Cle = 'Toutes') {
  return render(
    <Segments nom="Filtrer les cartes" segments={SEGMENTS} choisi={choisi} onChoisir={onChoisir} />,
  );
}

describe('les segments', () => {
  it('se rangent dans un groupe nommé', () => {
    rendre();
    expect(screen.getByRole('group', { name: 'Filtrer les cartes' })).toBeTruthy();
  });

  it('nomment chaque choix par son libellé seul, le compte à part', () => {
    rendre();
    expect(screen.getByRole('button', { name: 'Cycle terminé' })).toBeTruthy();
    const groupe = screen.getByRole('group', { name: 'Filtrer les cartes' });
    expect(within(groupe).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Toutes38',
      'Cycle terminé3',
      'En cours35',
    ]);
    expect(screen.getByText('3').getAttribute('aria-hidden')).toBe('true');
  });

  it('disent lequel est choisi', () => {
    rendre(vi.fn(), 'En cours');
    expect(screen.getByRole('button', { name: 'En cours' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Toutes' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('rendent le choix touché', () => {
    const onChoisir = vi.fn();
    rendre(onChoisir);
    fireEvent.click(screen.getByRole('button', { name: 'Cycle terminé' }));
    expect(onChoisir).toHaveBeenCalledWith('Cycle terminé');
  });

  it('se passent de compte quand on n’en donne pas', () => {
    render(
      <Segments
        nom="Période"
        segments={[
          { cle: 'jour', libelle: 'Jour' },
          { cle: 'mois', libelle: 'Mois' },
        ]}
        choisi="jour"
        onChoisir={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Jour' }).textContent).toBe('Jour');
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CarrouselCartes, type CarteItem } from './CarrouselCartes';

// `globals` n'est pas activé dans la configuration Vitest de ce paquet.
afterEach(cleanup);

function carte(id: string, nom: string): CarteItem {
  return { id, nomClient: nom, misePar: '5 000', jourCourant: 3, solde: '10 000', cycle: '1' };
}

const TROIS = [carte('a', 'Aïcha'), carte('b', 'Bintou'), carte('c', 'Chérif')];

describe('CarrouselCartes', () => {
  it('ne défile pas et ne compte pas quand il n’y a qu’une carte', () => {
    // Un carrousel qui montre des points là où il n'y a rien à parcourir promet
    // un ailleurs qui n'existe pas.
    render(<CarrouselCartes cartes={[carte('a', 'Aïcha')]} visibleId="a" onVisible={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    const piste = screen.getByRole('group');
    expect(piste.className).not.toMatch(/overflow-x-auto/);
    expect(piste.getAttribute('tabindex')).toBe('-1');
  });

  it('donne un point par carte, et dit lequel est en face', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="b" onVisible={vi.fn()} />);

    const points = screen.getAllByRole('button');
    expect(points).toHaveLength(3);
    expect(points[1].getAttribute('aria-label')).toBe('Carte 2 sur 3');
    expect(points[1].getAttribute('aria-current')).toBe('true');
    expect(points[0].getAttribute('aria-current')).toBe('false');
  });

  it('remonte la carte choisie au clic sur son point', () => {
    const onVisible = vi.fn();
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={onVisible} />);

    fireEvent.click(screen.getByRole('button', { name: 'Carte 3 sur 3' }));
    expect(onVisible).toHaveBeenCalledWith('c');
  });

  it('avance et recule au clavier, sans sortir des bornes', () => {
    const onVisible = vi.fn();
    const { rerender } = render(
      <CarrouselCartes cartes={TROIS} visibleId="a" onVisible={onVisible} />,
    );
    const piste = screen.getByRole('group');

    // Sur la première carte, la flèche gauche ne doit rien remonter : un rappel
    // pour un déplacement qui n'a pas eu lieu ferait clignoter la rangée
    // d'actions sans que rien ne bouge.
    fireEvent.keyDown(piste, { key: 'ArrowLeft' });
    expect(onVisible).not.toHaveBeenCalled();

    fireEvent.keyDown(piste, { key: 'ArrowRight' });
    expect(onVisible).toHaveBeenLastCalledWith('b');

    rerender(<CarrouselCartes cartes={TROIS} visibleId="c" onVisible={onVisible} />);
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight' });
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('nomme chaque carte par son rang, pour la lecture à voix haute', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />);

    expect(screen.getAllByRole('listitem')[2].getAttribute('aria-label')).toBe('Carte 3 sur 3');
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe('3 cartes en cours');
  });
});

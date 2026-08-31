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

/**
 * Le déplacement des cartes, ajouté le 2026-08-31.
 *
 * ## Pourquoi le clavier porte ces tests, et pas le doigt
 *
 * Le geste tactile repose sur trois choses que jsdom ne fournit pas : une
 * géométrie mesurée, une capture de pointeur, et un minuteur qui court pendant
 * qu'un doigt reste immobile. Les tester à travers un rendu reviendrait à
 * tester des simulacres.
 *
 * Le calcul, lui, est isolé dans `reordonner.ts` et testé là — bornes, bascule
 * à mi-carte, et le cas d'une largeur nulle qui est précisément celui de jsdom.
 *
 * Restent ici les deux choses que le rendu peut réellement dire : que le
 * clavier déplace, et que l'affichage suit.
 */
describe('CarrouselCartes — déplacer les cartes', () => {
  function nomsAffiches(): string[] {
    return screen.getAllByText(/Aïcha|Bintou|Chérif/).map((n) => n.textContent ?? '');
  }

  it('déplace la carte courante avec Maj + flèche', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />);
    const piste = screen.getByRole('group');

    expect(nomsAffiches()).toEqual(['Aïcha', 'Bintou', 'Chérif']);

    fireEvent.keyDown(piste, { key: 'ArrowRight', shiftKey: true });
    expect(nomsAffiches()).toEqual(['Bintou', 'Aïcha', 'Chérif']);

    fireEvent.keyDown(piste, { key: 'ArrowRight', shiftKey: true });
    expect(nomsAffiches()).toEqual(['Bintou', 'Chérif', 'Aïcha']);
  });

  it('ne pousse pas une carte hors de la main', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />);
    const piste = screen.getByRole('group');

    fireEvent.keyDown(piste, { key: 'ArrowLeft', shiftKey: true });
    expect(nomsAffiches()).toEqual(['Aïcha', 'Bintou', 'Chérif']);
  });

  it('déplace sans changer la carte regardée', () => {
    // La distinction qui donne son sens à la touche Maj : la flèche seule
    // change ce qu'on regarde, Maj change où la carte se range. Confondre les
    // deux ferait sauter l'écran à chaque rangement.
    const onVisible = vi.fn();
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={onVisible} />);

    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight', shiftKey: true });
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('dit à voix haute où la carte a été rangée', () => {
    // Une carte qui change de place sans rien dire est un déplacement
    // invisible — et cet écran se tient à bout de bras, en plein soleil.
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByRole('status').textContent).toBe('Carte déplacée en position 2 sur 3.');
  });

  it('garde l’ordre choisi quand une carte est clôturée', () => {
    // L'ordre vit par identifiants, pas par rangs : un rang ne survit pas à une
    // carte qui disparaît, un identifiant si.
    const { rerender } = render(
      <CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />,
    );

    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight', shiftKey: true });
    expect(nomsAffiches()).toEqual(['Bintou', 'Aïcha', 'Chérif']);

    rerender(
      <CarrouselCartes
        cartes={[carte('a', 'Aïcha'), carte('c', 'Chérif')]}
        visibleId="a"
        onVisible={vi.fn()}
      />,
    );
    expect(nomsAffiches()).toEqual(['Aïcha', 'Chérif']);
  });

  it('pose une carte neuve à la fin, sans défaire le rangement', () => {
    const { rerender } = render(
      <CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />,
    );

    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight', shiftKey: true });
    rerender(
      <CarrouselCartes
        cartes={[...TROIS, carte('d', 'Bintou')]}
        visibleId="a"
        onVisible={vi.fn()}
      />,
    );

    // Bintou apparaît deux fois — celle rangée en tête, et la neuve en queue.
    expect(nomsAffiches()).toEqual(['Bintou', 'Aïcha', 'Chérif', 'Bintou']);
  });
});

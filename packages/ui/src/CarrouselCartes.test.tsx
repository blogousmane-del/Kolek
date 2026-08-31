import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CarrouselCartes, type CarteItem } from './CarrouselCartes';

// `globals` n'est pas activé dans la configuration Vitest de ce paquet.

// La taille des cartes se garde sur l'appareil : sans ce nettoyage, un test qui
// agrandit dicterait la taille de départ de tous les suivants.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

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

    const points = screen.getAllByRole('button', { name: /^Carte / });
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

/**
 * Les trois tailles, ajoutées le 2026-08-31.
 *
 * Le nombre de cartes réellement visibles ensemble dépend d'une largeur d'écran
 * que jsdom ne calcule pas. Ce qui se teste ici est ce qui la décide : la
 * largeur posée sur chaque carte, et la taille annoncée par la commande.
 */
describe('CarrouselCartes — la taille des cartes', () => {
  function classesDe(rang: number): string {
    return screen.getAllByRole('listitem')[rang].className;
  }

  it('ne propose aucune taille pour une carte seule', () => {
    // Réduire une carte unique ne montrerait rien de plus, et laisserait un
    // vide à côté de rien.
    render(<CarrouselCartes cartes={[carte('a', 'Aïcha')]} visibleId="a" onVisible={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Réduire' })).toBeNull();
    expect(classesDe(0)).toMatch(/w-full/);
  });

  it('ouvre en petit, pour que deux cartes tiennent ensemble', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />);

    const petit = screen.getByRole('button', { name: 'Réduire' });
    expect(petit.getAttribute('aria-pressed')).toBe('true');
    expect(classesDe(0)).toMatch(/w-40/);
  });

  it('agrandit jusqu’à une carte par écran', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agrandir' }));

    expect(classesDe(0)).toMatch(/w-full/);
    expect(screen.getByRole('button', { name: 'Agrandir' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Réduire' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('retrouve la taille choisie la fois d’avant', () => {
    // Un ordre parle de ces cartes-là chez ce client, et meurt avec l'écran.
    // Une taille parle de l'écran du téléphone : la redemander à chaque
    // ouverture, c'est reposer une question déjà tranchée.
    const { unmount } = render(
      <CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir' }));
    unmount();

    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Agrandir' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(classesDe(0)).toMatch(/w-full/);
  });
});

/**
 * Quelle carte le bouton d'encaissement va servir.
 *
 * C'est la question la plus chère de cet écran : se tromper de carte, c'est
 * encaisser sur le mauvais cycle. Chacun de ces tests garde une des trois
 * manières de la désigner, ou une des deux manières de ne pas la désigner.
 */
describe('CarrouselCartes — choisir la carte que le bouton servira', () => {
  it('choisit la carte qu’on touche', () => {
    const onVisible = vi.fn();
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={onVisible} />);

    fireEvent.click(screen.getAllByRole('listitem')[2]);
    expect(onVisible).toHaveBeenCalledWith('c');
  });

  it('marque la carte choisie, pour qu’aucun doute ne porte sur le montant', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="b" onVisible={vi.fn()} />);

    const cartes = screen.getAllByRole('listitem');
    expect(cartes[1].getAttribute('aria-current')).toBe('true');
    expect(cartes[1].className).toMatch(/ring-primary/);
    expect(cartes[0].className).not.toMatch(/ring-primary/);
  });

  it('ne choisit pas la carte qu’on vient de ranger', () => {
    // Un appui long produit aussi un clic au relâchement. Sans témoin, chaque
    // rangement changerait le montant du bouton en même temps que l'ordre.
    vi.useFakeTimers();
    try {
      const onVisible = vi.fn();
      render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={onVisible} />);

      const troisieme = screen.getAllByRole('listitem')[2];
      fireEvent.pointerDown(troisieme, { clientX: 100, pointerId: 1 });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      fireEvent.pointerUp(troisieme);
      fireEvent.click(troisieme);

      expect(onVisible).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne laisse plus le défilement désigner quand les cartes tiennent ensemble', () => {
    const onVisible = vi.fn();
    render(<CarrouselCartes cartes={TROIS} visibleId="a" onVisible={onVisible} />);

    // jsdom ne calcule aucune géométrie : la piste est posée à la main, sinon
    // la garde de division par zéro rendrait ce test vert pour la mauvaise
    // raison.
    const piste = screen.getByRole('group');
    Object.defineProperty(piste, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(piste, 'scrollLeft', { value: 600, configurable: true });

    fireEvent.scroll(piste);
    expect(onVisible).not.toHaveBeenCalled();

    // Une carte par écran : la position du défilement redevient la désignation.
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir' }));
    fireEvent.scroll(piste);
    expect(onVisible).toHaveBeenCalledWith('c');
  });
});

import { describe, expect, it } from 'vitest';

import { deplacer, ordreSuivant, rangCible } from './reordonner';

/**
 * Réordonner une main de cartes.
 *
 * Les trois fonctions sont pures et sans DOM, ce qui est le seul moyen de
 * tester un calcul de rang : jsdom ne calcule aucune géométrie, donc rien de ce
 * qui dépend d'une largeur mesurée ne peut être vérifié à travers un rendu.
 */

describe('deplacer', () => {
  it('tire une carte et l’insère ailleurs, le reste glisse', () => {
    // Le test qui distingue un déplacement d'un échange. En échangeant, on
    // obtiendrait ['d','b','c','a'] — la carte voisine irait à la place qu'on
    // vient de quitter, ce que la main ne fait pas.
    expect(deplacer(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(deplacer(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(deplacer(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('ne touche à rien quand le geste sort de la main', () => {
    // Un glissement qui quitte l'écran est un geste courant, pas une erreur.
    const main = ['a', 'b', 'c'];
    expect(deplacer(main, -1, 1)).toEqual(main);
    expect(deplacer(main, 0, 9)).toEqual(main);
    expect(deplacer(main, 1, 1)).toEqual(main);
    expect(deplacer([], 0, 0)).toEqual([]);
  });

  it('rend une copie, jamais la liste d’origine', () => {
    // L'état React qui la porte doit changer d'identité, sinon le rendu ne
    // repart pas et la carte reste visuellement là où on l'a prise.
    const main = ['a', 'b'];
    expect(deplacer(main, 0, 1)).not.toBe(main);
    expect(main).toEqual(['a', 'b']);
  });
});

describe('ordreSuivant', () => {
  it('garde la place choisie tant que la carte est là', () => {
    expect(ordreSuivant(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('laisse partir une carte clôturée sans défaire le reste', () => {
    expect(ordreSuivant(['c', 'a', 'b'], ['a', 'c'])).toEqual(['c', 'a']);
  });

  it('pose une carte neuve à la fin, jamais au milieu', () => {
    // Insérer une nouveauté au centre d'une main qu'on vient de ranger défait
    // le rangement sous les yeux de celui qui l'a fait.
    expect(ordreSuivant(['c', 'a'], ['a', 'c', 'neuve'])).toEqual(['c', 'a', 'neuve']);
  });

  it('prend l’ordre du serveur quand rien n’a été choisi', () => {
    expect(ordreSuivant([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('ne rend jamais deux fois la même carte', () => {
    // Un ordre qui aurait doublé une entrée — reprise d'état malheureuse —
    // afficherait la même carte deux fois et ferait diverger les rangs.
    expect(ordreSuivant(['a', 'a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('rangCible', () => {
  it('bascule à la moitié de la carte voisine, pas à sa totalité', () => {
    // Attendre la largeur entière donne l'impression que la main résiste : le
    // rang change une fois le doigt déjà passé au-delà de l'endroit visé.
    expect(rangCible(0, 49, 100, 4)).toBe(0);
    expect(rangCible(0, 51, 100, 4)).toBe(1);
    expect(rangCible(2, -51, 100, 4)).toBe(1);
  });

  it('se borne à la main plutôt que de sortir', () => {
    expect(rangCible(0, -500, 100, 4)).toBe(0);
    expect(rangCible(3, 500, 100, 4)).toBe(3);
  });

  it('rend le rang de départ quand rien n’est mesuré', () => {
    // Le cas de jsdom, et celui d'un écran qui n'a pas fini sa mise en page.
    // Sans cette garde, la division rendrait NaN, et NaN borné donne zéro :
    // toutes les cartes remonteraient en tête au premier geste.
    expect(rangCible(2, 300, 0, 4)).toBe(2);
    expect(rangCible(2, 300, -10, 4)).toBe(2);
    expect(rangCible(2, 300, 100, 0)).toBe(2);
  });
});

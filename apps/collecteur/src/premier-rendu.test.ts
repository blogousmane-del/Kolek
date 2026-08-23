import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { rangCascade, usePremierRendu } from './premier-rendu';

/**
 * Le défaut que ce module existe pour empêcher.
 *
 * Les listes du collecteur se relisent après chaque écriture : la coquille
 * incrémente `revision`, et l'écran se re-rend. Sans mémo, la cascade
 * rejouerait à chaque mise encaissée — la liste clignoterait sous les yeux du
 * collecteur, trente fois par jour, au moment précis où il vérifie que
 * l'argent est bien enregistré.
 *
 * Une animation qui se déclenche au mauvais moment est pire que pas
 * d'animation du tout.
 */

describe('usePremierRendu', () => {
  it('rend vrai au premier rendu', () => {
    const { result } = renderHook(() => usePremierRendu());
    expect(result.current).toBe(true);
  });

  it('rend faux dès le second rendu', () => {
    const { result, rerender } = renderHook(() => usePremierRendu());
    rerender();
    expect(result.current).toBe(false);
  });

  it('reste faux après plusieurs re-rendus', () => {
    const { result, rerender } = renderHook(() => usePremierRendu());
    rerender();
    rerender();
    rerender();
    expect(result.current).toBe(false);
  });
});

describe('rangCascade', () => {
  it('pose le rang quand c’est le premier rendu', () => {
    expect(rangCascade(3, true)).toEqual({ '--rang': 3 });
  });

  it('ne pose rien quand ce n’est pas le premier rendu', () => {
    expect(rangCascade(3, false)).toBeUndefined();
  });

  it('pose zéro pour la première rangée', () => {
    expect(rangCascade(0, true)).toEqual({ '--rang': 0 });
  });
});

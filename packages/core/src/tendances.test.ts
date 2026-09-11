import { describe, expect, it } from 'vitest';

import { variation } from './tendances';

/**
 * L'insécable est construite par son code, jamais tapée : écrite en séquence
 * d'échappement, elle arrive dans le fichier comme le caractère lui-même,
 * invisible à la relecture.
 */
const INSECABLE = String.fromCharCode(160);

describe('variation', () => {
  it('rend une hausse en pourcentage entier', () => {
    expect(variation(114, 100)).toEqual({
      pourcentage: 14,
      positive: true,
      libelle: `+14${INSECABLE}%`,
    });
  });

  it('rend une baisse, signe compris', () => {
    expect(variation(80, 100)).toEqual({
      pourcentage: -20,
      positive: false,
      libelle: `-20${INSECABLE}%`,
    });
  });

  it('arrondit à l’entier le plus proche', () => {
    expect(variation(1006, 1000)?.libelle).toBe(`+1${INSECABLE}%`);
    expect(variation(1004, 1000)?.libelle).toBe(`0${INSECABLE}%`);
  });

  it('traite l’égalité comme une variation nulle, pas comme une hausse', () => {
    const v = variation(500, 500);
    expect(v?.pourcentage).toBe(0);
    expect(v?.libelle).toBe(`0${INSECABLE}%`);
    expect(v?.positive).toBe(true);
  });

  it('ne compare rien à une période précédente vide', () => {
    // Passer de 0 à 5 000 n'est pas « +100 % » : c'est une première fois, et
    // aucun pourcentage ne la décrit. L'écran dira la phrase, pas la pastille.
    expect(variation(5000, 0)).toBeNull();
  });

  it('ne compare rien quand les deux périodes sont vides', () => {
    expect(variation(0, 0)).toBeNull();
  });

  it('refuse une période précédente négative, qui n’a pas de sens', () => {
    expect(variation(100, -50)).toBeNull();
  });

  it('rend une baisse totale quand la période courante est vide', () => {
    expect(variation(0, 400)).toEqual({
      pourcentage: -100,
      positive: false,
      libelle: `-100${INSECABLE}%`,
    });
  });

  it('borne l’affichage des hausses démesurées', () => {
    // Une hausse de 12 900 % sur une pastille de soixante pixels ne se lit
    // pas, et le chiffre exact n'apprend rien de plus que « beaucoup ». Il
    // reste lisible dans `pourcentage`, pour un journal.
    expect(variation(130_000, 1_000)?.libelle).toBe(`+999${INSECABLE}%`);
    expect(variation(130_000, 1_000)?.pourcentage).toBe(12_900);
  });

  it('refuse ce qui n’est pas un nombre fini', () => {
    expect(variation(Number.NaN, 100)).toBeNull();
    expect(variation(100, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

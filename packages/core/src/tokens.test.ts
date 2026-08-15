import { describe, expect, it } from 'vitest';
import { couleurs, genererCssTokens, rayons } from './tokens';

describe('tokens du Design System', () => {
  it("porte la couleur d'action de la marque", () => {
    expect(couleurs.green700).toBe('#14402C');
  });

  it("porte les couleurs sémantiques du Design System §3.1", () => {
    expect(couleurs.positive).toBe('#1C7A4B');
    expect(couleurs.negative).toBe('#C1553E');
    expect(couleurs.info).toBe('#3D6E8E');
  });

  it("ne contient aucun or — décision actée du Design System §1", () => {
    const interdits = ['#D9A84E', '#B07D2B'];
    for (const or of interdits) {
      expect(Object.values(couleurs)).not.toContain(or);
    }
  });

  it('porte le rayon des pilules', () => {
    expect(rayons.pill).toBe('9999px');
  });
});

describe('genererCssTokens', () => {
  it('produit un bloc :root avec les variables attendues', () => {
    const css = genererCssTokens();
    expect(css).toContain(':root {');
    expect(css).toContain('--green-700: #14402C;');
    expect(css).toContain('--r-lg: 16px;');
    expect(css).toContain('--shadow-sm:');
  });

  it('convertit chaque clé en variable CSS kebab-case', () => {
    const css = genererCssTokens();
    expect(css).toContain('--chart-blue: #9FC2DA;');
    expect(css).toContain('--space-16: 16px;');
    expect(css).toContain('--font-titre-page: 28px;');
  });

  it('ne produit aucun nom à chiffre isolé du type --space-e-2', () => {
    expect(genererCssTokens()).not.toMatch(/--[a-z-]*-\d-\d/);
  });
});

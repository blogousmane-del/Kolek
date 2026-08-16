import { describe, expect, it } from 'vitest';
import { couleurs, genererCssTheme, grille, mesures, rayons, taillesTexte } from './tokens';

describe('tokens du Design System', () => {
  it("porte la couleur d'action de la marque", () => {
    expect(couleurs.primary).toBe('#14402C');
  });

  it('porte les couleurs sémantiques du Design System §3.1', () => {
    expect(couleurs.positive).toBe('#1C7A4B');
    expect(couleurs.negative).toBe('#C1553E');
    expect(couleurs.info).toBe('#3D6E8E');
  });

  it('ne contient aucun or — décision actée du Design System §1', () => {
    const interdits = ['#D9A84E', '#B07D2B'];
    for (const or of interdits) {
      expect(Object.values(couleurs)).not.toContain(or);
    }
  });

  it('distingue la surface muette du texte muet', () => {
    // Les confondre donnerait du gris sur gris sur les pistes de jauge et les
    // en-têtes de tableau.
    expect(couleurs.muted).not.toBe(couleurs.mutedForeground);
  });

  it('porte le rayon des pilules', () => {
    expect(rayons.pill).toBe('9999px');
  });

  it('porte les largeurs de conteneur, pour que les écrans cessent de les inventer', () => {
    expect(mesures.formulaire).toBe('360px');
    expect(genererCssTheme()).toContain('--container-formulaire: 360px;');
  });

  it('tient l’échelle typographique du Design System §3.2', () => {
    expect(taillesTexte.base).toBe('15px'); // Body
    expect(taillesTexte['3xl']).toBe('28px'); // H1 — titre de page
    expect(taillesTexte['4xl']).toBe('36px'); // Metric XL, fourchette 32–40
  });
});

describe('genererCssTheme', () => {
  it('produit un bloc @theme, seule forme que Tailwind lit', () => {
    const css = genererCssTheme();
    expect(css).toContain('@theme {');
    expect(css).toContain('--color-primary: #14402C;');
    expect(css).toContain('--radius-lg: 16px;');
    expect(css).toContain('--shadow-sm:');
  });

  it('déclare la grille de 4 px dont dérive tout l’espacement', () => {
    expect(grille).toBe('4px');
    expect(genererCssTheme()).toContain('--spacing: 4px;');
  });

  it('convertit chaque clé en variable CSS kebab-case', () => {
    const css = genererCssTheme();
    expect(css).toContain('--color-chart-blue: #9FC2DA;');
    expect(css).toContain('--color-muted-foreground: #6C716A;');
    expect(css).toContain('--text-2xl: 24px;');
    expect(css).toContain('--font-headings:');
  });

  it('n’éclate pas les tailles en t-shirt du type --text-2-xl', () => {
    expect(genererCssTheme()).not.toMatch(/--text-\d-[a-z]/);
  });

  it('n’émet aucune valeur vide — un jeton absent casse une classe entière', () => {
    for (const ligne of genererCssTheme().split('\n')) {
      if (!ligne.trim().startsWith('--')) continue;
      expect(ligne).toMatch(/^ {2}--[a-z0-9-]+: \S.*;$/);
    }
  });
});

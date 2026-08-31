import { describe, expect, it } from 'vitest';
import { couleurs, genererCssTheme, grille, mesures, rayons, taillesTexte } from './tokens';

describe('tokens du Design System', () => {
  it("porte la couleur d'action de la marque", () => {
    expect(couleurs.primary).toBe('#14402C');
  });

  it('porte les couleurs sémantiques du Design System §3.1', () => {
    expect(couleurs.positive).toBe('#1C7A4B');
    expect(couleurs.negative).toBe('#A8452F');
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
    // Le rayon est lu depuis `rayons` et non écrit en dur. Ce test dit « la
    // valeur traverse » ; il n'a pas à dire laquelle. Écrit en dur, il faisait
    // échouer le passage au carré du 2026-08-31 sans rien signaler de faux.
    expect(css).toContain(`--radius-lg: ${rayons.lg};`);
    expect(css).toContain('--shadow-sm:');
  });

  it('déclare la grille de 4 px dont dérive tout l’espacement', () => {
    expect(grille).toBe('4px');
    expect(genererCssTheme()).toContain('--spacing: 4px;');
  });

  it('convertit chaque clé en variable CSS kebab-case', () => {
    const css = genererCssTheme();
    expect(css).toContain('--color-chart-blue: #9FC2DA;');
    expect(css).toContain('--color-muted-foreground: #666B64;');
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

/**
 * Le contraste des paires que le produit emploie réellement.
 *
 * Une valeur de jeton ne se lit pas seule : `negative` n'existe qu'écrit sur
 * `negativeTint`, et `mutedForeground` sur `muted` ou sur `canvas`. C'est la
 * paire qui passe ou ne passe pas, et c'est elle qu'on garde ici.
 *
 * Le seuil est 4,5:1 — WCAG AA pour du texte courant. Les badges et les
 * en-têtes de colonne sont en 12 px : aucune de ces paires ne relève de
 * l'exception « grand texte », qui commence à 18,66 px gras ou 24 px.
 *
 * Constaté le 2026-08-25 : `negative` sur `negativeTint` donnait 3,68:1. Le
 * message d'erreur était le texte le moins lisible du produit, dans les trois
 * applications à la fois.
 */
function luminance(hex: string): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = hex.replace('#', '');
  const [r, v, b] = [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * canal(r!) + 0.7152 * canal(v!) + 0.0722 * canal(b!);
}

/** Rapport de contraste WCAG entre deux couleurs opaques. */
function contraste(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('contraste des paires employées', () => {
  const PAIRES: Array<[string, string, string]> = [
    ['erreur sur sa teinte', couleurs.negative, couleurs.negativeTint],
    ['erreur sur surface', couleurs.negative, couleurs.surface],
    ['succès sur sa teinte', couleurs.positive, couleurs.positiveTint],
    ['succès sur surface', couleurs.positive, couleurs.surface],
    ['information sur sa teinte', couleurs.info, couleurs.infoTint],
    // `muted` est la piste de jauge et l'en-tête de tableau ; le badge
    // « Inactif » y écrit son libellé.
    ['texte muet sur surface muette', couleurs.mutedForeground, couleurs.muted],
    ['texte muet sur canevas', couleurs.mutedForeground, couleurs.canvas],
    ['texte muet sur surface', couleurs.mutedForeground, couleurs.surface],
    ['encre sur canevas', couleurs.ink, couleurs.canvas],
    ['action sur surface', couleurs.primary, couleurs.surface],
    ['blanc sur barre latérale', couleurs.primaryForeground, couleurs.sidebar],
  ];

  for (const [nom, texte, fond] of PAIRES) {
    it(`tient 4,5:1 — ${nom}`, () => {
      expect(contraste(texte, fond)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('vérifie la mesure elle-même sur deux extrêmes connus', () => {
    // Sans ce contrôle, une erreur de formule rendrait les onze tests
    // ci-dessus verts sur n'importe quelle couleur.
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

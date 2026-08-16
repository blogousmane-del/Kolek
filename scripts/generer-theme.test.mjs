import { describe, expect, it } from 'vitest';

import { contenuAttendu, estAJour } from './generer-theme.mjs';

describe('génération du thème', () => {
  it('le theme.css versionné correspond à tokens.ts', () => {
    // Si ce test tombe, quelqu'un a modifié tokens.ts sans relancer la
    // génération : Tailwind fabriquerait ses classes à partir de valeurs
    // périmées, et l'écart ne se verrait qu'à l'œil, écran par écran.
    expect(estAJour()).toBe(true);
  });

  it('déclare la grille de 4 px dont Tailwind dérive tout son espacement', () => {
    expect(contenuAttendu()).toContain('--spacing: 4px;');
  });

  it('expose les couleurs sous les noms que consomment les classes', () => {
    const css = contenuAttendu();
    for (const nom of [
      '--color-primary',
      '--color-primary-foreground',
      '--color-muted-foreground',
      '--color-dark-canvas',
      '--color-positive-tint',
      '--color-chart-mint',
      '--color-sidebar',
    ]) {
      expect(css).toContain(`${nom}:`);
    }
  });

  it('donne la même valeur aux noms métier et à leurs alias Tailwind', () => {
    const css = contenuAttendu();
    const valeur = (nom) => css.match(new RegExp(`${nom}: (\\S+);`))?.[1];

    expect(valeur('--color-canvas')).toBe(valeur('--color-background'));
    expect(valeur('--color-hairline')).toBe(valeur('--color-border'));
    expect(valeur('--color-ink')).toBe(valeur('--color-foreground'));
    expect(valeur('--color-surface')).toBe(valeur('--color-input'));
  });
});

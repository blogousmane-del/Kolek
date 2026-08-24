import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { couleurs } from '../packages/core/src/tokens.ts';
import { faviconSvg, fichiersPerimes, iconeSvg } from './generer-marque.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('fraîcheur des artefacts de marque', () => {
  it('le favicon et les icônes versionnés correspondent à tokens.ts', () => {
    // Si ce test tombe, quelqu'un a changé une couleur de marque sans relancer
    // la génération. L'écart ne se verrait ni au build ni à la revue : il se
    // verrait dans un onglet de navigateur et sur l'écran d'accueil d'un
    // téléphone, c'est-à-dire nulle part où on regarde.
    expect(fichiersPerimes()).toEqual([]);
  });
});

describe('les couleurs viennent des jetons', () => {
  it('n’écrit aucun hexadécimal qui ne soit dans tokens.ts', () => {
    const connus = new Set(Object.values(couleurs).map((c) => c.toUpperCase()));

    for (const svg of [faviconSvg(), iconeSvg()]) {
      for (const hex of svg.match(/#[0-9A-Fa-f]{3,8}/g) ?? []) {
        expect(connus).toContain(hex.toUpperCase());
      }
    }
  });

  it('pose l’or sur le sombre, et jamais l’inverse', () => {
    // La plaque est toujours sombre : une icône claire sur l'écran d'accueil
    // d'un téléphone se confond avec la moitié des fonds d'écran.
    expect(faviconSvg()).toContain(`<rect width="100" height="100" rx="24" fill="${couleurs.sidebar}"`);
    expect(iconeSvg()).toContain(`fill="${couleurs.or}"`);
  });
});

describe('le « k » ne peut pas diverger entre le composant et les icônes', () => {
  it('dessine exactement les tracés de Logo.tsx', () => {
    // Deux dessins du même monogramme finiraient par se séparer — c'est
    // précisément ce qui était arrivé avant le 2026-08-24 : le favicon portait
    // un « k » en tracés, l'interface un « K » de police, et les deux ne se
    // ressemblaient plus.
    const composant = readFileSync(join(RACINE, 'packages/ui/src/Logo.tsx'), 'utf8');

    for (const trace of ['M32 22 V78', 'M74 22 L44 50 L74 78']) {
      expect(composant).toContain(trace);
      expect(faviconSvg()).toContain(trace);
      expect(iconeSvg()).toContain(trace);
    }
  });
});

describe('zone de sécurité de l’icône d’application', () => {
  it('garde la pièce loin du bord, que le lanceur rogne ou non', () => {
    // Android rogne les icônes en cercle ou en « squircle » selon le lanceur.
    // Au-delà de 0.8, l'or touche le bord et le rognage mord dedans.
    const echelle = Number(iconeSvg().match(/scale\(([\d.]+)\)/)?.[1]);

    expect(echelle).toBeGreaterThan(0);
    expect(echelle).toBeLessThanOrEqual(0.8);
  });
});

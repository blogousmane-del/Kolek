// TypeScript 7 n'ouvre plus les `@types/*` d'office (`types` vaut `[]` par défaut), et
// le `tsconfig.json` de ce paquet ne les demande pas : sans cette ligne, `node:fs`
// n'a pas de déclaration et `npm run typecheck -w @kolek/core` échoue (TS2591).
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Le vocabulaire de mouvement, lu dans sa feuille.
 *
 * Deux gardes qui ne tiennent qu'à la lettre du CSS, et qu'aucune épreuve de
 * composant ne voit : jsdom n'applique ni `:active` ni `@media`. Le fichier est
 * lu tel quel, et ses fins de ligne normalisées : la copie de travail est en
 * CRLF, le dépôt et le CI en LF.
 */
const css = readFileSync(new URL('./mouvement.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** Le corps d'un bloc de premier niveau, de son accolade ouvrante à la fermante en colonne 0. */
function corpsDe(entete: RegExp): string {
  const corps = css.match(new RegExp(`${entete.source} \\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (corps === undefined) throw new Error(`Bloc introuvable : ${entete.source}`);
  return corps;
}

describe('le mouvement de Kolek (mouvement.css)', () => {
  it('ne fait pas s’enfoncer un bouton éteint : la règle d’appui est gardée par :not(:disabled)', () => {
    // `anim-pression` est posé sur tout composant cliquable, `Bouton` compris. Un
    // bouton `disabled` qui s'enfonce sous le doigt se lit comme un bouton qui
    // répond : le collecteur appuie encore, et attend.
    const pression = corpsDe(/@utility anim-pression/);
    const appuis = [...pression.matchAll(/&:active[^{]*/g)].map((m) => m[0].trim());

    // Un témoin : la règle existe, et la sonde la voit.
    expect(appuis.length).toBeGreaterThan(0);
    // Toute règle d'appui de la primitive est gardée.
    for (const appui of appuis) {
      expect(appui).toBe('&:active:not(:disabled)');
    }
  });

  it('éteint chaque primitive anim-* sous prefers-reduced-motion', () => {
    const primitives = [...css.matchAll(/@utility (anim-[a-z-]+)/g)].map((m) => m[1] ?? '');
    const reduit = corpsDe(/@media \(prefers-reduced-motion: reduce\)/);
    const selecteurs = (reduit.split('{')[0] ?? '').split(',').map((s) => s.trim());

    // Des témoins : la sonde voit des primitives connues, dont la plus récente.
    expect(primitives).toContain('anim-pression');
    expect(primitives).toContain('anim-tampon');
    expect(selecteurs).toContain('.anim-pression');
    // Chacune figure dans le commutateur général : un mouvement oublié ici
    // continuerait de jouer chez qui l'a éteint dans ses réglages.
    for (const primitive of primitives) {
      expect(selecteurs, primitive).toContain(`.${primitive}`);
    }
  });
});

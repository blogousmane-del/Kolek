import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { genererCssTheme } from '../packages/core/src/tokens.ts';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CIBLE = join(RACINE, 'packages/core/src/theme.css');

const ENTETE = `/* Fichier engendré par scripts/generer-theme.mjs — ne pas modifier à la main.
   La source est packages/core/src/tokens.ts. Relancer : npm run generer:theme */\n\n`;

/**
 * Le fichier est engendré *et* versionné. Versionné parce que Tailwind le lit
 * avant tout script npm — un build propre ne doit pas dépendre de l'ordre des
 * étapes. Engendré parce que `tokens.ts` reste la source unique. Le contrôle
 * de fraîcheur ci-dessous est ce qui empêche les deux de diverger.
 */
export function contenuAttendu() {
  return ENTETE + genererCssTheme();
}

export function estAJour() {
  try {
    return readFileSync(CIBLE, 'utf8') === contenuAttendu();
  } catch {
    return false;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const verifier = process.argv.includes('--verifier');

  if (verifier) {
    if (estAJour()) {
      console.log('theme.css est à jour.');
      process.exit(0);
    }
    console.error(
      'theme.css ne correspond plus à tokens.ts. Lance `npm run generer:theme` et rejoue le build.',
    );
    process.exit(1);
  }

  writeFileSync(CIBLE, contenuAttendu());
  console.log(`theme.css engendré depuis tokens.ts.`);
}

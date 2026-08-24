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

/**
 * Les fins de ligne ne comptent pas dans la comparaison.
 *
 * Git les convertit en CRLF au `checkout` sous Windows, alors que ce script
 * écrit du LF. Une comparaison octet à octet rendait donc le garde-fou rouge
 * après **tout** `git checkout`, sans qu'aucun jeton n'ait bougé — un contrôle
 * qui crie au loup finit par être ignoré, ce qui est exactement ce qu'il ne
 * faut pas d'un garde-fou. Constaté le 2026-08-24.
 */
function normaliser(texte) {
  return texte.replace(/\r\n/g, '\n');
}

export function estAJour() {
  try {
    return normaliser(readFileSync(CIBLE, 'utf8')) === normaliser(contenuAttendu());
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

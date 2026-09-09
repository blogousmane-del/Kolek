/**
 * Les couleurs du manifeste PWA suivent-elles encore leurs jetons ?
 *
 *   node scripts/verifier-manifeste.mjs        (npm run verifier:manifeste)
 *
 * ## Pourquoi ce script existe
 *
 * Le manifeste du collecteur a porté `background_color: '#FBFAF6'` jusqu'au
 * 2026-09-09. `#FBFAF6` était le jeton `paper`, supprimé de `tokens.ts` le
 * 2026-09-04. Pendant cinq jours, l'écran de démarrage de l'application
 * installée a donc été la dernière surface du produit peinte dans une couleur
 * que le Design System ne connaissait plus.
 *
 * Ce qui l'a rendu invisible n'est pas sa taille, c'est son lieu. La couleur ne
 * vit dans aucune feuille de style : elle est recopiée dans `vite.config.ts`,
 * puis ne réapparaît que dans `dist/manifest.webmanifest`, un artefact engendré
 * que personne ne relit. Les autres couleurs en dur du dépôt se voient au moins
 * dans le fichier qu'on est en train de modifier.
 *
 * ## Pourquoi la valeur reste écrite dans `vite.config.ts`
 *
 * L'importer depuis `@kolek/core` a été essayé et refusé par le compilateur :
 * `vite.config.ts` est bâti sous `moduleResolution: node16`, où les imports
 * relatifs de `packages/core` demandent une extension explicite que la source
 * n'a pas. Changer cette résolution pour deux couleurs déplacerait le risque
 * sans le réduire.
 *
 * ## Extraire puis comparer, et non chercher une présence
 *
 * Le 🟠 n°1 de l'audit du 2026-09-09 a appris ceci : un contrôle qui **cherche**
 * un motif dans une source passe au vert sur le défaut même qu'il doit voir —
 * l'import de `gardeEnv` était bien présent, c'est le greffon qui manquait. On
 * ne cherche donc pas ici si la bonne couleur est là. On extrait la valeur
 * écrite, quelle qu'elle soit, et on la compare au jeton.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { couleurs } from '../packages/core/src/tokens.ts';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CIBLE = join(RACINE, 'apps/collecteur/vite.config.ts');

/** La valeur écrite pour chaque couleur du manifeste, ou `null` si absente. */
export function couleursDuManifeste(source) {
  const lire = (cle) => {
    const trouve = source.match(new RegExp(`${cle}\\s*:\\s*['"]([^'"]+)['"]`));
    return trouve ? trouve[1] : null;
  };

  return { background_color: lire('background_color'), theme_color: lire('theme_color') };
}

/** Les reproches. Vide = les deux couleurs suivent leurs jetons. */
export function reproches(trouvees, jetons) {
  const attendu = { background_color: jetons.canvas, theme_color: jetons.primary };
  const trouves = [];

  for (const [cle, valeur] of Object.entries(trouvees)) {
    if (valeur === null) {
      trouves.push(`${cle} est absente du manifeste, alors que ${attendu[cle]} est attendue.`);
      continue;
    }
    if (valeur.toLowerCase() !== attendu[cle].toLowerCase()) {
      trouves.push(
        `${cle} vaut ${valeur}, alors que le jeton dit ${attendu[cle]}. ` +
          'Une couleur recopiée ne suit pas son jeton.',
      );
    }
  }

  return trouves;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const trouves = reproches(couleursDuManifeste(readFileSync(CIBLE, 'utf8')), couleurs);

  if (trouves.length > 0) {
    console.error('Le manifeste PWA a dérivé de tokens.ts :');
    for (const r of trouves) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log('Les couleurs du manifeste PWA suivent tokens.ts.');
}

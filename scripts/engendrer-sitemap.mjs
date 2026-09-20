import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Le sitemap, engendré depuis la table des routes.
 *
 * ## Pourquoi il n'est plus écrit à la main
 *
 * Il l'était jusqu'au 2026-09-20, et il était juste. Ce qui ne l'était pas,
 * c'est ce qu'il décrivait : il déclarait quatre adresses à Google pendant que
 * les cinq routes servaient le même `index.html`, donc la même balise
 * canonique pointant sur la racine. Le sitemap disait « voici trois pages
 * légales » et chacune de ces pages répondait « ma vraie version est
 * l'accueil ». Google tranche par la balise ; les trois sortaient de l'index.
 *
 * Le prérendu a fermé ce défaut. Ce générateur l'empêche de revenir par
 * l'autre bout : le sitemap et les balises canoniques sont désormais deux
 * lectures de la même table, et ne peuvent plus se contredire sans qu'on l'ait
 * écrit expressément à deux endroits.
 *
 * ## Pourquoi pas de `lastmod`
 *
 * Il faudrait le tenir à jour à chaque déploiement, et un `lastmod` faux est
 * pire qu'absent : Google apprend à ne plus le croire, sur ce site comme sur
 * les autres. Le sitemap sert ici à déclarer l'existence des pages, ce qu'il
 * fait en une ligne chacune.
 *
 * ## Pourquoi `/inscription` n'y est pas
 *
 * C'est un formulaire : rien à y chercher, et l'indexer diviserait le signal
 * entre deux pages qui disent la même chose. La table le porte en
 * `indexable: false`, le `netlify.toml` lui pose un `X-Robots-Tag: noindex`,
 * et `scripts/prerendre.mjs` écrit la balise `robots` dans son fichier. Trois
 * lectures du même fait, aucune recopie.
 *
 * ## Usage
 *
 *     npm run generer:sitemap    écrit le fichier
 *     npm run verifier:sitemap   échoue si le fichier versionné a dérivé
 */

export const ROUTES_TS = 'apps/site/src/vitrine/routes.ts';
export const SITEMAP = 'apps/site/public/sitemap.xml';

const ENTETE = `Engendré par scripts/engendrer-sitemap.mjs depuis
  apps/site/src/vitrine/routes.ts. Ne pas modifier à la main : la prochaine
  construction écraserait la retouche, et « npm run verifier:sitemap » la
  refuserait avant.

  Les routes déclarées ici sont celles que la table marque « indexable ». Leur
  balise canonique est posée par scripts/prerendre.mjs, depuis la même table :
  le sitemap et les canoniques ne peuvent donc plus se contredire.

  Pas de lastmod : il faudrait le tenir à jour à chaque déploiement, et un
  lastmod faux est pire qu'absent.`;

/**
 * Le document, à l'octet près.
 *
 * Fonction pure, et exportée pour cela : le mode `--verifier` compare sa
 * sortie au fichier versionné, et les épreuves la comparent sans rien écrire.
 *
 * Fins de ligne CRLF, comme tout fichier versionné du dépôt. Un `\n` seul ici
 * ferait échouer `--verifier` sur une machine et passer sur l'autre, pour une
 * différence que ni `grep` ni `cat` n'affichent sous Git Bash.
 */
export function engendrer(routes) {
  const lignes = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!--`,
    ...ENTETE.split('\n').map((l) => `  ${l.trimStart()}`),
    `-->`,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const route of routes) {
    if (!route.indexable) continue;
    const adresse = route.chemin === '/' ? 'https://kolek.cash/' : `https://kolek.cash${route.chemin}`;
    lignes.push('  <url>', `    <loc>${adresse}</loc>`, '  </url>');
  }

  lignes.push('</urlset>', '');
  return lignes.join('\r\n');
}

async function table() {
  // Résolu depuis le répertoire courant : voir la note de `verifier-routes.mjs`.
  const { ROUTES } = await import(pathToFileURL(resolve(process.cwd(), ROUTES_TS)).href);
  return ROUTES;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const attendu = engendrer(await table());

  if (process.argv.includes('--verifier')) {
    const present = readFileSync(SITEMAP, 'utf8');
    if (present !== attendu) {
      console.error(
        `${SITEMAP} a dérivé de la table des routes.\n` +
          '  Lance « npm run generer:sitemap » et valide le résultat.\n' +
          "  Une adresse déclarée au sitemap et absente de la table, ou l'inverse, " +
          'envoie Google sur une page qui le renverra ailleurs.',
      );
      process.exit(1);
    }
    console.log(`${SITEMAP} correspond à la table des routes.`);
  } else {
    writeFileSync(SITEMAP, attendu, 'utf8');
    const compte = attendu.split('<loc>').length - 1;
    console.log(`${SITEMAP} écrit — ${compte} adresses indexables.`);
  }
}

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Chaque `netlify.toml` surveille-t-il les scripts que sa construction lit ?
 *
 *   node scripts/verifier-ignore.mjs        (npm run verifier:ignore)
 *
 * ## Le défaut que ce script empêche
 *
 * Netlify ne reconstruit une application que si `git diff` trouve un
 * changement dans les chemins de sa règle `ignore`. Les trois règles du dépôt
 * nommaient `apps/<app>` et `packages`, et rien d'autre. Or chaque construction
 * exécute des scripts qui vivent dans `scripts/` : `garde-env.mjs` et
 * `decouper-lib.mjs`, importés par les trois `vite.config.ts`, et
 * `prerendre.mjs`, lancé après `vite build` par le site.
 *
 * Une correction du seul script aurait donc été validée, fusionnée, et jamais
 * construite. Netlify aurait annoncé un déploiement « ignoré » — ce qu'on ne lit
 * pas — et continué de servir l'ancien paquet. Pour `garde-env.mjs`, la garde
 * qui refuse de compiler une clé de service dans le paquet public, c'est une
 * correction de sécurité qui ne part pas. Constaté le 2026-10-02, dans les trois
 * fichiers à la fois : aucun contrôle ne lisait ces lignes.
 *
 * ## Ce qu'il lit
 *
 * Pour chaque application : les `../../scripts/*.mjs` de son `vite.config.ts`,
 * ceux que lance le script `build` de son `package.json`, et, de proche en
 * proche, les `./*.mjs` que ces scripts importent eux-mêmes. Chacun doit
 * figurer dans la règle `ignore` — par son nom, ou par le répertoire `scripts`
 * entier.
 *
 * Une application sans règle `ignore` n'est pas reprochée : Netlify la
 * construit alors à chaque fois, ce qui coûte du temps et ne perd rien.
 */

export const APPS = ['site', 'collecteur', 'admin'];

/**
 * Les chemins de la règle `ignore`, ou `null` s'il n'y en a pas.
 *
 * `null` et non une liste vide : sans règle, Netlify construit toujours, ce qui
 * est l'inverse de « rien n'est surveillé ». Les deux cas ne se confondent pas.
 */
export function cheminsSurveilles(netlifyToml) {
  for (const ligne of netlifyToml.split(/\r?\n/)) {
    if (ligne.trim().startsWith('#')) continue;
    const m = /^\s*ignore\s*=\s*"git diff --quiet \$CACHED_COMMIT_REF \$COMMIT_REF -- ([^"]*)"/.exec(ligne);
    if (m) return m[1].trim().split(/\s+/).filter(Boolean);
  }
  return null;
}

/**
 * Les scripts du dépôt que lit une construction, chemins depuis la racine.
 *
 * `lire(chemin)` rend le texte d'un script, pour suivre ses propres imports ;
 * la fonction reste pure et s'éprouve sans disque.
 */
export function scriptsLus({ viteConfig, build, lire }) {
  const trouves = new Set();
  const motif = /\.\.\/\.\.\/(scripts\/[\w-]+\.mjs)/g;
  for (const source of [viteConfig, build ?? '']) {
    for (const m of source.matchAll(motif)) trouves.add(m[1]);
  }

  // De proche en proche : un script qui en importe un autre le rend tout
  // aussi déterminant pour la construction.
  const aSuivre = [...trouves];
  while (aSuivre.length > 0) {
    const courant = aSuivre.pop();
    for (const m of lire(courant).matchAll(/from '\.\/([\w-]+\.mjs)'/g)) {
      const importe = `scripts/${m[1]}`;
      if (!trouves.has(importe)) {
        trouves.add(importe);
        aSuivre.push(importe);
      }
    }
  }

  return [...trouves].sort();
}

export function reproches(apps, lire) {
  const trouves = [];
  for (const app of apps) {
    const chemins = cheminsSurveilles(app.netlifyToml);
    if (chemins === null) continue;
    const surveilleTout = chemins.includes('scripts') || chemins.includes('scripts/');

    for (const script of scriptsLus({ viteConfig: app.viteConfig, build: app.build, lire })) {
      if (surveilleTout || chemins.includes(script)) continue;
      trouves.push(
        `apps/${app.nom}/netlify.toml ne surveille pas ${script}, que sa construction ` +
          'exécute : une correction de ce seul script serait fusionnée et jamais construite. ' +
          'Ajoute-le aux chemins de la règle ignore.',
      );
    }
  }
  return trouves;
}

function lireSiPresent(chemin) {
  return existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apps = APPS.map((nom) => {
    const paquet = lireSiPresent(`apps/${nom}/package.json`);
    return {
      nom,
      viteConfig: lireSiPresent(`apps/${nom}/vite.config.ts`),
      build: paquet ? (JSON.parse(paquet).scripts?.build ?? '') : '',
      netlifyToml: lireSiPresent(`apps/${nom}/netlify.toml`),
    };
  });

  const trouves = reproches(apps, lireSiPresent);
  if (trouves.length > 0) {
    console.error('Une règle ignore de Netlify oublie un script de construction :');
    for (const r of trouves) console.error(`  ${r}`);
    process.exit(1);
  }
  console.log('Chaque netlify.toml surveille les scripts que sa construction exécute.');
}

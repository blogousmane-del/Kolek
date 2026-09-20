import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * La table des routes et le `netlify.toml` doivent décrire le même site.
 *
 * ## Le défaut que ce script empêche
 *
 * Une route ajoutée à `apps/site/src/vitrine/routes.ts` sans sa règle de
 * réécriture marche en développement — Vite sert tout — et rend **404 en
 * production**. Rien dans `npm test` ne visite `netlify.toml` : aucune épreuve
 * du site ne peut voir ce décalage.
 *
 * ## Ce qu'il vérifie depuis le 2026-09-20
 *
 * Il lisait `App.tsx`, dont il extrayait les `if (chemin === …) return` par
 * expression régulière. Cette forme a disparu : les routes vivent maintenant
 * dans une table, lue par le routage, par le prérendu et par le sitemap. Le
 * script lit donc la table — un import, plus une analyse de texte.
 *
 * Trois reproches possibles :
 *
 * 1. **une route sans règle** — elle rendrait 404 en production ;
 * 2. **une règle orpheline** — page retirée, ou faute de frappe qui masque la
 *    vraie route derrière un 404 ;
 * 3. **une règle qui vise le mauvais fichier** — le reproche neuf. Depuis que
 *    `scripts/prerendre.mjs` écrit une page par route, une règle pointée sur
 *    `/index.html` servirait la page d'accueil sous l'adresse des conditions :
 *    le contenu et la balise canonique d'une autre page, c'est-à-dire le
 *    défaut que le prérendu vient de fermer, réintroduit par une seule ligne.
 *
 * Et toujours le joker `/*`, dont le retour annulerait le vrai 404.
 *
 * ## Ce qu'il ne vérifie pas
 *
 * Que `App.tsx` sache rendre chaque route : c'est `App.test.tsx` qui le tient,
 * en rendant chaque chemin de la table et en refusant qu'il retombe sur la
 * vitrine. Et que le sitemap suive : c'est `scripts/engendrer-sitemap.mjs
 * --verifier`.
 */

export const ROUTES_TS = 'apps/site/src/vitrine/routes.ts';
export const NETLIFY_TOML = 'apps/site/netlify.toml';

export function blocsRedirects(texte) {
  const sansCommentaires = texte
    .split('\n')
    .filter((ligne) => !ligne.trim().startsWith('#'))
    .join('\n');

  const blocs = [];
  for (const paragraphe of sansCommentaires.split(/\n\s*\n/)) {
    if (!/^\s*\[\[redirects\]\]/.test(paragraphe)) continue;
    const bloc = {};
    for (const ligne of paragraphe.split('\n')) {
      const m = /^\s*(\w+)\s*=\s*(.+?)\s*$/.exec(ligne);
      if (!m) continue;
      const [, cle, valeur] = m;
      bloc[cle] = /^"(.*)"$/.test(valeur) ? valeur.slice(1, -1) : valeur;
    }
    if (Object.keys(bloc).length > 0) blocs.push(bloc);
  }
  return blocs;
}

/**
 * Les réécritures internes, par chemin.
 *
 * Toute règle en 200 vers un `.html` du site, quel que soit le fichier visé :
 * une règle qui vise le mauvais fichier doit être **vue puis reprochée**, pas
 * filtrée en silence — filtrée, elle deviendrait une route manquante, et le
 * message parlerait d'un tout autre défaut que celui qui est là.
 */
export function reecrituresDeNetlify(blocs) {
  const par = new Map();
  for (const b of blocs) {
    if (String(b.status) !== '200') continue;
    if (!b.from?.startsWith('/') || b.from === '/*') continue;
    if (!b.to?.endsWith('.html')) continue;
    par.set(b.from, b.to);
  }
  return par;
}

export function jokerPresent(blocs) {
  return blocs.some((b) => b.from === '/*' && b.to === '/index.html' && String(b.status) === '200');
}

export function reproches({ routes, netlifyToml }) {
  const trouves = [];

  if (routes.length === 0) {
    trouves.push(
      `Aucune route dans ${ROUTES_TS} : le script lit peut-être le mauvais ` +
        'fichier, ou la table a changé de forme sans que ce script suive.',
    );
  }

  const blocs = blocsRedirects(netlifyToml);
  const reecritures = reecrituresDeNetlify(blocs);

  if (reecritures.size === 0) {
    trouves.push(
      'Aucune réécriture « status = 200 » vers un .html trouvée dans ' +
        'netlify.toml. Le script lit peut-être le mauvais fichier, ou toutes ' +
        'les routes nommées ont disparu.',
    );
  }

  if (jokerPresent(blocs)) {
    trouves.push(
      'netlify.toml redirige encore /* vers /index.html en 200 : ce joker ' +
        "avale toute adresse inconnue avant qu'elle n'atteigne 404.html, et " +
        'annule le vrai 404 — même si les routes nommées sont par ailleurs ' +
        'correctes.',
    );
  }

  for (const route of routes) {
    // La racine est servie par le fichier `dist/index.html` que Netlify trouve
    // directement : elle n'a pas de règle, et ne doit pas en avoir.
    if (route.chemin === '/') continue;

    const vise = reecritures.get(route.chemin);
    if (vise === undefined) {
      trouves.push(
        `${route.chemin} est dans la table mais n'a aucune règle dans ` +
          'netlify.toml : cette page marche en développement — Vite sert tout ' +
          '— et rendrait 404 en production.',
      );
      continue;
    }

    const attendu = `/${route.fichier}`;
    if (vise !== attendu) {
      trouves.push(
        `netlify.toml réécrit ${route.chemin} vers ${vise}, alors que le ` +
          `prérendu écrit ${attendu}. Servir un autre fichier, c'est servir ` +
          "le contenu et la balise canonique d'une autre page sous cette " +
          'adresse.',
      );
    }
  }

  const chemins = new Set(routes.map((r) => r.chemin));
  for (const from of reecritures.keys()) {
    if (!chemins.has(from)) {
      trouves.push(
        `netlify.toml réécrit ${from}, mais la table ne connaît pas ce ` +
          "chemin : règle orpheline d'une page retirée, ou faute de frappe " +
          'qui masque la vraie route derrière un 404.',
      );
    }
  }

  return trouves;
}

async function lire() {
  /*
    Résolu depuis le répertoire courant, et non depuis ce fichier.

    Un `import('../apps/site/…')` se résoudrait depuis l'emplacement de ce
    module, donc toujours sur le vrai dépôt — y compris quand les épreuves
    lancent ce script sur un faux dépôt jetable pour vérifier qu'il sait
    rougir. Le contrôle aurait alors lu la table saine pendant qu'on lui
    présentait une table cassée, et serait passé au vert sur un dépôt
    délibérément rompu : un garde-fou qu'on croit éprouvé et qui ne l'est pas.

    Les autres contrôles du dépôt lisent tous leurs fichiers relativement au
    répertoire courant ; celui-ci fait pareil.
  */
  const { ROUTES } = await import(pathToFileURL(resolve(process.cwd(), ROUTES_TS)).href);
  return { routes: ROUTES, netlifyToml: readFileSync(NETLIFY_TOML, 'utf8') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const trouves = reproches(await lire());

  if (trouves.length > 0) {
    console.error('La table des routes et netlify.toml ne décrivent pas le même site :');
    for (const r of trouves) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log('La table des routes et netlify.toml décrivent exactement le même site.');
}

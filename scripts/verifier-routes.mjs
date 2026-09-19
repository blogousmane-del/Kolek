/**
 * Les routes de App.tsx et les règles de netlify.toml se répondent-elles ?
 *
 *   node scripts/verifier-routes.mjs        (npm run verifier:routes)
 *
 * ## Le défaut visé
 *
 * `App.tsx` route à la main, sans bibliothèque : chaque page connue y est un
 * `if (chemin === X) return <Page />`. Depuis la tâche 6 de l'audit du
 * 2026-09-04 (point A.3), `netlify.toml` n'avale plus tout par un joker
 * `/*` — il énumère les mêmes routes, pour que Netlify puisse rendre un vrai
 * 404 sur le reste. Ce sont donc deux listes, dans deux fichiers, dans deux
 * langages, écrites à des moments différents, et rien ne les lie au moment
 * où on les tape.
 *
 * Une route ajoutée à `App.tsx` sans sa règle dans `netlify.toml` marche en
 * développement — Vite sert tout — et rend 404 en production, silencieusement
 * : aucune épreuve du site ne visite `netlify.toml`, `verifier-mentions.mjs`
 * ne lit que les sources React, et `npm test` ne descend pas dans
 * `scripts/`. C'est exactement le profil d'une mention légale qui redevient
 * introuvable sans qu'aucun voyant ne s'allume — pire qu'une absence,
 * puisqu'elle a existé et cesserait de répondre.
 *
 * ## Ce que ce script compare
 *
 * 1. les routes que `App.tsx` dispatche vers une page (tout sauf le repli
 *    `<Vitrine />`), résolues à leur valeur littérale via `liens.ts` quand
 *    elles sont nommées par une constante plutôt qu'écrites en dur ;
 * 2. les chemins déclarés dans `netlify.toml` par une règle
 *    `to = "/index.html"`, `status = 200`, dont le `from` est un chemin
 *    relatif — ni le joker, ni la redirection de l'ancien domaine.
 *
 * Les deux ensembles doivent être exactement les mêmes. Un manque d'un côté
 * ou de l'autre est nommé, jamais résumé en un compte : un compte qui tombe
 * de 4 à 3 ne dit pas laquelle des quatre routes a disparu.
 *
 * ## Le joker
 *
 * Une règle `from = "/*"` vers `/index.html` en 200 annulerait, à elle
 * seule, tout le travail de la tâche 6 : elle réabsorbe le 404 dans un 200,
 * quoi que disent les routes nommées à côté d'elle — Netlify applique la
 * première correspondance, et un joker replacé n'importe où avant elles les
 * rend inatteignables. Ce script le refuse s'il reparaît.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const APP_TSX = 'apps/site/src/App.tsx';
export const LIENS_TS = 'apps/site/src/vitrine/liens.ts';
export const NETLIFY_TOML = 'apps/site/netlify.toml';

/**
 * Blanchit les commentaires d'`App.tsx`, sans décaler les lignes.
 *
 * Le commentaire de tête du fichier écrit : « Le chemin est lu une fois, au
 * chargement. » — une phrase de prose qui mentionne `chemin` au même titre
 * qu'un vrai dispatch. Sans ce nettoyage, elle entrerait dans `inconnues` et
 * ferait échouer la garde sur un fichier qui n'a pourtant pas changé.
 *
 * Chaque caractère retiré est remplacé par une espace plutôt que supprimé :
 * les numéros de ligne restent justes pour les messages d'erreur.
 */
function sansCommentaires(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\r\n]/g, ' '))
    .replace(/\/\/[^\r\n]*/g, (ligne) => ' '.repeat(ligne.length));
}

/**
 * Les routes que `App.tsx` fait mener à une page, dans l'ordre du fichier,
 * et ce qui n'a pas pu être résolu.
 *
 * Le repli final (`return <Vitrine />` sans condition) n'est pas une route :
 * c'est ce que Netlify sert déjà nativement pour `/`, fichier réel du
 * répertoire publié.
 *
 * Un nom qui n'est ni une chaîne littérale ni une constante connue de
 * `liens.ts` va dans `inconnues` plutôt que d'être tu : un routage qu'on ne
 * sait pas lire est un routage qu'on ne peut pas garder synchronisé, et le
 * signaler vaut mieux que de conclure sur un ensemble incomplet sans le dire.
 *
 * Le motif ne reconnaît qu'une seule forme de dispatch : `if (chemin === X)
 * return`. Un `switch (chemin)`, un `if (chemin === X) {` sur bloc, ou un
 * `chemin.startsWith(...)` seraient sinon ignorés sans bruit — la garde
 * conclurait « mêmes routes » pendant qu'une page neuve rend 404 en
 * production. Toute autre ligne qui mentionne `chemin`, hors de sa
 * déclaration, part donc elle aussi dans `inconnues` plutôt que d'être
 * tue : le reproche qui nomme une route inconnue (voir plus bas) fait le
 * reste.
 */
export function routesDeAppTsx(texte, constantes) {
  const routes = [];
  const inconnues = [];

  for (const ligne of sansCommentaires(texte).split(/\r?\n/)) {
    if (/\bconst chemin\b/.test(ligne)) continue;

    const dispatch = /if\s*\(chemin === (.+?)\)\s*return\b/.exec(ligne);
    if (dispatch) {
      const expr = dispatch[1].trim();
      const litteral = /^'([^']*)'$/.exec(expr);
      if (litteral) {
        routes.push(litteral[1]);
      } else if (Object.prototype.hasOwnProperty.call(constantes, expr)) {
        routes.push(constantes[expr]);
      } else {
        inconnues.push(expr);
      }
      continue;
    }

    if (/\bchemin\b/.test(ligne)) inconnues.push(ligne.trim());
  }

  return { routes, inconnues };
}

/**
 * Les constantes de chemin exportées par `liens.ts`, sous la forme
 * `NOM -> '/valeur'`. Seules les exportations tenant sur une seule ligne sont
 * lues — c'est le cas de toutes les routes ; `CONTACT_DEMO`, assignée sur
 * deux lignes, n'en est pas une, et n'a pas à l'être : ce n'est pas un chemin
 * du site.
 */
export function constantesDeLiens(texte) {
  const constantes = {};
  for (const m of texte.matchAll(/export const (\w+) = '([^']*)';/g)) {
    constantes[m[1]] = m[2];
  }
  return constantes;
}

/**
 * Les blocs `[[redirects]]` de `netlify.toml`, en `{ from, to, status,
 * force }`. Les lignes de commentaire (`#`) sont retirées avant le
 * découpage : le long commentaire qui précède la règle
 * `kolek-site.netlify.app` n'en est séparé par aucune ligne vide, et un
 * découpage naïf sur les lignes vides le fondrait dans le même paragraphe
 * sans nuire à la lecture des clés qui nous intéressent.
 */
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
 * Les chemins que `netlify.toml` réécrit vers la page unique — ni le joker,
 * ni la redirection permanente de l'ancien domaine, qui vise une autre
 * adresse et un autre statut.
 */
export function routesDeNetlify(blocs) {
  return blocs
    .filter(
      (b) => b.to === '/index.html' && String(b.status) === '200' && b.from?.startsWith('/') && b.from !== '/*',
    )
    .map((b) => b.from);
}

/**
 * Le joker est-il resté, ou revenu ? Une seule règle `/* -> /index.html` en
 * 200 suffit à annuler tout le travail de la tâche 6 : Netlify applique la
 * première correspondance, et un joker placé n'importe où avant le 404
 * implicite ravale toute adresse inconnue dans la page d'accueil.
 */
export function jokerPresent(blocs) {
  return blocs.some((b) => b.from === '/*' && b.to === '/index.html' && String(b.status) === '200');
}

/**
 * Les reproches. Vide = `App.tsx` et `netlify.toml` dispatchent exactement
 * les mêmes routes, et aucun joker ne les a court-circuitées.
 */
export function reproches({ appTsx, liens, netlifyToml }) {
  const trouves = [];

  const constantes = constantesDeLiens(liens);
  const { routes: routesApp, inconnues } = routesDeAppTsx(appTsx, constantes);

  for (const inconnue of inconnues) {
    trouves.push(
      `App.tsx dispatche « ${inconnue} », qui n'est ni une chaîne littérale ` +
        `ni une constante à une ligne de liens.ts : impossible de savoir quel ` +
        `chemin en résulte, et donc de vérifier qu'il a sa règle.`,
    );
  }

  if (routesApp.length === 0) {
    trouves.push(
      "Aucune route trouvée dans App.tsx : le motif « if (chemin === …) " +
        "return » ne correspond à rien. Le script lit peut-être le mauvais " +
        'fichier, ou App.tsx a changé de forme sans que ce script suive.',
    );
  }

  const blocs = blocsRedirects(netlifyToml);
  const routesNetlify = routesDeNetlify(blocs);

  if (routesNetlify.length === 0) {
    trouves.push(
      "Aucune règle « to = /index.html, status = 200 » trouvée dans " +
        'netlify.toml. Le script lit peut-être le mauvais fichier, ou toutes ' +
        'les routes nommées ont disparu.',
    );
  }

  if (jokerPresent(blocs)) {
    trouves.push(
      'netlify.toml redirige encore /* vers /index.html en 200 : ce joker ' +
        "avale toute adresse inconnue avant qu'elle n'atteigne 404.html, et " +
        'annule le vrai 404 que la tâche 6 doit rendre — même si les routes ' +
        'nommées ci-dessous sont par ailleurs correctes.',
    );
  }

  const ensembleApp = new Set(routesApp);
  const ensembleNetlify = new Set(routesNetlify);

  for (const route of ensembleApp) {
    if (!ensembleNetlify.has(route)) {
      trouves.push(
        `${route} est dispatché par App.tsx mais n'a aucune règle dans ` +
          'netlify.toml : cette page marche en développement — Vite sert tout ' +
          '— et rendrait 404 en production.',
      );
    }
  }

  for (const route of ensembleNetlify) {
    if (!ensembleApp.has(route)) {
      trouves.push(
        `netlify.toml réécrit ${route} vers /index.html, mais App.tsx ne ` +
          "dispatche rien pour ce chemin : règle orpheline d'une page retirée, " +
          "ou faute de frappe qui masque la vraie route derrière un 404.",
      );
    }
  }

  return trouves;
}

function lire() {
  return {
    appTsx: readFileSync(APP_TSX, 'utf8'),
    liens: readFileSync(LIENS_TS, 'utf8'),
    netlifyToml: readFileSync(NETLIFY_TOML, 'utf8'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const trouves = reproches(lire());

  if (trouves.length > 0) {
    console.error("App.tsx et netlify.toml ne dispatchent pas les mêmes routes :");
    for (const r of trouves) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log('App.tsx et netlify.toml dispatchent exactement les mêmes routes.');
}

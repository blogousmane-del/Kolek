import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROUTES, adresseDe } from '../apps/site/src/vitrine/routes.ts';

/**
 * Un fichier HTML par route, avec son texte dedans.
 *
 * ## Le défaut corrigé
 *
 * Mesuré le 2026-09-20 sur `apps/site/dist/index.html` : **14 mots
 * indexables**, qui sont l'écran d'attente et son diagnostic de panne. Les 663
 * mots de la page vivaient dans 395 ko de JavaScript.
 *
 * Google rend le JavaScript, au second passage et moins bien. Bing, Qwant et
 * Yandex ne le rendent pas. WhatsApp, Facebook et LinkedIn ne le rendent
 * jamais — et Kolek se vend par lien collé dans une conversation.
 *
 * Le même geste ferme un second défaut : les cinq routes servaient le même
 * `index.html`, donc la même balise canonique pointant sur la racine, pendant
 * que le sitemap déclarait les trois pages légales. Google tranche par la
 * balise ; les trois sortaient de l'index.
 *
 * ## Pourquoi ce script et pas un outil
 *
 * Aucune dépendance nouvelle : `react-dom/server` vient avec `react-dom`, et
 * Vite sait déjà charger un module TypeScript pour Node. Les outils de
 * prérendu du marché pilotent un Chrome sans interface — une deuxième
 * construction, un navigateur à installer dans la CI, pour un résultat que
 * cinquante lignes obtiennent ici.
 *
 * ## Lancement
 *
 * Après `vite build`, jamais avant : il lit `dist/index.html` comme gabarit,
 * parce que c'est Vite qui y a posé les liens vers les paquets empreintés.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(RACINE, 'apps/site');
const DIST = join(SITE, 'dist');

/**
 * Sous ce nombre de mots, une page prérendue est tenue pour ratée et la
 * construction s'arrête.
 *
 * Le seuil attrape l'effondrement — un rendu vide, une route qui retombe sur
 * l'écran d'attente et ses 14 mots — et non la variation d'un paragraphe
 * réécrit. Un seuil serré ferait rougir la construction à chaque retouche de
 * texte, et un garde-fou qui crie sur du travail correct finit désarmé dans la
 * semaine.
 *
 * 120 est calibré sur la mesure, pas sur une estimation. La spécification
 * avait d'abord écrit 200 ; la première construction l'a démentie :
 *
 *     /mentions-legales ne rend que 175 mots indexables, seuil 200.
 *
 * Les mentions légales sont la plus courte page réelle du site, et 175 mots y
 * est un texte complet, pas un échec. Le seuil se place donc sous elle avec
 * une marge, et très au-dessus des 14 mots de l'écran d'attente : entre les
 * deux, il n'existe aucune page plausible.
 */
const SEUIL_MOTS = 120;

/** Ce qu'un attribut HTML ne peut pas porter tel quel. */
export function escaper(texte) {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Remplace une balise, ou lève.
 *
 * La levée est tout l'intérêt de cette fonction. `String.replace` sur un motif
 * introuvable ne signale rien : il rend la chaîne d'origine. Le fichier
 * s'écrirait, la construction réussirait, et les cinq routes repartiraient
 * avec la balise du gabarit — c'est-à-dire avec le défaut qu'on est en train
 * de corriger, remis en place par le correctif lui-même.
 */
function remplacer(html, motif, valeur, nom) {
  if (!motif.test(html)) {
    throw new Error(
      `Gabarit inattendu : ${nom} est introuvable dans dist/index.html. ` +
        'Le prérendu s’arrête plutôt que d’écrire une page qui garderait la balise du gabarit.',
    );
  }
  return html.replace(motif, valeur);
}

/**
 * Les bornes du contenu de `<div id="root">`.
 *
 * Un comptage de `<div>` plutôt qu'une expression régulière : l'écran
 * d'attente contient lui-même des `<div>`, et un motif paresseux se
 * refermerait sur le premier `</div>` venu, laissant la moitié du repli dans
 * la page et emportant le reste.
 */
function bornesDeRoot(html) {
  const ouverture = '<div id="root">';
  const debut = html.indexOf(ouverture);
  if (debut === -1) {
    throw new Error('Gabarit inattendu : <div id="root"> est introuvable dans dist/index.html.');
  }

  const debutContenu = debut + ouverture.length;
  const balises = /<(\/?)div\b/gi;
  balises.lastIndex = debutContenu;

  let profondeur = 1;
  let trouvee = balises.exec(html);
  while (trouvee !== null) {
    profondeur += trouvee[1] ? -1 : 1;
    if (profondeur === 0) return { debutContenu, finContenu: trouvee.index };
    trouvee = balises.exec(html);
  }

  throw new Error('Gabarit inattendu : <div id="root"> n’est jamais refermé.');
}

/** Le corps seul. Compter les mots de l'en-tête flatterait chaque page du titre et de la description qu'on vient d'y poser. */
export function corpsDe(html) {
  const debut = html.indexOf('<body');
  if (debut === -1) return html;
  const ouverture = html.indexOf('>', debut);
  const fin = html.lastIndexOf('</body>');
  return html.slice(ouverture + 1, fin === -1 ? undefined : fin);
}

/** Les mots que lit un robot : le texte, balises retirées. */
export function motsIndexables(html) {
  const texte = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return texte === '' ? 0 : texte.split(' ').length;
}

/**
 * Le gabarit, plus les balises d'une route, plus son contenu rendu.
 *
 * Fonction pure, et exportée pour cela : c'est la seule partie qui décide
 * quelque chose, et `prerendre.test.mjs` l'éprouve sans lancer ni Vite ni
 * React.
 */
export function injecter(gabarit, route, balisage) {
  const adresse = adresseDe(route);
  const titre = escaper(route.titre);
  const description = escaper(route.description);

  let html = gabarit;
  html = remplacer(html, /<title>[\s\S]*?<\/title>/i, `<title>${titre}</title>`, 'la balise <title>');
  html = remplacer(
    html,
    /<meta\b[^>]*\bname="description"[^>]*>/i,
    `<meta name="description" content="${description}" />`,
    'la meta description',
  );
  html = remplacer(
    html,
    /<link\b[^>]*\brel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${adresse}" />`,
    'la balise canonical',
  );
  html = remplacer(
    html,
    /<meta\b[^>]*\bproperty="og:url"[^>]*>/i,
    `<meta property="og:url" content="${adresse}" />`,
    'la balise og:url',
  );
  html = remplacer(
    html,
    /<meta\b[^>]*\bproperty="og:title"[^>]*>/i,
    `<meta property="og:title" content="${titre}" />`,
    'la balise og:title',
  );
  html = remplacer(
    html,
    /<meta\b[^>]*\bproperty="og:description"[^>]*>/i,
    `<meta property="og:description" content="${description}" />`,
    'la balise og:description',
  );

  if (!route.indexable) {
    // En plus du `X-Robots-Tag` du `netlify.toml`, jamais à sa place :
    // l'en-tête protège la route, la balise protège le fichier si quelqu'un
    // l'atteint autrement.
    html = remplacer(
      html,
      /<\/head>/i,
      '  <meta name="robots" content="noindex" />\n  </head>',
      'la fermeture de <head>',
    );
  }

  if (route.prerendu) {
    const { debutContenu, finContenu } = bornesDeRoot(html);
    html = html.slice(0, debutContenu) + balisage + html.slice(finContenu);
    /*
      Le marqueur que lit `main.tsx` pour choisir entre hydrater et construire.

      Sans lui, `hydrateRoot` s'appliquerait aussi à `/inscription`, dont le
      `#root` porte l'écran d'attente et non le formulaire : React trouverait
      un arbre qui ne ressemble en rien à ce qu'il vient de rendre, signalerait
      la divergence et reconstruirait tout — à chaque visite, sur la page qui
      demande un numéro et un mot de passe.

      Posé ici, par celui qui sait, au moment où il sait. Le déduire côté
      client — en cherchant si `#root` a des enfants — confondrait une page
      prérendue avec l'écran d'attente, qui en a aussi.
    */
    html = html.replace('<div id="root">', '<div id="root" data-prerendu>');
  } else {
    // L'écran d'attente reste : cette route n'est pas rendue en chaîne, et un
    // `<div id="root">` vide serait une page blanche pour qui la partage.
    bornesDeRoot(html);
  }

  return html;
}

async function principal() {
  const { createServer } = await import('vite');
  const { renderToString } = await import('react-dom/server');
  const { createElement } = await import('react');

  /*
    Un cache jetable, et non `node_modules/.vite`.

    Vite sert volontiers un module transformé depuis son cache. Ici le module
    transformé devient du HTML écrit dans `dist` : un transformé périmé
    n'afficherait pas un écran de travers, il graverait du texte faux dans les
    pages que Google va lire, et rien ne le dirait.
  */
  const cache = mkdtempSync(join(tmpdir(), 'kolek-prerendu-'));

  const vite = await createServer({
    root: SITE,
    // Mode middleware : **il n'écoute aucun port**. Les 5173 et 5174 pointent
    // sur la production ; aucune construction ne doit pouvoir s'en approcher.
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
    cacheDir: cache,
  });

  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
    const gabarit = readFileSync(join(DIST, 'index.html'), 'utf8');
    const canoniques = new Map();

    for (const route of ROUTES) {
      const balisage = route.prerendu
        ? renderToString(createElement(App, { chemin: route.chemin }))
        : '';
      const html = injecter(gabarit, route, balisage);

      if (route.prerendu) {
        const mots = motsIndexables(corpsDe(html));
        if (mots < SEUIL_MOTS) {
          throw new Error(
            `${route.chemin} ne rend que ${mots} mots indexables, seuil ${SEUIL_MOTS}. ` +
              'Une page prérendue vide est le défaut que ce script existe pour empêcher.',
          );
        }
      }

      const adresse = adresseDe(route);
      if (canoniques.has(adresse)) {
        throw new Error(
          `${route.chemin} et ${canoniques.get(adresse)} déclarent la même canonique ${adresse}.`,
        );
      }
      canoniques.set(adresse, route.chemin);

      const cible = join(DIST, route.fichier);
      mkdirSync(dirname(cible), { recursive: true });
      writeFileSync(cible, html, 'utf8');

      const mots = motsIndexables(corpsDe(html));
      console.log(`  ${route.fichier.padEnd(30)} ${String(mots).padStart(4)} mots  ${adresse}`);
    }

    console.log(`${ROUTES.length} pages écrites dans apps/site/dist.`);
  } finally {
    await vite.close();
    rmSync(cache, { recursive: true, force: true });
  }
}

// Ne s'exécute que lancé directement : `prerendre.test.mjs` importe ce module
// pour ses fonctions pures et n'a pas à construire quoi que ce soit.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await principal();
}

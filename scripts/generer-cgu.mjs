import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * La version du texte que les gens acceptent.
 *
 * Trois générateurs de ce dépôt suivent ce motif — `generer-theme.mjs`,
 * `generer-marque.mjs`, `generer-paliers-edge.mjs` — et celui-ci s'en écarte
 * sur un point : il doit charger du JSX, que Node refuse
 * (« Unknown file extension ".tsx" »). Vite le transforme, et c'est la même
 * transformation que celle qui produit le site livré : l'empreinte porte donc
 * sur ce que la personne lit, pas sur le résultat d'une seconde chaîne.
 *
 * L'empreinte porte sur le **texte rendu**, jamais sur les octets des fichiers
 * source : un commentaire ou une classe CSS changeraient les seconds sans que
 * le lecteur voie la moindre différence, et on enregistrerait « nouvelle
 * version acceptée » pour rien.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** L'origine publique du site, nommée une seule fois. Les chemins, eux, sont
    lus dans `liens.ts` : une deuxième liste de routes tenue à la main est la
    faute que `verifier-routes.mjs` existe pour attraper. */
const ORIGINE = 'https://kolek.cash';

export const CIBLE_SITE = join(RACINE, 'apps/site/src/vitrine/legal/version-conditions.ts');
export const CIBLE_COLLECTEUR = join(RACINE, 'apps/collecteur/src/version-conditions.ts');
export const CIBLE_EDGE = join(RACINE, 'supabase/functions/_shared/version-conditions.ts');
export const DOSSIER_INSTANTANES = join(RACINE, 'Docs/legal');

/** Les fermantes qui valent une fin de ligne. Sans elles, deux paragraphes
    voisins se colleraient en une phrase que personne n'a écrite. */
const FERMANTES_DE_BLOC =
  /<\/(?:p|li|h[1-6]|div|section|table|tr|td|th|ul|ol|main|header|footer|a)>/gi;

/**
 * Le HTML rendu, dépouillé en texte.
 *
 * Cette fonction **est** l'empreinte : deux dépouillements différents donnent
 * deux empreintes différentes pour le même texte lu. Son ordre est donc fixé,
 * et `&amp;` se décode en dernier — le décoder en premier transformerait le
 * texte littéral « &lt; » en un « < » que personne n'a écrit.
 */
export function enTexte(html) {
  return html
    .replace(FERMANTES_DE_BLOC, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    // Les espaces insécables U+00A0 traversent : elles ne sont pas de la mise
    // en forme, et `[ \t]` ne les décrit pas.
    .map((ligne) => ligne.replace(/[ \t]+/g, ' ').trim())
    .filter((ligne) => ligne.length > 0)
    .join('\n');
}

/** Seize caractères hexadécimaux : la valeur se lit dans un message d'erreur et
    se compare à l'œil pendant une mise au point. Une collision sur seize
    suppose un adversaire qui fabrique un second texte juridique de même
    empreinte — pas le risque qu'on traite. */
export function empreinteDe(texte) {
  return createHash('sha256').update(texte, 'utf8').digest('hex').slice(0, 16);
}

/** Lus dans `liens.ts`, jamais recopiés. Node importe ce `.ts` sans peine : il
    ne porte pas de JSX. */
const { CONDITIONS, CONFIDENTIALITE } = await import(
  pathToFileURL(join(RACINE, 'apps/site/src/vitrine/liens.ts')).href
);
const CHEMINS = { conditions: CONDITIONS, confidentialite: CONFIDENTIALITE };

const ENTETE = `// Fichier engendré par scripts/generer-cgu.mjs — ne pas modifier à la main.
// La source est le texte rendu de Conditions.tsx et Confidentialite.tsx.
// Relancer : npm run generer:cgu
//
// Cette constante est la preuve : c'est elle qu'on enregistre avec chaque
// acceptation, et elle désigne l'instantané de Docs/legal/ qu'on produirait
// devant un tribunal. Trois copies engendrées par le même passage — la vitrine,
// l'application du collecteur, les Edge Functions — et npm run verifier:cgu
// échoue si l'une diverge.

`;

export function contenuConstante(empreinte, avecUrls) {
  let texte = ENTETE + `export const VERSION_CONDITIONS = '${empreinte}';\n`;
  if (avecUrls) {
    texte +=
      `\n/** L'application du collecteur vit sur app.kolek.cash : un chemin\n` +
      `    relatif mènerait à une page qui n'existe pas. Les chemins viennent de\n` +
      `    apps/site/src/vitrine/liens.ts, l'origine est nommée dans le générateur. */\n` +
      `export const URL_CONDITIONS = '${ORIGINE}${CHEMINS.conditions}';\n` +
      `export const URL_CONFIDENTIALITE = '${ORIGINE}${CHEMINS.confidentialite}';\n`;
  }
  return texte;
}

/** Rend les deux pages et les dépouille. Le serveur Vite naît et meurt ici. */
export async function texteRendu() {
  const { createServer } = await import('vite');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');

  const serveur = await createServer({
    configFile: false,
    root: join(RACINE, 'apps/site'),
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const pageConditions = await serveur.ssrLoadModule('/src/vitrine/legal/Conditions.tsx');
    const pageConfidentialite = await serveur.ssrLoadModule(
      '/src/vitrine/legal/Confidentialite.tsx',
    );
    return (
      enTexte(renderToStaticMarkup(createElement(pageConditions.Conditions))) +
      '\n\n' +
      enTexte(renderToStaticMarkup(createElement(pageConfidentialite.Confidentialite)))
    );
  } finally {
    await serveur.close();
  }
}

/** Les fins de ligne ne sont pas du contenu : `core.autocrlf` rend en `\r\n`
    sur Windows, et sans cette normalisation le contrôle de fraîcheur échouerait
    sur tout dépôt fraîchement cloné. Même idiome que `generer-paliers-edge.mjs`. */
function normaliser(texte) {
  return texte.replace(/\r\n/g, '\n');
}

export async function estAJour() {
  const empreinte = empreinteDe(await texteRendu());
  const attendus = [
    [CIBLE_SITE, contenuConstante(empreinte, false)],
    [CIBLE_COLLECTEUR, contenuConstante(empreinte, true)],
    [CIBLE_EDGE, contenuConstante(empreinte, false)],
  ];
  for (const [chemin, attendu] of attendus) {
    try {
      if (normaliser(readFileSync(chemin, 'utf8')) !== normaliser(attendu)) return false;
    } catch {
      return false;
    }
  }
  // L'instantané doit exister pour cette empreinte, sinon la constante désigne
  // un document qu'on ne peut pas produire — la situation qu'on cherche à
  // quitter.
  try {
    return readdirSync(DOSSIER_INSTANTANES).some((nom) => nom.endsWith(`-${empreinte}.txt`));
  } catch {
    return false;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const verifier = process.argv.includes('--verifier');

  if (verifier) {
    if (await estAJour()) {
      console.log('La version des conditions est à jour.');
      process.exit(0);
    }
    console.error(
      'Le texte des conditions a bougé sans régénération. Lance `npm run generer:cgu`, et commets l’instantané.',
    );
    process.exit(1);
  }

  const texte = await texteRendu();
  const empreinte = empreinteDe(texte);
  const jour = new Date().toISOString().slice(0, 10);

  mkdirSync(DOSSIER_INSTANTANES, { recursive: true });
  writeFileSync(join(DOSSIER_INSTANTANES, `conditions-${jour}-${empreinte}.txt`), texte, 'utf8');

  for (const [chemin, avecUrls] of [
    [CIBLE_SITE, false],
    [CIBLE_COLLECTEUR, true],
    [CIBLE_EDGE, false],
  ]) {
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, contenuConstante(empreinte, avecUrls), 'utf8');
  }

  console.log(
    `Version ${empreinte} — ${texte.length} caractères, ${texte.split('\n').length} lignes.`,
  );
}

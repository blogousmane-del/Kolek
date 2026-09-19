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
 * (« Unknown file extension ".tsx" »). Vite le transforme en JavaScript que
 * Node peut exécuter. `configFile: false` (voir plus bas) écarte
 * `@vitejs/plugin-react` et Tailwind, qui ne tournent donc pas ici,
 * contrairement au site livré — vérifié : cette configuration ne porte ni
 * `define` ni `alias` qui changeraient le texte que produit
 * `renderToStaticMarkup`, donc aucune conséquence mesurable aujourd'hui. Une
 * configuration future qui ajouterait l'un des deux devrait refaire cette
 * vérification.
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

/** Les balises de bloc : une fin de ligne avant chaque ouvrante et après
    chaque fermante. Sans elles, deux paragraphes voisins se colleraient en
    une phrase que personne n'a écrite. `a` n'en fait pas partie : c'est une
    balise en ligne, et la couper produirait des lignes commençant par un
    point en plein milieu de phrase. */
const BALISES_DE_BLOC =
  /<\/?(?:p|li|h[1-6]|div|section|table|tr|td|th|ul|ol|main|header|footer)(?:\s[^>]*)?>/gi;

/**
 * Les sous-arbres marqués `data-hors-contrat`, retirés.
 *
 * Deux blocs des pages légales sont de la navigation et non du contrat : le
 * lien « ← Retour à l'accueil » de `PageLegale.tsx`, et la section « Pour
 * aller plus loin » qui ferme `Confidentialite.tsx` et `MentionsLegales.tsx`.
 * Sans ce retrait, ils entraient dans la pièce qu'on produirait à l'audience —
 * qui s'ouvrait sur une affordance de navigation et se fermait sur une liste
 * de liens dont un nommait un document qu'elle ne contient pas.
 *
 * Le vrai coût était ailleurs : **l'empreinte enregistrée avec chaque
 * acceptation dépendait de ces libellés.** Renommer « ← Retour à l'accueil »
 * changeait `VERSION_CONDITIONS` et forçait une réacceptation par tout le
 * monde, pour un changement sans aucun contenu juridique.
 *
 * Le comptage de profondeur n'est pas un ornement : une marque posée sur un
 * `<section>` qui en contiendrait un autre se refermerait sur la mauvaise
 * balise, et le retrait emporterait la moitié du contrat sans rien dire.
 */
export function retirerHorsContrat(html) {
  const marque = /<([a-z][a-z0-9]*)\b[^>]*\bdata-hors-contrat\b[^>]*>/i;

  let texte = html;
  for (;;) {
    const debut = marque.exec(texte);
    if (!debut) return texte;

    const balise = debut[1].toLowerCase();
    // Une ouvrante auto-fermante n'ouvre rien : elle ne compte pas.
    const bornes = new RegExp(`<${balise}\\b[^>]*?(/?)>|</${balise}\\s*>`, 'gi');
    bornes.lastIndex = debut.index;

    let profondeur = 0;
    let fin = -1;
    for (let borne = bornes.exec(texte); borne; borne = bornes.exec(texte)) {
      if (borne[0].startsWith('</')) {
        profondeur -= 1;
        if (profondeur === 0) {
          fin = borne.index + borne[0].length;
          break;
        }
      } else if (borne[1] !== '/') {
        profondeur += 1;
      }
    }

    if (fin === -1) {
      throw new Error(
        `data-hors-contrat sur <${balise}> sans fermante : le retrait emporterait la fin du document.`,
      );
    }
    texte = texte.slice(0, debut.index) + texte.slice(fin);
  }
}

/**
 * Le HTML rendu, dépouillé en texte.
 *
 * Cette fonction **est** l'empreinte : deux dépouillements différents
 * donnent deux empreintes différentes pour le même texte lu. La règle, dans
 * l'ordre :
 *
 * 1. une fin de ligne avant chaque balise ouvrante de bloc et après chaque
 *    balise fermante de bloc, pour `p`, `li`, `h1` à `h6`, `div`, `section`,
 *    `table`, `tr`, `td`, `th`, `ul`, `ol`, `main`, `header`, `footer` — `a`
 *    n'en fait pas partie, c'est une balise en ligne — et une fin de ligne à
 *    chaque `<br>` ;
 * 2. toutes les balises restantes retirées ;
 * 3. les entités décodées : `&lt;`, `&gt;`, `&quot;`, `&#x27;`, puis `&amp;`
 *    en dernier — le décoder en premier transformerait le texte littéral
 *    « &lt; » en un « < » que personne n'a écrit ;
 * 4. sur chaque ligne, les suites d'espaces ordinaires et de tabulations
 *    réduites à une espace, puis les bords ébarbés des seuls blancs
 *    ordinaires — `String.prototype.trim()` compte aussi l'insécable
 *    U+00A0 comme un blanc, ce qu'on ne veut pas ;
 * 5. les lignes vides supprimées, le reste joint par une fin de ligne ;
 * 6. les espaces insécables U+00A0 traversent intactes, y compris en bord de
 *    ligne : elles ne sont pas de la mise en forme.
 */
export function enTexte(html) {
  return html
    .replace(BALISES_DE_BLOC, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((ligne) => ligne.replace(/[ \t]+/g, ' ').replace(/^[ \t]+|[ \t]+$/g, ''))
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

/** Écarte le hors-contrat, dépouille, et joint les deux pages, `Conditions`
    d'abord. Fonction pure, sans Vite : le rendu de `Confidentialite.tsx` était
    un trou de couverture que les huit épreuves d'origine laissaient passer sans
    rougir. Cette fonction s'éprouve seule, à la vitesse d'une épreuve
    normale ; `texteRendu` l'appelle avec le HTML que Vite a produit.

    Le retrait vient **avant** le dépouillement : `enTexte` efface les balises,
    donc la marque avec elles. */
export function composer(htmlConditions, htmlConfidentialite) {
  return (
    enTexte(retirerHorsContrat(htmlConditions)) +
    '\n\n' +
    enTexte(retirerHorsContrat(htmlConfidentialite))
  );
}

/** Rend les deux pages. Le serveur Vite naît et meurt ici. */
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
    return composer(
      renderToStaticMarkup(createElement(pageConditions.Conditions)),
      renderToStaticMarkup(createElement(pageConfidentialite.Confidentialite)),
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

/** Les trois constantes sont écrites en CRLF, comme tout le reste du dépôt.
    Les écrire en LF fonctionnait — `estAJour` normalise les deux côtés — mais
    faisait basculer trois fichiers suivis à chaque `generer:cgu`, avec un
    « LF will be replaced by CRLF » de git à chaque fois. L'instantané de
    `Docs/legal/`, lui, reste en LF : `.gitattributes` l'y épingle, parce que
    son empreinte est dans son propre nom. */
function enCrlf(texte) {
  return normaliser(texte).replace(/\n/g, '\r\n');
}

/** Le contrôle de contenu de l'instantané, isolé pour être éprouvé sur un
    répertoire temporaire plutôt que sur Docs/legal/. Un contrôle qui ne
    regarde que le suffixe du nom laisse passer un fichier vidé de son texte
    légal et renommé pour porter la bonne empreinte : la pièce qu'on
    produirait à l'audience ne correspondrait alors plus à rien. Ici, le
    fichier trouvé est lu, dépouillé des différences de fin de ligne, et sa
    propre empreinte doit retomber sur celle attendue. */
export function instantaneValide(empreinte, dossier = DOSSIER_INSTANTANES) {
  let noms;
  try {
    noms = readdirSync(dossier);
  } catch {
    return false;
  }
  const nom = noms.find((n) => n.endsWith(`-${empreinte}.txt`));
  if (!nom) return false;
  try {
    const contenu = readFileSync(join(dossier, nom), 'utf8');
    return empreinteDe(normaliser(contenu)) === empreinte;
  } catch {
    return false;
  }
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
  // L'instantané doit exister pour cette empreinte, et son contenu doit
  // retomber sur cette même empreinte une fois dépouillé — sinon la
  // constante désigne un document qu'on ne peut pas produire, la situation
  // qu'on cherche à quitter.
  return instantaneValide(empreinte);
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
    writeFileSync(chemin, enCrlf(contenuConstante(empreinte, avecUrls)), 'utf8');
  }

  console.log(
    `Version ${empreinte} — ${texte.length} caractères, ${texte.split('\n').length} lignes.`,
  );
}

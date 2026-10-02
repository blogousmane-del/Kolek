/**
 * La table des routes du site public — source unique.
 *
 * ## Le défaut qu'elle ferme
 *
 * Au 2026-09-20, les routes étaient écrites en trois endroits qui ne se
 * parlaient pas : les cinq `if` de `App.tsx`, les quatre réécritures du
 * `netlify.toml`, et les quatre `<loc>` du `sitemap.xml`.
 * `scripts/verifier-routes.mjs` n'en comparait que deux.
 *
 * Le prix se lisait dans le HTML servi. Les cinq chemins rendaient le même
 * `index.html`, donc la même ligne :
 *
 *     <link rel="canonical" href="https://kolek.cash/" />
 *
 * Les trois pages légales déclaraient donc la racine comme leur propre
 * version canonique — l'exact contraire de ce que le sitemap déclarait au même
 * moment. Google tranche par la balise : les trois sortaient de l'index. Le
 * commentaire de `index.html` nommait ce défaut et le laissait ouvert ; cette
 * table est ce par quoi il se ferme.
 *
 * ## Ses lecteurs
 *
 * `App.tsx` pour router, `scripts/prerendre.mjs` pour écrire un fichier par
 * route, `scripts/engendrer-sitemap.mjs` pour déclarer les indexables, et
 * `scripts/verifier-routes.mjs` pour refuser une route qui manquerait au
 * `netlify.toml`. Une route ajoutée ici se propage aux quatre ; une route
 * ajoutée ailleurs fait rougir la vérification.
 *
 * ## Pourquoi un point médian et non un cadratin
 *
 * Les titres sont des libellés de moins de 70 signes, et ce fichier vit sous
 * `apps/site/src` : `npm run verifier:tirets` y refuse le cadratin, pour la
 * raison écrite en tête de `scripts/verifier-tirets.mjs` — dans un libellé, il
 * remplace un mot qu'on a omis d'écrire. `public/404.html` emploie déjà le
 * point médian ; le site n'a donc pas deux conventions, il en a une.
 */

// Extension explicite : ce module est importé **par Node**, dans
// `scripts/engendrer-sitemap.mjs`, comme `liens.ts` l'est déjà par
// `scripts/generer-cgu.mjs`. Node ESM ne devine pas une extension manquante là
// où Vite la devine.
import { CONDITIONS, CONFIDENTIALITE, INSCRIPTION, MENTIONS_LEGALES } from './liens.ts';

/**
 * L'origine du site en production.
 *
 * Elle est ici et nulle part ailleurs : la balise canonique, `og:url` et le
 * sitemap doivent dire la même chose, et trois copies d'une adresse finissent
 * par diverger. Sans barre oblique finale — les chemins de la table en portent
 * une en tête, et deux barres feraient une adresse que personne ne sert.
 */
export const ORIGINE = 'https://kolek.cash';

export type Route = {
  /** Le chemin servi, sans barre oblique finale. La racine est `/`. */
  chemin: string;
  /**
   * Le fichier écrit dans `dist`. Forme répertoire — `conditions/index.html`
   * et non `conditions.html` — pour que `/conditions` et `/conditions/`
   * aboutissent tous deux, sur Netlify comme sur n'importe quel serveur
   * statique, sans dépendre d'une option d'hébergeur.
   */
  fichier: string;
  /** Le `<title>`. Sous 60 signes : au-delà, Google tronque où il veut. */
  titre: string;
  /**
   * La `<meta description>`. Entre 120 et 160 signes : plus court, le robot la
   * complète d'un extrait qu'il choisit ; plus long, il la coupe.
   */
  description: string;
  /** Déclarée au sitemap, et laissée à l'index. */
  indexable: boolean;
  /** Son contenu est rendu dans le HTML servi, avant tout JavaScript. */
  prerendu: boolean;
};

/**
 * L'adresse absolue d'une route, pour la balise canonique et pour `og:url`.
 *
 * La racine garde sa barre oblique finale — `https://kolek.cash/` est la forme
 * déjà indexée, et une canonique qui change d'un caractère est une canonique
 * qui désigne une autre page.
 */
export function adresseDe(route: Route): string {
  return route.chemin === '/' ? `${ORIGINE}/` : `${ORIGINE}${route.chemin}`;
}

export const ROUTES: readonly Route[] = [
  {
    /*
      Les mots que les collecteurs tapent dans Google, choisis par l'exploitant
      le 2026-10-02 : tontine, collecte journalière, banquier ambulant,
      tontinier, carnet, Abidjan, Côte d'Ivoire. Les concurrents directs en Côte
      d'Ivoire — Tondi, Tonty, My Tontine, Tonti — se présentent tous par
      « tontine » ; un document de l'OIT nomme « tontine commerciale » le métier
      même de Kolek, un collecteur qui passe d'étal en étal et garde une mise
      par cycle.

      Le titre porte le nom du produit et de sa catégorie, la description les
      mots du métier et du lieu. Le grand titre de la page, lui, ne bouge pas :
      l'exploitant l'a gardé pour la marque. `routes.test.ts` refuse un titre ou
      une description qui perdrait ces mots.
    */
    chemin: '/',
    fichier: 'index.html',
    titre: 'Kolek · Application de tontine et collecte journalière',
    description:
      'Le carnet du banquier ambulant et du tontinier, sur téléphone : chaque mise comptée, chaque caisse rapprochée. Pour les collecteurs d’Abidjan, Côte d’Ivoire.',
    indexable: true,
    prerendu: true,
  },
  {
    chemin: MENTIONS_LEGALES,
    fichier: 'mentions-legales/index.html',
    titre: 'Mentions légales · Kolek',
    description:
      'L’éditeur du site Kolek, son hébergeur et le responsable de la publication. Les informations légales de GTCS, exploitant du service.',
    indexable: true,
    prerendu: true,
  },
  {
    chemin: CONDITIONS,
    fichier: 'conditions/index.html',
    titre: 'Conditions générales · Kolek',
    description:
      'Les conditions générales d’utilisation de Kolek : ce que le service fait, ce qu’il ne fait pas, et les engagements de chaque partie.',
    indexable: true,
    prerendu: true,
  },
  {
    chemin: CONFIDENTIALITE,
    fichier: 'confidentialite/index.html',
    titre: 'Politique de confidentialité · Kolek',
    description:
      'Quelles données Kolek collecte, pourquoi, combien de temps elles sont gardées, et comment exercer vos droits d’accès et d’effacement.',
    indexable: true,
    prerendu: true,
  },
  {
    /*
      Le formulaire d'ouverture de compte porte deux « non », et pour deux
      raisons distinctes qu'il ne faut pas confondre.

      **Hors de l'index** : c'est le choix déjà pris, doublé par le
      `X-Robots-Tag` du `netlify.toml`. Une recherche « Kolek » doit tomber sur
      la page qui explique le produit, pas sur un formulaire vide. Rien à
      cacher : la page est publique et le reste.

      **Non prérendu** : son contenu dépend de la chaîne de requête —
      `palierDepuisAdresse(window.location.search)` dans `Inscription.tsx`. Un
      prérendu figé sur un palier vide serait remplacé par un autre à
      l'hydratation, ce qui est exactement la divergence qu'on cherche à
      éviter. Un formulaire n'a rien à indexer ; le rendre en chaîne ne
      rapporterait rien et coûterait cette divergence.

      Elle reçoit tout de même son fichier, pour ses seules balises : un lien
      d'inscription collé dans WhatsApp affichait jusqu'ici l'aperçu de la
      racine. Son corps reste l'écran d'attente.
    */
    chemin: INSCRIPTION,
    fichier: 'inscription/index.html',
    titre: 'Ouvrir un compte collecteur · Kolek',
    description:
      'Ouvrez votre compte collecteur Kolek. Laissez votre nom et votre numéro : GTCS vous rappelle et vous encaissez dès le lendemain.',
    indexable: false,
    prerendu: false,
  },
];

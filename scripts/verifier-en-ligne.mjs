// Vérification d'après-déploiement, depuis l'extérieur.
//
// Ce que `verifier-bundles.mjs` contrôle dans `dist/`, ce script le contrôle
// sur ce que Netlify sert réellement. La différence n'est pas cosmétique : les
// en-têtes n'existent pas dans `dist/`, ils naissent du `netlify.toml` au
// moment de la publication. Une CSP fautive ne se voit qu'ici.
//
//   node scripts/verifier-en-ligne.mjs
//
// Sortie non nulle au premier manquement. À rejouer après chaque changement de
// `netlify.toml`, de variable d'environnement ou de référence Supabase.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chercherFuitesTexte } from './verifier-bundles.mjs';

const PROJET = 'yfnwmokxkznejotgpfgf';

/**
 * ## La fraîcheur, ajoutée le 2026-08-21 après un manquement de ce script
 *
 * Ce fichier a répondu « conforme » trois fois de suite, les 20 et 21 août,
 * pendant que les trois sites servaient une construction vieille de deux jours.
 * Six écrans venaient d'être livrés côté collecteur ; aucun n'était en ligne, et
 * rien ne l'a dit. C'est l'exploitant qui l'a signalé.
 *
 * Le défaut n'était pas dans ce qui était vérifié — en-têtes, CSP, fuites de
 * clés, tout était juste — mais dans la conclusion tirée : « les trois cibles
 * servent ce que le dépôt déclare » était **une phrase que rien ne mesurait**.
 * Le script contrôlait la posture de sécurité du déploiement, jamais son
 * contenu.
 *
 * Le remède était déjà écrit dans `Docs/deploiement.md`, sans être appliqué :
 * la construction Netlify du site public avait produit une empreinte identique
 * au bit près à celle du build local, d'où *« une divergence d'empreinte se lit
 * comme une divergence de source »*. On compare donc désormais les noms
 * d'artefacts servis à ceux du `dist/` local.
 *
 * L'absence de `dist/` est un **échec**, pas un saut silencieux : c'est
 * exactement le genre de contrôle qu'on désactive sans le vouloir, et un
 * contrôle qui s'efface tout seul ne vaut rien.
 */
export function comparerAssets(servis, locaux) {
  const trier = (liste) => [...liste].sort();
  const manquants = locaux.filter((a) => !servis.includes(a));
  const inattendus = servis.filter((a) => !locaux.includes(a));
  return { identique: manquants.length === 0 && inattendus.length === 0, manquants, inattendus, trier };
}

/** Découpe une valeur de CSP en directive -> liste de sources. */
export function analyserCsp(valeur) {
  const directives = {};
  for (const morceau of valeur.split(';')) {
    const [nom, ...sources] = morceau.trim().split(/\s+/);
    if (nom) directives[nom] = sources;
  }
  return directives;
}

/** Extrait les chemins d'assets référencés par un document HTML. */
export function assetsDe(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
}

const EN_TETES_ATTENDUS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

/**
 * HSTS ne se compare pas à l'identique : Netlify ajoutait `preload` de son
 * propre chef sur les adresses `.netlify.app`. Refuser cette valeur reviendrait
 * à signaler comme un défaut une politique plus stricte que la nôtre. On
 * vérifie donc le plancher — un an, sous-domaines compris — et on laisse passer
 * le reste.
 *
 * Depuis le passage à `kolek.cash` le 2026-08-26, `preload` n'est plus ajouté :
 * il ne l'est que sur les domaines dont Netlify est propriétaire. Le plancher
 * reste le bon contrôle, et il l'était déjà pour la mauvaise raison — c'est
 * `includeSubDomains` qui compte désormais, puisqu'il couvre maintenant
 * `app.` et `admin.`, servis par deux autres sites.
 */
export function hstsSuffisant(valeur) {
  if (!valeur) return false;
  const age = /max-age=(\d+)/.exec(valeur);
  return Boolean(age) && Number(age[1]) >= 31536000 && /includeSubDomains/i.test(valeur);
}

/**
 * Extrait la clé anonyme d'un artefact servi.
 *
 * L'expression part de `eyJ` — l'en-tête JWT encodé — et **pas** du segment de
 * charge utile, qui commence lui aussi par `eyJ`. C'est la nuance qui rendait
 * une clé amputée indiscernable d'une clé entière : une correspondance qui
 * démarre au milieu du jeton en rend un fragment plausible.
 */
export function cleAnonyme(texte) {
  const trouve = texte.match(/eyJhbGciOi[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return trouve ? trouve[0] : null;
}

/**
 * Ce qui manque à un document pour être trouvable — et partageable.
 *
 * Fonction pure, parce que ces balises sont exactement le genre de chose qu'une
 * refonte de `index.html` emporte sans que personne ne s'en aperçoive. Leur
 * disparition ne casse rien : le site continue de s'afficher, les liens
 * partagés redeviennent des adresses nues, et on l'apprend des semaines plus
 * tard en constatant que la page a quitté les résultats.
 *
 * `origine` est passée plutôt que codée en dur, et le 2026-08-26 a donné raison
 * à ce choix : `kolek-site.netlify.app` a cédé la place à `kolek.cash`, et ces
 * balises étaient les seules du dépôt à porter l'ancienne adresse **sans que
 * rien ne casse** si on les oubliait. Le contrôle compare à l'origine réellement
 * interrogée ; il échoue donc tant qu'une balise est restée en arrière.
 */
export function manquesSeo(html, origine) {
  const manques = [];
  const contenuDe = (attribut, nom) => {
    const motif = new RegExp(
      `<meta[^>]+${attribut}="${nom}"[^>]+content="([^"]*)"|` +
        `<meta[^>]+content="([^"]*)"[^>]+${attribut}="${nom}"`,
      'i',
    );
    const trouve = motif.exec(html);
    return trouve ? (trouve[1] ?? trouve[2]) : null;
  };

  const canonique = /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i.exec(html);
  if (!canonique) manques.push('aucune balise canonique');
  else if (canonique[1] !== `${origine}/`) {
    manques.push(`canonique = ${canonique[1]} (attendu : ${origine}/)`);
  }

  const attendus = {
    'og:url': `${origine}/`,
    'og:image': `${origine}/og.png`,
    'og:type': 'website',
    'twitter:card': 'summary_large_image',
  };
  for (const [nom, valeur] of Object.entries(attendus)) {
    const recu = contenuDe(nom.startsWith('og:') ? 'property' : 'name', nom);
    if (recu !== valeur) manques.push(`${nom} = ${recu ?? 'absent'} (attendu : ${valeur})`);
  }

  // Le titre et la description ne sont pas comparés à une constante : ce sont
  // des textes de vente, ils bougeront. Ce qui doit tenir, c'est qu'ils
  // existent et qu'ils disent la même chose que la page.
  const titrePage = /<title>([^<]*)<\/title>/i.exec(html);
  const ogTitre = contenuDe('property', 'og:title');
  if (!ogTitre) manques.push('og:title absent');
  else if (titrePage && ogTitre !== titrePage[1]) {
    manques.push(`og:title diverge du <title> : « ${ogTitre} » contre « ${titrePage[1]} »`);
  }

  const description = /<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html);
  const ogDescription = contenuDe('property', 'og:description');
  if (!ogDescription) manques.push('og:description absente');
  else if (description && ogDescription !== description[1]) {
    manques.push('og:description diverge de la <meta description>');
  }

  return manques;
}

/**
 * Ce qui cloche dans la redirection de l'adresse qu'on a quittée.
 *
 * Le défaut visé est muet : si le *primary domain* n'est pas posé sur Netlify,
 * l'ancienne adresse continue de **servir** l'application au lieu de rediriger.
 * Rien n'a l'air cassé — les deux adresses répondent 200 — mais deux origines
 * servent la même page, et les listes CORS des Edge Functions n'en nomment
 * qu'une. Le formulaire marche depuis l'une, échoue depuis l'autre, selon le
 * lien par lequel le visiteur est arrivé.
 *
 * Un 404 n'est pas davantage une réussite : le lien partagé la semaine dernière
 * mène alors au vide plutôt qu'au nouveau domaine.
 *
 * Rend `null` quand il n'y a rien à redire — la redirection est le cas normal,
 * et c'est le manquement qui doit porter un texte.
 */
export function manqueRedirection(statut, destination, attendue) {
  if (statut === 200) {
    return (
      "sert encore l'application (200) — le domaine principal n'est pas posé sur " +
      'Netlify, et deux origines servent la même page'
    );
  }
  if (statut < 300 || statut >= 400) {
    return `répond ${statut}, attendu une redirection vers ${attendue}`;
  }

  const sansBarre = (adresse) => String(adresse ?? '').replace(/\/+$/, '');
  if (sansBarre(destination) !== sansBarre(attendue)) {
    return `redirige vers ${destination ?? 'nulle part'}, attendu ${attendue}`;
  }

  return null;
}

export const CIBLES = [
  {
    nom: 'collecteur',
    url: 'https://app.kolek.cash',
    // L'adresse d'avant le 2026-08-26. Elle reste le nom permanent du site chez
    // Netlify — c'est elle que visent les `CNAME` — et doit désormais rediriger
    // plutôt que servir.
    ancienne: 'https://kolek-collecteur.netlify.app',
    dist: 'apps/collecteur/dist',
    supabase: true,
    pwa: true,
    permissions: 'camera=(self), geolocation=(), microphone=()',
    robots: 'noindex, nofollow',
    robotsRegle: 'Disallow: /',
  },
  {
    nom: 'admin',
    url: 'https://admin.kolek.cash',
    ancienne: 'https://kolek-admin.netlify.app',
    dist: 'apps/admin/dist',
    supabase: true,
    pwa: false,
    permissions: 'camera=(), geolocation=(), microphone=()',
    robots: 'noindex, nofollow',
    robotsRegle: 'Disallow: /',
  },
  {
    nom: 'site',
    url: 'https://kolek.cash',
    ancienne: 'https://kolek-site.netlify.app',
    dist: 'apps/site/dist',
    // Passé à `true` le 2026-08-23. La vitrine était une brochure : elle ne
    // parlait à personne, et le contrôle exigeait `connect-src 'self'` seul.
    // Elle porte désormais le formulaire de demande d'ouverture et l'accès au
    // compte collecteur — elle appelle donc le projet, légitimement.
    //
    // Le contrôle n'est pas affaibli : `connect-src` doit toujours **nommer**
    // le projet, et le joker reste interdit. Ce qui change, c'est l'attente,
    // pas la sévérité. Laisser l'ancienne aurait produit un manquement à chaque
    // exécution — et un contrôle qui crie toujours n'est plus lu.
    supabase: true,
    pwa: false,
    permissions: 'camera=(), geolocation=(), microphone=()',
    // Le seul des trois qui doit rester indexable : aucun en-tête, et une règle
    // d'autorisation écrite noir sur blanc plutôt que déduite d'une absence.
    robots: null,
    robotsRegle: 'Allow: /',
    // Et le seul, donc, à qui les contrôles d'indexation s'appliquent. Les
    // poser sur les deux applications reviendrait à exiger un sitemap de pages
    // qu'on interdit aux moteurs.
    seo: true,
  },
];

async function verifier(cible) {
  const echecs = [];
  const constat = (condition, message) => {
    if (!condition) echecs.push(message);
  };
  const memeListe = (recu, attendu) => JSON.stringify(recu) === JSON.stringify(attendu);

  const racine = await fetch(cible.url);
  constat(racine.ok, `racine renvoie ${racine.status}`);

  const hsts = racine.headers.get('strict-transport-security');
  constat(hstsSuffisant(hsts), `strict-transport-security insuffisant : ${hsts ?? 'absent'}`);

  for (const [nom, attendu] of Object.entries(EN_TETES_ATTENDUS)) {
    const recu = racine.headers.get(nom);
    constat(recu === attendu, `${nom} = ${recu ?? 'absent'} (attendu : ${attendu})`);
  }
  constat(
    racine.headers.get('permissions-policy') === cible.permissions,
    `permissions-policy = ${racine.headers.get('permissions-policy') ?? 'absent'}`,
  );
  // L'indexation se vérifie dans les deux sens. Un `X-Robots-Tag` oublié sur un
  // outil interne est une incohérence silencieuse ; le même en-tête posé par
  // erreur sur le site public le ferait disparaître des moteurs sans qu'aucune
  // alerte ne le dise.
  const robotsEnTete = racine.headers.get('x-robots-tag');
  constat(
    robotsEnTete === (cible.robots ?? null),
    `x-robots-tag = ${robotsEnTete ?? 'absent'} (attendu : ${cible.robots ?? 'absent'})`,
  );

  // Et le fichier, qui doit exister réellement. Sans lui, la réécriture `/*`
  // rend `index.html` en 200 : un moteur reçoit du HTML là où il attend des
  // règles, et conclut qu'il n'y en a aucune.
  const robots = await fetch(`${cible.url}/robots.txt`);
  constat(robots.ok, `/robots.txt renvoie ${robots.status}`);
  const typeRobots = robots.headers.get('content-type') ?? '';
  constat(
    typeRobots.includes('text/plain'),
    `/robots.txt sert ${typeRobots} — la réécriture SPA l'a probablement avalé`,
  );
  const regleRobots = await robots.text();
  constat(
    regleRobots.includes(cible.robotsRegle),
    `/robots.txt ne contient pas « ${cible.robotsRegle} »`,
  );

  // La CSP. Les directives qui portent le risque : d'où vient le code, à qui
  // l'application peut parler, et qui a le droit de l'encadrer.
  const csp = racine.headers.get('content-security-policy');
  constat(Boolean(csp), 'aucune CSP servie');
  if (csp) {
    const d = analyserCsp(csp);
    constat(memeListe(d['script-src'], ["'self'"]), `script-src = ${d['script-src']}`);
    constat(memeListe(d['object-src'], ["'none'"]), `object-src = ${d['object-src']}`);
    constat(memeListe(d['frame-ancestors'], ["'none'"]), `frame-ancestors = ${d['frame-ancestors']}`);
    constat(memeListe(d['base-uri'], ["'none'"]), `base-uri = ${d['base-uri']}`);
    constat(memeListe(d['font-src'], ["'self'"]), `font-src = ${d['font-src']}`);

    const connect = d['connect-src'] ?? [];
    constat(!connect.some((source) => source.includes('*')), `connect-src contient un joker : ${connect}`);
    if (cible.supabase) {
      constat(
        connect.includes(`https://${PROJET}.supabase.co`),
        `connect-src ne nomme pas le projet : ${connect}`,
      );
    } else {
      constat(
        memeListe(connect, ["'self'"]),
        `connect-src du site public devrait valoir 'self' seul : ${connect}`,
      );
    }
  }

  // Les artefacts servis. On cherche la clé de service, et on vérifie que la
  // clé anonyme a bien été injectée au build — une variable oubliée donne une
  // application qui se charge et ne parle à personne.
  const html = await racine.text();
  const assets = assetsDe(html);
  constat(assets.length > 0, 'aucun asset référencé dans le HTML');

  // La fraîcheur. Voir la note en tête de fichier : c'est le contrôle dont
  // l'absence a laissé trois sites périmés passer pour conformes pendant deux
  // jours. Il vient avant tout le reste dans l'ordre d'importance — une CSP
  // parfaite sur une version qui n'est pas la bonne ne protège rien d'utile.
  try {
    const htmlLocal = await readFile(`${cible.dist}/index.html`, 'utf8');
    const locaux = assetsDe(htmlLocal);
    const { identique, manquants, inattendus } = comparerAssets(assets, locaux);
    if (!identique) {
      echecs.push(
        `le site en ligne ne sert pas la construction du dépôt — servi : ${
          inattendus.join(', ') || '(rien de plus)'
        } ; attendu : ${manquants.join(', ') || '(rien de plus)'}`,
      );
    }
  } catch {
    // Pas de `dist/` : on ne peut pas conclure, donc on ne conclut pas. Sauter
    // en silence serait exactement la faute qu'on répare ici.
    echecs.push(
      `${cible.dist}/index.html introuvable — impossible de comparer. Lancer « npm run build » d'abord.`,
    );
  }

  let voitSupabase = false;
  let cleServie = null;
  for (const chemin of assets) {
    const reponse = await fetch(cible.url + chemin);
    constat(reponse.ok, `${chemin} renvoie ${reponse.status}`);
    if (chemin.endsWith('.js') || chemin.endsWith('.css')) {
      const corps = await reponse.text();
      for (const fuite of chercherFuitesTexte(corps)) {
        echecs.push(`FUITE dans ${chemin} — ${fuite}`);
      }
      if (corps.includes(`${PROJET}.supabase.co`)) voitSupabase = true;
      cleServie ??= cleAnonyme(corps);
    }
    const cache = reponse.headers.get('cache-control') ?? '';
    constat(cache.includes('immutable'), `${chemin} sans cache immuable : ${cache}`);
  }
  constat(
    voitSupabase === cible.supabase,
    cible.supabase
      ? "l'URL Supabase est absente du bundle — variable d'environnement non injectée"
      : 'le site public embarque une URL Supabase, il ne devrait appeler personne',
  );

  // La clé servie est-elle **acceptée** ?
  //
  // Ce contrôle est né d'un défaut réel, le 2026-08-23 : la vitrine en ligne
  // portait une clé anonyme amputée de son premier caractère — 207 octets au
  // lieu de 208, une variable d'environnement mal recopiée dans Netlify. Le
  // site se chargeait, la CSP était parfaite, la clé *ressemblait* à une clé.
  // Et chaque appel au projet répondait 401 : formulaire de demande, connexion
  // collecteur, connexion Google — tout muet.
  //
  // Constater la présence de la clé ne suffisait pas ; c'est sa validité qu'il
  // faut éprouver, et seul le serveur d'authentification peut la trancher.
  if (cible.supabase) {
    if (cleServie === null) {
      echecs.push(
        'aucune clé anonyme reconnaissable dans les artefacts servis — ' +
          "variable d'environnement absente au build, ou clé tronquée (elle doit commencer par « eyJhbGciOi »)",
      );
    } else {
      const essai = await fetch(`https://${PROJET}.supabase.co/auth/v1/settings`, {
        headers: { apikey: cleServie },
      });
      constat(
        essai.ok,
        `la clé anonyme servie est refusée par le projet (${essai.status}) — ` +
          `${cleServie.length} caractères ; vérifier la variable d'environnement du site`,
      );
    }
  }

  // Réécriture d'application à page unique : une route inconnue rend l'index.
  const inconnue = await fetch(`${cible.url}/route-qui-nexiste-pas`);
  constat(inconnue.status === 200, `route inconnue renvoie ${inconnue.status}, attendu 200`);
  constat(
    (inconnue.headers.get('content-type') ?? '').includes('text/html'),
    `route inconnue sert ${inconnue.headers.get('content-type')}`,
  );

  // L'indexation, pour le seul site qui la cherche.
  //
  // Aucun de ces contrôles ne porte sur la sécurité, et c'est voulu : ils
  // gardent la surface commerciale. Une balise perdue ne casse rien et ne se
  // voit nulle part — c'est exactement le profil de défaut que ce fichier
  // existe pour attraper.
  if (cible.seo) {
    for (const manque of manquesSeo(html, cible.url)) echecs.push(`SEO — ${manque}`);

    const sitemap = await fetch(`${cible.url}/sitemap.xml`);
    constat(sitemap.ok, `/sitemap.xml renvoie ${sitemap.status}`);
    const typeSitemap = sitemap.headers.get('content-type') ?? '';
    constat(
      typeSitemap.includes('xml'),
      `/sitemap.xml sert ${typeSitemap} — la réécriture SPA l'a probablement avalé`,
    );
    if (sitemap.ok) {
      const corps = await sitemap.text();
      constat(
        corps.includes(`<loc>${cible.url}/</loc>`),
        `/sitemap.xml ne déclare pas ${cible.url}/`,
      );
    }
    constat(
      regleRobots.includes(`Sitemap: ${cible.url}/sitemap.xml`),
      '/robots.txt ne déclare pas le sitemap',
    );

    // L'image de partage. Une balise `og:image` qui pointe un 404 fait pire que
    // rien : la plateforme affiche un cadre vide au lieu du lien nu.
    const og = await fetch(`${cible.url}/og.png`);
    constat(og.ok, `/og.png renvoie ${og.status}`);
    constat(
      (og.headers.get('content-type') ?? '').includes('image/png'),
      `/og.png sert ${og.headers.get('content-type') ?? 'rien'}`,
    );

    // Le formulaire hors index. En-tête et non balise : la réécriture sert le
    // même `index.html` aux deux chemins, donc seule la réponse HTTP peut les
    // distinguer avant que le robot n'exécute quoi que ce soit.
    const inscription = await fetch(`${cible.url}/inscription`);
    constat(
      inscription.headers.get('x-robots-tag') === 'noindex',
      `/inscription x-robots-tag = ${inscription.headers.get('x-robots-tag') ?? 'absent'}`,
    );
  }

  // L'adresse qu'on a quittée. Elle doit avoir cessé de servir — voir la note
  // sur `manqueRedirection`. `redirect: 'manual'` est indispensable : sans lui,
  // `fetch` suivrait la 301 et rendrait le 200 de la destination, ce qui ferait
  // passer le contrôle quoi qu'il arrive.
  if (cible.ancienne) {
    const ancienne = await fetch(cible.ancienne, { redirect: 'manual' });
    const manque = manqueRedirection(
      ancienne.status,
      ancienne.headers.get('location'),
      cible.url,
    );
    constat(manque === null, `${cible.ancienne} — ${manque}`);
  }

  // La PWA. Un service worker mis en cache fige la version installée sur le
  // téléphone du collecteur : c'est l'en-tête qu'on vérifie, pas le fichier.
  if (cible.pwa) {
    for (const chemin of ['/manifest.webmanifest', '/sw.js']) {
      const reponse = await fetch(cible.url + chemin);
      constat(reponse.ok, `${chemin} renvoie ${reponse.status}`);
      const cache = reponse.headers.get('cache-control') ?? '';
      constat(cache.includes('must-revalidate'), `${chemin} sans must-revalidate : ${cache}`);
    }
  }

  return echecs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let total = 0;
  for (const cible of CIBLES) {
    const echecs = await verifier(cible);
    total += echecs.length;
    if (echecs.length === 0) {
      console.log(`${cible.nom.padEnd(11)} conforme — ${cible.url}`);
    } else {
      console.error(`${cible.nom.padEnd(11)} ${echecs.length} manquement(s) — ${cible.url}`);
      for (const echec of echecs) console.error(`  ${echec}`);
    }
  }
  if (total > 0) process.exit(1);
  // Cette phrase a longtemps été fausse : rien ne comparait le contenu servi à
  // celui du dépôt. Depuis le 2026-08-21, elle est mesurée.
  console.log('Les trois cibles servent ce que le dépôt déclare — artefacts comparés.');
}

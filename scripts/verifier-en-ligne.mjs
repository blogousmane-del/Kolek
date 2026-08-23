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
 * HSTS ne se compare pas à l'identique : Netlify ajoute `preload` de son propre
 * chef sur les domaines `.netlify.app`. Refuser cette valeur reviendrait à
 * signaler comme un défaut une politique plus stricte que la nôtre. On vérifie
 * donc le plancher — un an, sous-domaines compris — et on laisse passer le
 * reste.
 */
export function hstsSuffisant(valeur) {
  if (!valeur) return false;
  const age = /max-age=(\d+)/.exec(valeur);
  return Boolean(age) && Number(age[1]) >= 31536000 && /includeSubDomains/i.test(valeur);
}

export const CIBLES = [
  {
    nom: 'collecteur',
    url: 'https://kolek-collecteur.netlify.app',
    dist: 'apps/collecteur/dist',
    supabase: true,
    pwa: true,
    permissions: 'camera=(self), geolocation=(), microphone=()',
    robots: 'noindex, nofollow',
    robotsRegle: 'Disallow: /',
  },
  {
    nom: 'admin',
    url: 'https://kolek-admin.netlify.app',
    dist: 'apps/admin/dist',
    supabase: true,
    pwa: false,
    permissions: 'camera=(), geolocation=(), microphone=()',
    robots: 'noindex, nofollow',
    robotsRegle: 'Disallow: /',
  },
  {
    nom: 'site',
    url: 'https://kolek-site.netlify.app',
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
  for (const chemin of assets) {
    const reponse = await fetch(cible.url + chemin);
    constat(reponse.ok, `${chemin} renvoie ${reponse.status}`);
    if (chemin.endsWith('.js') || chemin.endsWith('.css')) {
      const corps = await reponse.text();
      for (const fuite of chercherFuitesTexte(corps)) {
        echecs.push(`FUITE dans ${chemin} — ${fuite}`);
      }
      if (corps.includes(`${PROJET}.supabase.co`)) voitSupabase = true;
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

  // Réécriture d'application à page unique : une route inconnue rend l'index.
  const inconnue = await fetch(`${cible.url}/route-qui-nexiste-pas`);
  constat(inconnue.status === 200, `route inconnue renvoie ${inconnue.status}, attendu 200`);
  constat(
    (inconnue.headers.get('content-type') ?? '').includes('text/html'),
    `route inconnue sert ${inconnue.headers.get('content-type')}`,
  );

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

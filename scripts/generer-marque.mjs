import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { couleurs } from '../packages/core/src/tokens.ts';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Le favicon et les icônes d'application, engendrés depuis `tokens.ts`.
 *
 * Ces trois artefacts sont les seules surfaces de marque que le thème ne peut
 * pas atteindre. Un favicon est chargé seul par le navigateur, hors de toute
 * feuille de style ; une icône PNG posée sur l'écran d'accueil d'un téléphone
 * est un tas de pixels. Tous deux doivent donc porter leurs couleurs en dur —
 * et c'est exactement ainsi qu'une palette se met à diverger sans que personne
 * ne s'en aperçoive.
 *
 * D'où ce script, calqué sur `generer-theme.mjs` : une source unique, un
 * artefact versionné, un contrôle de fraîcheur qui échoue si les deux se
 * séparent. Le mode `--verifier` tourne dans `npm run verifier`.
 *
 * ## Pourquoi le favicon et l'icône ne montrent pas la même chose
 *
 * Le favicon est lu à 16 px dans un onglet. Une pièce d'or portant un « k »
 * sombre y devient une tache : deux formes concentriques sous 20 px ne se
 * distinguent plus. Il porte donc le « k » or directement sur la plaque
 * sombre — le dessin le plus simple qui reste lisible à cette taille.
 *
 * L'icône d'application est vue à 192 px et plus. Elle peut porter la marque
 * entière, pièce comprise, et c'est ce que le collecteur reconnaît depuis
 * l'intérieur de l'application.
 *
 * Constat du 2026-08-24 : les deux PNG livrés jusqu'ici étaient des carrés
 * verts unis, sans aucune marque. C'est l'unique surface de marque que le
 * collecteur regarde tous les jours.
 */

/** La hampe du « k » et son articulation — les mêmes tracés que `Logo.tsx`. */
const K_HAMPE = 'M32 22 V78';
const K_ARTICULATION = 'M74 22 L44 50 L74 78';

function k(couleur, largeur = 12) {
  return (
    `<g fill="none" stroke="${couleur}" stroke-width="${largeur}" ` +
    `stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${K_HAMPE}"/><path d="${K_ARTICULATION}"/></g>`
  );
}

/** Plaque sombre, « k » or. Lisible à 16 px, où la pièce ne le serait pas. */
export function faviconSvg() {
  return (
    `<!-- Fichier engendré par scripts/generer-marque.mjs — ne pas modifier à la main.\n` +
    `     La source est packages/core/src/tokens.ts. Relancer : npm run generer:marque -->\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Kolek">\n` +
    `  <rect width="100" height="100" rx="24" fill="${couleurs.sidebar}"/>\n` +
    `  <g transform="translate(50 50) scale(0.8) translate(-50 -50)">${k(couleurs.or)}</g>\n` +
    `</svg>\n`
  );
}

/**
 * Plaque sombre, pièce d'or, « k » sombre — la marque entière.
 *
 * La pièce occupe 68 % du carré. Android peut rogner une icône en cercle ou en
 * « squircle » selon le lanceur : au-delà de 80 %, l'or touche le bord et le
 * rognage mord dedans.
 */
export function iconeSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" rx="22" fill="${couleurs.sidebar}"/>` +
    `<g transform="translate(50 50) scale(0.68) translate(-50 -50)">` +
    `<circle cx="50" cy="50" r="50" fill="${couleurs.or}"/>${k(couleurs.sidebar)}</g>` +
    `</svg>`
  );
}

function pngIcone(taille) {
  return new Resvg(iconeSvg(), { fitTo: { mode: 'width', value: taille } })
    .render()
    .asPng();
}

/** Ce que chaque fichier doit contenir. Les SVG en texte, les PNG en octets. */
export function artefacts() {
  const favicon = Buffer.from(faviconSvg(), 'utf8');
  return [
    { chemin: 'apps/admin/public/favicon.svg', contenu: favicon },
    { chemin: 'apps/collecteur/public/favicon.svg', contenu: favicon },
    { chemin: 'apps/site/public/favicon.svg', contenu: favicon },
    { chemin: 'apps/collecteur/public/icone-192.png', contenu: pngIcone(192) },
    { chemin: 'apps/collecteur/public/icone-512.png', contenu: pngIcone(512) },
  ];
}

/**
 * Les fins de ligne ne comptent pas pour les SVG — voir la note de
 * `generer-theme.mjs` : Git les convertit en CRLF au `checkout` sous Windows,
 * et un garde-fou qui crie au loup finit par être ignoré. Les PNG, eux, sont
 * comparés octet à octet : ce sont des binaires, Git n'y touche pas.
 */
function normaliser(octets, binaire) {
  return binaire ? octets : Buffer.from(octets.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

export function fichiersPerimes() {
  const perimes = [];
  for (const { chemin, contenu } of artefacts()) {
    const binaire = chemin.endsWith('.png');
    let actuel;
    try {
      actuel = readFileSync(join(RACINE, chemin));
    } catch {
      perimes.push(chemin);
      continue;
    }
    if (!normaliser(actuel, binaire).equals(normaliser(contenu, binaire))) perimes.push(chemin);
  }
  return perimes;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--verifier')) {
    const perimes = fichiersPerimes();
    if (perimes.length === 0) {
      console.log('Le favicon et les icônes sont à jour.');
      process.exit(0);
    }
    console.error(
      `Ces fichiers ne correspondent plus à tokens.ts :\n  ${perimes.join('\n  ')}\n` +
        'Lance `npm run generer:marque` et rejoue le build.',
    );
    process.exit(1);
  }

  for (const { chemin, contenu } of artefacts()) {
    writeFileSync(join(RACINE, chemin), contenu);
    console.log(`engendré ${chemin}`);
  }
}

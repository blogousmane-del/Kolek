import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { couleurs } from '../packages/core/src/tokens.ts';

/**
 * Le blanc translucide ne descend pas sous le seuil AA.
 *
 * ## Le défaut que ce fichier empêche
 *
 * Les fonds sombres du produit — la barre latérale, l'en-tête immersif, l'écran
 * de connexion — portent leur texte en blanc atténué : `text-white/70` pour une
 * précision, `text-white/30` pour un intitulé de groupe. C'est une manière
 * commode de poser une hiérarchie sans inventer de jeton.
 *
 * Commode, et non vérifiée. Au 2026-09-16, `text-white/30` était employé quatre
 * fois, et il vaut **2,63:1** sur `sidebar`. Le seuil AA est 4,5:1 pour un texte
 * courant et 3:1 pour du grand texte : cette valeur échoue aux deux. Ce sont
 * les intitulés de groupe de la navigation, écrits en 12 px capitales — la
 * taille qui pardonne le moins, sur l'écran d'un collecteur qui travaille en
 * plein soleil.
 *
 * Le seuil ci-dessous est calculé, pas choisi : **55 % est la première dizaine
 * qui passe** sur le plus clair des trois fonds sombres.
 *
 * | Alpha | primary | sidebar | darkCanvas |
 * |-------|---------|---------|------------|
 * | 40 %  | 3,21    | 3,59    | 3,81       |
 * | 50 %  | 4,20    | 4,80    | 5,34       |
 * | 55 %  | 4,70    | 5,46    | 6,18       |
 *
 * ## Pourquoi il lit `tokens.ts` plutôt qu'une liste d'hexadécimaux
 *
 * Parce qu'un seuil recopié devient faux à la première retouche de palette, et
 * silencieusement. `primary` a déjà bougé ; `negative` et `mutedForeground` ont
 * été assombris en août précisément pour des raisons de contraste. Un contrôle
 * qui ne suit pas la source qu'il contrôle ne contrôle rien.
 *
 * ## Ce qu'il laisse passer, et pourquoi
 *
 * Une atténuation portée par un état **désactivé**. WCAG 1.4.3 exclut
 * explicitement le texte d'un composant d'interface inactif, et pour une bonne
 * raison : remonter un libellé désactivé au seuil du libellé actif le fait
 * cesser de se lire comme désactivé. On échangerait un défaut de contraste
 * contre un défaut de sens.
 *
 * La reconnaissance est textuelle — la ligne cite `disponible`, `disabled` ou
 * `aria-disabled` — et c'est une limite écrite plutôt que cachée.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const ARBRES = ['apps/admin/src', 'apps/collecteur/src', 'apps/site/src', 'packages/ui/src'];

/**
 * Les fonds sombres du produit.
 *
 * Trois, et c'est le plus clair qui décide : un blanc atténué qui tient sur
 * `primary` tient partout ailleurs. `degradeHero` va de `darkCanvas` à
 * `primary`, donc il est couvert par ses deux bornes.
 */
const FONDS_SOMBRES = ['primary', 'sidebar', 'darkCanvas'];

/** Seuil AA pour un texte courant. Le produit n'emploie pas ce motif sur des
    titres assez grands pour prétendre au seuil de 3:1. */
const SEUIL = 4.5;

/** Ce qui marque un composant inactif, exempté par WCAG 1.4.3. */
const INACTIF = /disponible|disabled|aria-disabled/;

const MOTIF = /text-white\/(\d{1,3})\b/g;

function canalLineaire(octet) {
  const c = octet / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, v, b]) {
  return 0.2126 * canalLineaire(r) + 0.7152 * canalLineaire(v) + 0.0722 * canalLineaire(b);
}

function versRvb(hex) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

/**
 * Le rapport de contraste d'un blanc à `alpha` pour cent sur un fond donné.
 *
 * Le blanc translucide est d'abord composé sur son fond — c'est ce que fait le
 * navigateur — puis comparé à ce même fond. Comparer le blanc pur au fond
 * donnerait un rapport flatteur et faux.
 */
export function contrasteBlanc(alpha, fondHex) {
  const fond = versRvb(fondHex);
  const part = alpha / 100;
  const compose = [255, 255, 255].map((c, i) => Math.round(c * part + fond[i] * (1 - part)));

  const l1 = luminance(compose);
  const l2 = luminance(fond);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Le plus clair des fonds sombres, celui qui décide. */
export function fondLePlusClair() {
  return FONDS_SOMBRES.map((nom) => ({ nom, hex: couleurs[nom] })).sort(
    (a, b) => luminance(versRvb(b.hex)) - luminance(versRvb(a.hex)),
  )[0];
}

function fichiers(dossier) {
  let entrees;
  try {
    entrees = readdirSync(dossier);
  } catch {
    return [];
  }
  return entrees.flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    if (!chemin.endsWith('.tsx')) return [];
    if (chemin.includes('.test.')) return [];
    return [chemin];
  });
}

/** Les fichiers que le contrôle lit. Exporté pour que le test puisse vérifier
    qu'il en trouve — un contrôle qui ne lit rien est vert pour rien. */
export function sources() {
  return ARBRES.flatMap((arbre) => fichiers(join(RACINE, arbre)));
}

function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '));
}

/** Les blancs atténués d'une source qui n'atteignent pas le seuil. */
export function chercherBlancsFaibles(source, chemin = '') {
  const propre = sansCommentaires(source);
  const lignes = propre.split('\n');
  const fond = fondLePlusClair();
  const trouves = [];

  lignes.forEach((ligne, rang) => {
    if (INACTIF.test(ligne)) return;

    MOTIF.lastIndex = 0;
    let coup;
    while ((coup = MOTIF.exec(ligne)) !== null) {
      const alpha = Number(coup[1]);
      const rapport = contrasteBlanc(alpha, fond.hex);
      if (rapport >= SEUIL) continue;

      trouves.push({
        chemin,
        ligne: rang + 1,
        classe: coup[0],
        fond: fond.nom,
        rapport: Math.round(rapport * 100) / 100,
      });
    }
  });

  return trouves;
}

/** Le premier alpha, de dix en dix, qui tient le seuil sur le fond décisif. */
export function alphaMinimum() {
  const fond = fondLePlusClair();
  for (let alpha = 5; alpha <= 100; alpha += 5) {
    if (contrasteBlanc(alpha, fond.hex) >= SEUIL) return alpha;
  }
  return 100;
}

/** Le même contrôle, sur l'ensemble du dépôt. */
export function chercherDansLeDepot() {
  return sources().flatMap((chemin) =>
    chercherBlancsFaibles(
      readFileSync(chemin, 'utf8'),
      relative(RACINE, chemin).replace(/\\/g, '/'),
    ),
  );
}

// Comparaison via `pathToFileURL` plutôt qu'un gabarit `file://${...}` : ce
// dernier échoue sous Windows et empêcherait le bloc CLI de s'exécuter, en
// silence. Même raison que dans `verifier-champs.mjs`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fautifs = chercherDansLeDepot();

  if (fautifs.length > 0) {
    console.error(`Blanc atténué sous le seuil AA (${SEUIL}:1) :`);
    for (const f of fautifs) {
      console.error(`  ${f.chemin}:${f.ligne} — ${f.classe} vaut ${f.rapport}:1 sur ${f.fond}`);
    }
    console.error(`\nPlancher : text-white/${alphaMinimum()}.`);
    console.error('Un état désactivé est exempté (WCAG 1.4.3) : la ligne doit le dire.');
    process.exit(1);
  }

  console.log(
    `Tous les blancs atténués tiennent ${SEUIL}:1 sur ${fondLePlusClair().nom}, le plus clair des fonds sombres.`,
  );
}

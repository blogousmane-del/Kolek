/**
 * L'exemple d'environnement de chaque application dit-il la vérité ?
 *
 *   node scripts/verifier-exemples-env.mjs      (npm run verifier:exemples-env)
 *
 * ## Pourquoi ce script existe
 *
 * `apps/site/.env.example` a manqué du 2026-08-23 au 2026-09-09, réclamé par
 * trois audits successifs. Pendant ce temps le README affirmait « aucun `.env` :
 * le site ne parle à aucune API », alors que la vitrine poste nom, téléphone,
 * courriel, zone, palier et mot de passe vers `demander-ouverture`, et que
 * `gardeEnv()` y est posé — il lève dans le hook `config`, qui s'exécute en
 * `dev` comme en `build`. Un clone neuf suivant le README à la lettre ne
 * démarrait pas, et rien dans le dépôt ne disait pourquoi.
 *
 * ## Ce qu'il compare
 *
 * Non pas la présence du fichier, mais l'**écart** entre ce que le code lit et
 * ce que l'exemple déclare. Un contrôle qui se contenterait d'exiger le fichier
 * serait vert le jour où quelqu'un ajoute une variable au code sans l'ajouter à
 * l'exemple — et ce jour-là coûte le même après-midi que l'absence, en se
 * soupçonnant moins vite.
 *
 * Seul le préfixe `VITE_` est examiné : c'est le seul que Vite compile dans le
 * paquet, donc le seul dont un poste de développement a besoin.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les variables `VITE_` qu'un texte lit. Triées, sans doublon. */
export function variablesUtilisees(texte) {
  return [...new Set(texte.match(/VITE_[A-Z0-9_]+/g) ?? [])].sort();
}

/** Les clés déclarées par un fichier d'exemple. Triées, sans doublon. */
export function variablesDeclarees(contenu) {
  const cles = contenu
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne && !ligne.startsWith('#'))
    .map((ligne) => ligne.split('=')[0].trim())
    .filter(Boolean);

  return [...new Set(cles)].sort();
}

/**
 * Les reproches pour une application.
 *
 * `declarees === null` signifie que le fichier est absent — distinct d'un
 * fichier présent mais vide, parce que c'est le défaut de 2026-08-23 et que le
 * message doit le nommer.
 */
export function reproches(app, utilisees, declarees) {
  if (declarees === null) {
    if (utilisees.length === 0) return [];
    return [
      `apps/${app}/.env.example est absent, alors que le code lit ${utilisees.join(', ')}. ` +
        'Un clone neuf ne peut pas démarrer cette application.',
    ];
  }

  const trouves = [];

  const manquantes = utilisees.filter((v) => !declarees.includes(v));
  if (manquantes.length > 0) {
    trouves.push(
      `apps/${app} lit ${manquantes.join(', ')}, que .env.example ne déclare pas.`,
    );
  }

  const mortes = declarees.filter((v) => !utilisees.includes(v));
  if (mortes.length > 0) {
    trouves.push(
      `apps/${app}/.env.example déclare ${mortes.join(', ')}, que plus personne ne lit.`,
    );
  }

  return trouves;
}

/** Tous les fichiers sous un dossier, récursivement. */
function fichiers(dossier) {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

/** Ce que l'application `app` lit, d'après sa source et sa configuration Vite. */
export function lireUtilisees(app) {
  const sources = [
    ...fichiers(join(RACINE, 'apps', app, 'src')),
    join(RACINE, 'apps', app, 'vite.config.ts'),
  ].filter((c) => existsSync(c) && statSync(c).isFile());

  return variablesUtilisees(sources.map((c) => readFileSync(c, 'utf8')).join('\n'));
}

/** Ce que l'exemple de `app` déclare, ou `null` s'il n'existe pas. */
export function lireDeclarees(app) {
  const chemin = join(RACINE, 'apps', app, '.env.example');
  if (!existsSync(chemin)) return null;
  return variablesDeclarees(readFileSync(chemin, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apps = readdirSync(join(RACINE, 'apps'));
  const tous = apps.flatMap((app) => reproches(app, lireUtilisees(app), lireDeclarees(app)));

  if (tous.length > 0) {
    console.error('Les exemples d’environnement ne disent pas la vérité :');
    for (const r of tous) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log(`Les ${apps.length} exemples d’environnement couvrent ce que le code lit.`);
}

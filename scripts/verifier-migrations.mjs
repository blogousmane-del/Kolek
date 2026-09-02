// La base distante porte-t-elle ce que le dépôt déclare ?
//
//   node scripts/verifier-migrations.mjs        (npm run verifier:migrations)
//
// Sortie non nulle dès qu'une migration versionnée n'est pas appliquée sur le
// projet lié, ou qu'une migration appliquée là-bas n'existe pas ici.
//
// ## Pourquoi ce script existe
//
// Le 2026-09-02, un collecteur a vu « Le serveur refuse ce montant » en ouvrant
// une carte à 25 000 FCFA. Le message était juste, l'application était juste :
// la base servait encore `check (mise between 500 and 10000)`, sept migrations
// en retard. Rien ne l'avait dit, et le canal de découverte a été un collecteur
// en tournée.
//
// Ce n'est pas la première fois. `verifier-en-ligne.mjs` porte en tête le récit
// du 2026-08-21 : trois sites servant une construction vieille de deux jours,
// un script qui répondait « conforme », et l'exploitant qui le remarque. La
// fraîcheur du front est mesurée depuis ce jour-là ; celle du schéma ne l'était
// par rien. Ce fichier ferme le même trou d'un cran plus bas.
//
// ## Ce qu'il ne fait pas
//
// Il ne compare pas le contenu des migrations, seulement leur présence. Une
// migration modifiée après avoir été appliquée reste invisible ici — c'est un
// geste qu'on ne fait pas, et le prétendre vérifié serait pire que se taire.

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'supabase/migrations');

/**
 * Le JSON, extrait d'une sortie qui n'est pas que du JSON.
 *
 * Le CLI écrit « Connecting to … » avant sa charge utile, et l'ordre de ces
 * lignes n'est pas contractuel. On prend la dernière ligne qui s'analyse et qui
 * porte `migrations` : chercher la première laisserait passer un jour où le CLI
 * annoncerait autre chose en JSON avant sa réponse.
 */
export function extraireJson(sortie) {
  const lignes = sortie.split('\n').map((l) => l.trim());

  for (const ligne of lignes.reverse()) {
    if (!ligne.startsWith('{')) continue;
    try {
      const objet = JSON.parse(ligne);
      if (Array.isArray(objet.migrations)) return objet;
    } catch {
      // Ligne non analysable : on continue vers la précédente.
    }
  }

  throw new Error(
    'Le CLI Supabase n’a pas rendu la liste attendue. Vérifie `npx supabase link`.',
  );
}

/** Le nom de fichier d'une migration, ou son horodatage seul s'il a disparu. */
function nommer(horodatage, fichiers) {
  return fichiers.find((f) => f.startsWith(`${horodatage}_`)) ?? horodatage;
}

/**
 * Le verdict, séparé de l'appel au CLI pour être testable sans réseau ni projet
 * lié — même raison que `correspond` dans `generer-paliers-edge.mjs`.
 */
export function analyser(charge, fichiers) {
  const manquantes = [];
  const inconnues = [];

  for (const { local, remote } of charge.migrations) {
    // `local` sans `remote` : versionnée ici, jamais appliquée là-bas. C'est le
    // cas qui casse une application déjà livrée.
    if (local && !remote) manquantes.push(nommer(local, fichiers));
    // `remote` sans `local` : appliquée là-bas, absente du dépôt. Plus rare et
    // plus grave — la base porte quelque chose que personne ne peut relire.
    if (remote && !local) inconnues.push(remote);
  }

  return { manquantes, inconnues };
}

function fichiersDeMigration() {
  return readdirSync(DOSSIER).filter((f) => f.endsWith('.sql'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let sortie;
  try {
    sortie = execFileSync(
      'npx',
      ['supabase', 'migration', 'list', '--linked', '--output-format', 'json'],
      { encoding: 'utf8', shell: process.platform === 'win32' },
    );
  } catch (erreur) {
    console.error('Impossible d’interroger le projet lié.');
    console.error(erreur.stdout ?? erreur.message);
    console.error('\nSi le projet n’est pas lié : npx supabase link --project-ref <ref>');
    process.exit(1);
  }

  const { manquantes, inconnues } = analyser(extraireJson(sortie), fichiersDeMigration());

  if (manquantes.length === 0 && inconnues.length === 0) {
    console.log('La base distante porte toutes les migrations du dépôt.');
    process.exit(0);
  }

  if (manquantes.length > 0) {
    console.error(
      `${manquantes.length} migration(s) versionnée(s) et non appliquée(s). ` +
        'Lance `npx supabase db push` AVANT de déployer les Edge Functions et les applications :',
    );
    for (const nom of manquantes) console.error(`  - ${nom}`);
  }

  if (inconnues.length > 0) {
    console.error(
      `\n${inconnues.length} migration(s) appliquée(s) sur le projet et absente(s) du dépôt. ` +
        'La base porte quelque chose que personne ne peut relire :',
    );
    for (const nom of inconnues) console.error(`  - ${nom}`);
  }

  process.exit(1);
}

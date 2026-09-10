/**
 * La production porte-t-elle une fonction privilégiée que le dépôt n'écrit pas ?
 *
 *   node scripts/verifier-derive.mjs        (npm run verifier:derive)
 *
 * Lecture seule. Une seule commande part vers la production :
 * `supabase db dump --linked --schema public`.
 *
 * ## Pourquoi ce script existe
 *
 * `verifier-migrations.mjs` compare la présence des migrations, et le dit en
 * tête : « Il ne compare pas le contenu ». Le 2026-09-09, il a rendu « aucune
 * migration inconnue » — ce qui était vrai — pendant que la production portait
 * `public.rls_auto_enable()`, une fonction `security definer` que le dépôt ne
 * crée nulle part.
 *
 * Elle n'a pas été trouvée par un contrôle mais par curiosité, en préparant une
 * poussée. Et elle comptait : la migration `20260909130000` referme les droits
 * `PUBLIC` sur **toutes** les fonctions `security definer` qu'elle trouve, sans
 * filtrer. Elle l'a donc touchée aussi, sans que rien en local ne l'annonce —
 * une base reconstruite depuis les migrations ne la contient pas.
 *
 * Le geste a été mesuré sans risque avant d'être fait. Mais « on a eu de la
 * chance de regarder » n'est pas une méthode.
 *
 * ## Ce qu'il compare, et pourquoi pas la base locale
 *
 * La production contre le **dépôt**, pas contre la base locale. Cette dernière
 * est reconstruite depuis les migrations : passer par elle reviendrait à
 * comparer le dépôt à la production via un intermédiaire qui peut lui-même
 * avoir dérivé, et une base de travail sale ferait crier le contrôle à tort.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne compare que les fonctions `security definer` — celles qui s'exécutent
 * avec les droits de leur propriétaire, donc les seules dont l'apparition
 * silencieuse change ce qu'un appelant peut faire. Les tables, vues et policies
 * relèvent d'un autre contrôle, et le prétendre couvert serait pire que se
 * taire.
 *
 * Il ne voit pas non plus les déclencheurs d'événement : aucun dump produit par
 * le CLI ne les rend.
 *
 * ## Ce qui a changé le 2026-09-10
 *
 * Cette limite a longtemps servi de conclusion : « c'est précisément pourquoi
 * `rls_auto_enable` n'a pas pu être adoptée dans une migration — on ne recopie
 * pas un câblage qu'on ne peut pas lire. » C'était vrai du **dump**, et faux du
 * reste. `supabase db query --linked` interroge `pg_event_trigger` directement,
 * et rend en une ligne le nom, l'événement, les étiquettes, l'état et le
 * propriétaire.
 *
 * `rls_auto_enable` et son déclencheur `ensure_rls` sont donc adoptés depuis le
 * 2026-09-10, migration `20260910090000`. La dérive que ce script signalait à
 * chaque passage est fermée.
 *
 * La limite du dump, elle, reste : ce script ne verra pas apparaître un
 * **prochain** déclencheur d'événement. La lecture qui le montrerait existe —
 * elle demande simplement une requête plutôt qu'un dump, et personne ne l'a
 * encore câblée ici.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(RACINE, 'supabase/migrations');

/**
 * Les fonctions `security definer` d'un dump `pg_dump`.
 *
 * Le corps est borné au `CREATE` suivant : chercher `SECURITY DEFINER` n'importe
 * où après un `CREATE FUNCTION` attribuerait la mention de la fonction suivante
 * à la précédente. Un test tient ce cas.
 */
export function definersDuDump(sql) {
  return extraire(sql, /CREATE (?:OR REPLACE )?FUNCTION\s+"?public"?\."?([^"(\s]+)"?/gi);
}

/** Les fonctions `security definer` écrites dans les migrations du dépôt. */
export function definersDuDepot(sql) {
  return extraire(sql, /create (?:or replace )?function\s+"?public"?\."?([^"(\s]+)"?/gi);
}

function extraire(sql, motif) {
  const trouves = [];
  const debuts = [...sql.matchAll(motif)];

  for (let i = 0; i < debuts.length; i += 1) {
    const debut = debuts[i].index;
    const fin = i + 1 < debuts.length ? debuts[i + 1].index : sql.length;
    // L'en-tête seule : au-delà du corps, `SECURITY DEFINER` peut apparaître
    // dans un commentaire ou dans un `revoke` sans concerner la déclaration.
    const entete = sql.slice(debut, fin).split(/AS\s+\$/i)[0];
    if (/SECURITY\s+DEFINER/i.test(entete)) trouves.push(debuts[i][1]);
  }

  return [...new Set(trouves)].sort();
}

/**
 * Les reproches. Vide = la production ne porte rien que le dépôt ignore.
 *
 * Le sens unique est voulu : une fonction du dépôt absente de la production est
 * une migration non déployée, pas une dérive, et `verifier:migrations` le dit
 * déjà. Deux alertes pour un fait finissent par être ignorées toutes les deux.
 */
export function comparer(enProduction, dansLeDepot) {
  const connues = new Set(dansLeDepot);
  const orphelines = enProduction.filter((f) => !connues.has(f));

  if (orphelines.length === 0) return [];

  return orphelines.map(
    (f) =>
      `public.${f}() est security definer en production et n'est créée par aucune migration. ` +
      'Toute passe qui balaie les definers la touchera sans que rien en local ne l’annonce.',
  );
}

/** Le texte de toutes les migrations versionnées, concaténé. */
export function sourceDesMigrations() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cible = join(mkdtempSync(join(tmpdir(), 'kolek-derive-')), 'prod.sql');

  try {
    execFileSync(
      'npx',
      ['supabase', 'db', 'dump', '--linked', '--schema', 'public', '-f', cible],
      { encoding: 'utf8', shell: process.platform === 'win32', stdio: 'pipe' },
    );
  } catch (erreur) {
    console.error('Impossible d’extraire le schéma du projet lié.');
    console.error(erreur.stdout ?? erreur.message);
    console.error('\nSi le projet n’est pas lié : npx supabase link --project-ref <ref>');
    process.exit(1);
  }

  const enProduction = definersDuDump(readFileSync(cible, 'utf8'));
  const dansLeDepot = definersDuDepot(sourceDesMigrations());
  const reproches = comparer(enProduction, dansLeDepot);

  console.log(
    `${enProduction.length} fonctions security definer en production, ` +
      `${dansLeDepot.length} écrites dans les migrations.`,
  );

  if (reproches.length > 0) {
    console.error('\nDérive :');
    for (const r of reproches) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log('Aucune fonction privilégiée en production que le dépôt ignore.');
}

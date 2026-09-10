/**
 * Chaque Edge Function vérifie-t-elle encore son appelant ?
 *
 *   node scripts/verifier-portillons.mjs        (npm run verifier:portillons)
 *
 * ## Pourquoi ce script existe
 *
 * C'est le contrôle n°6 des vingt — « autorisation côté serveur » — et le seul
 * que les audits successifs ont dû **recompter à la main** à chaque passage :
 * « 16 fonctions détiennent la clé de service, 14 vérifient leur appelant »
 * (2026-09-04), puis dix-neuf fonctions le 2026-09-10. Un nombre recompté à la
 * main dans un document est un nombre qui périme entre deux audits.
 *
 * Le dépôt est passé de 13 à 19 fonctions en trois semaines. La question n'est
 * pas de savoir si elles sont toutes gardées aujourd'hui — elles le sont, c'est
 * mesuré — mais si la vingtième le sera.
 *
 * ## Extraire puis comparer, et non chercher une présence
 *
 * Le 🟠 n°1 de l'audit du 2026-09-09 a appris ceci : un contrôle qui **cherche**
 * un motif dans une source passe au vert sur le défaut même qu'il doit voir —
 * l'import de `gardeEnv` était bien là, c'est le greffon qui manquait.
 *
 * Ce script ne demande donc pas « y a-t-il un contrôle quelque part ». Il
 * **extrait** la nature du portillon de chaque fonction et la compare à une
 * table déclarée ici. Trois choses le font échouer :
 *
 * 1. une fonction du disque absente de la table — une nouveauté que personne
 *    n'a classée ;
 * 2. une fonction dont le portillon réel diffère de celui déclaré — un contrôle
 *    retiré, ou changé de nature sans que la table suive ;
 * 3. un portillon `super-admin` appelé sans que son refus soit honoré.
 *
 * Le point 3 est le seul qui regarde la **structure** et non les marqueurs :
 * `ouvrir()` rend une `Response` quand la porte reste fermée, et une fonction
 * qui l'appellerait sans faire `if (… instanceof Response) return …` sortirait
 * la clé de service à un inconnu. L'import serait pourtant bien là.
 *
 * ## Ce que ce script ne sait pas faire
 *
 * Il lit du texte, pas un arbre syntaxique. Une fonction qui **nommerait**
 * `est_admin` dans un commentaire sans l'appeler serait classée `admin` à tort.
 * Ce n'est pas le cas aujourd'hui — les dix-neuf sont vérifiées une à une — et
 * l'erreur va dans le sens rassurant, ce qui est le mauvais sens.
 *
 * Il ne remplace donc pas les épreuves de bout en bout : `portillons-admin.test.ts`
 * appelle les sept fonctions `admin-*` par HTTP et mesure ce qu'elles répondent
 * à un jeton absent, expiré ou non administrateur. Ce script-ci sert à autre
 * chose — voir arriver la **vingtième** fonction, celle que personne n'a encore
 * pensé à éprouver.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'supabase/functions');

/**
 * Ce que chaque fonction présente comme portillon, et pourquoi.
 *
 * `session` — la fonction lit l'identité du porteur du jeton et refuse sans.
 * `admin` / `super-admin` — elle redemande le rôle à la base, avec le jeton de
 * l'appelant, **avant** de sortir la clé de service.
 * `secret-partage` — elle n'a pas d'appelant humain : `pg_cron` pour l'une, le
 * fournisseur de paiement pour l'autre. Un secret dédié, comparé en temps
 * constant, tient lieu d'identité.
 * `debit-public` — publique par construction : un visiteur qui découvre Kolek
 * et quelqu'un qui a oublié son mot de passe n'ont, par définition, pas de
 * session. `consommer_debit` borne l'abus à défaut de pouvoir identifier.
 */
export const PORTILLONS = {
  'abonnement-payer': 'session',
  'abonnement-verifier': 'session',
  'admin-avis': 'admin',
  'admin-creer-collecteur': 'admin',
  'admin-demandes': 'admin',
  'admin-modifier-collecteur': 'admin',
  'admin-reglages': 'admin',
  'admin-supprimer-collecteur': 'admin',
  'admin-vue-globale': 'admin',
  'chariow-webhook': 'secret-partage',
  'collecteur-cloturer-carte': 'session',
  'collecteur-creer-collaborateur': 'session',
  'collecteur-encaisser-pour': 'session',
  'demander-ouverture': 'debit-public',
  'envoyer-avis': 'secret-partage',
  'mot-de-passe-oublie': 'debit-public',
  'super-admin-action': 'super-admin',
  'super-admin-etat': 'super-admin',
  'super-admin-journal': 'super-admin',
};

/**
 * La nature du portillon que cette source présente réellement.
 *
 * L'ordre des tests est celui de la force : une fonction qui redemande
 * `est_super_admin` **et** lit `getUser()` est classée `super-admin`, parce que
 * c'est la vérification qui décide. Rend `aucun` quand rien ne garde la porte.
 */
export function portillonDe(source) {
  if (source.includes('est_super_admin') || source.includes('portillon-super-admin')) {
    return 'super-admin';
  }
  if (source.includes('est_admin')) return 'admin';
  if (source.includes('secretValide')) return 'secret-partage';
  if (source.includes('getUser()')) return 'session';
  if (source.includes('consommer_debit')) return 'debit-public';
  return 'aucun';
}

/**
 * Le refus du portillon super-admin est-il honoré ?
 *
 * `ouvrir()` rend soit une ouverture, soit la `Response` qui referme. Appeler
 * la première sans traiter la seconde laisserait la clé de service sortir pour
 * un inconnu — et l'import, lui, serait bien présent. C'est le seul contrôle de
 * **structure** de ce script, et il existe parce que le défaut qu'il vise est
 * précisément celui qu'une recherche de motif ne voit pas.
 */
export function refusHonore(source) {
  if (!source.includes('ouvrir(')) return true;
  return /instanceof Response\)\s*return/.test(source);
}

/** Les fonctions présentes sur le disque, dans l'ordre alphabétique. */
export function fonctionsDuDisque(dossier = DOSSIER) {
  return readdirSync(dossier)
    .filter((nom) => !nom.startsWith('_'))
    .filter((nom) => statSync(join(dossier, nom)).isDirectory())
    .filter((nom) => {
      try {
        return statSync(join(dossier, nom, 'index.ts')).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Les reproches. Vide = chaque fonction garde sa porte comme déclaré.
 *
 * @param sources `{ nom: source }` — le contenu de chaque `index.ts`.
 * @param declares La table attendue, `{ nom: portillon }`.
 */
export function reproches(sources, declares = PORTILLONS) {
  const trouves = [];

  for (const nom of Object.keys(sources).sort()) {
    const source = sources[nom];
    const reel = portillonDe(source);
    const attendu = declares[nom];

    if (attendu === undefined) {
      trouves.push(
        `${nom} n'est pas dans la table des portillons. Une fonction neuve doit ` +
          `y être classée — son portillon réel semble être « ${reel} ».`,
      );
      continue;
    }

    if (reel === 'aucun') {
      trouves.push(
        `${nom} ne vérifie plus rien : ni identité, ni rôle, ni secret partagé, ` +
          `ni débit public. Elle était déclarée « ${attendu} ».`,
      );
      continue;
    }

    if (reel !== attendu) {
      trouves.push(
        `${nom} présente le portillon « ${reel} », alors que la table dit ` +
          `« ${attendu} ». Si le changement est voulu, la table doit suivre.`,
      );
      continue;
    }

    if (!refusHonore(source)) {
      trouves.push(
        `${nom} appelle ouvrir() sans traiter son refus. La clé de service ` +
          `sortirait pour un appelant que le portillon a recalé.`,
      );
    }
  }

  for (const nom of Object.keys(declares).sort()) {
    if (sources[nom] === undefined) {
      trouves.push(
        `${nom} est déclarée dans la table mais absente du disque. Une fonction ` +
          `supprimée doit quitter la table, sinon elle masque la suivante.`,
      );
    }
  }

  return trouves;
}

/** Lit le disque et rend `{ nom: source }`. */
export function lireSources(dossier = DOSSIER) {
  const sources = {};
  for (const nom of fonctionsDuDisque(dossier)) {
    sources[nom] = readFileSync(join(dossier, nom, 'index.ts'), 'utf8');
  }
  return sources;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sources = lireSources();
  const trouves = reproches(sources);

  if (trouves.length > 0) {
    console.error('Des Edge Functions ne gardent plus leur porte comme déclaré :');
    for (const r of trouves) console.error(`  ${r}`);
    process.exit(1);
  }

  const nombre = Object.keys(sources).length;
  console.log(`Les ${nombre} Edge Functions vérifient leur appelant comme déclaré.`);
}

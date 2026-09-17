import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Un seul jeu de rayons dans les applications.
 *
 * ## Le défaut que ce fichier empêche
 *
 * `packages/core/src/tokens.ts` donne un tableau de rôles, et il est explicite :
 *
 * | Jeton  | Valeur | Rôle                                                   |
 * |--------|--------|--------------------------------------------------------|
 * | `lg`   | 10 px  | Carte d'application (`Carte`, `CarteStat`, `CarteZone`)  |
 * | `xl`   | 12 px  | Carte mise en avant, élément d'un panneau                |
 * | `2xl`  | 20 px  | Artefact et carte interne **de la vitrine**              |
 * | `3xl`  | 32 px  | Grande surface éditoriale **de la vitrine**              |
 *
 * `Carte.tsx` tenait la règle. Les écrans, non : au 2026-09-16, les deux
 * applications portaient vingt-sept `rounded-2xl` ou `rounded-3xl`. Sur
 * l'accueil du collecteur, le résumé du jour (20 px) touchait donc une carte de
 * collecte (10 px), dans le même défilement, à deux centimètres d'écart.
 *
 * Le §7 des interdits du Design System dit la même chose en une ligne : **« ne
 * jamais mélanger plusieurs jeux de rayons »**. Deux langages de forme dans un
 * même écran est ce qu'un œil lit comme « fait par morceaux », avant même
 * d'avoir lu un mot.
 *
 * ## Pourquoi un contrôle de source, et pas un test d'interface
 *
 * Parce qu'aucun test ne peut le voir. jsdom n'a pas de disposition, donc aucun
 * `border-radius` n'y est calculé ; et à la relecture d'un seul fichier, un
 * `rounded-2xl` paraît parfaitement raisonnable. Le défaut n'existe qu'entre
 * deux fichiers, à l'écran, et c'est exactement le genre de chose qu'une revue
 * ne rattrape jamais.
 *
 * ## Ce qu'il refuse, exactement
 *
 * Toute classe de rayon dont le cran est `2xl` ou `3xl`, y compris coiffée
 * d'une variante (`lg:rounded-3xl`, `sm:rounded-2xl`) ou bornée à un côté
 * (`rounded-t-2xl`). La vitrine en est exclue : ces deux crans sont à elle, le
 * tableau de rôles le dit.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Les arbres soumis au contrôle.
 *
 * `apps/site` en est absent, et c'est le cœur du contrôle plutôt qu'un oubli :
 * `2xl` et `3xl` existent **pour** la vitrine. Les lui interdire reviendrait à
 * supprimer deux crans de l'échelle au lieu d'en border l'usage.
 */
const ARBRES = ['apps/admin/src', 'apps/collecteur/src', 'packages/ui/src'];

/** Les crans réservés à la vitrine. */
const CRANS_VITRINE = ['2xl', '3xl'];

/**
 * Ce qui compte comme une classe de rayon.
 *
 * Trois formes à couvrir, et les trois sont présentes dans le dépôt :
 *
 *   rounded-2xl          le cas nu
 *   lg:rounded-3xl       coiffé d'une variante de point de rupture
 *   rounded-t-2xl        borné à un côté (la feuille du bas)
 *
 * Le préfixe de variante est volontairement large — `lg:`, `sm:`, `hover:`,
 * `@max-[240px]:` — parce que le dépôt en porte de toutes ces formes et qu'un
 * rayon caché derrière une variante reste un rayon.
 */
const MOTIF = /(?:[\w@[\]().%-]+:)*rounded(?:-[trblse]{1,2})?-(2xl|3xl)\b/g;

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

/**
 * Retire les commentaires avant la lecture.
 *
 * Sans ça, ce fichier-ci se signalerait lui-même : le tableau de rôles ci-dessus
 * cite `2xl` et `3xl`, et les commentaires des écrans expliquent parfois
 * pourquoi tel rayon a été choisi. Un garde-fou qui crie sur sa propre
 * documentation finit désarmé dans la semaine.
 */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '));
}

/** Les rayons de vitrine trouvés dans une source. */
export function chercherRayonsVitrine(source, chemin = '') {
  const propre = sansCommentaires(source);
  const trouves = [];

  MOTIF.lastIndex = 0;
  let coup;
  while ((coup = MOTIF.exec(propre)) !== null) {
    trouves.push({
      chemin,
      ligne: propre.slice(0, coup.index).split('\n').length,
      classe: coup[0],
      cran: coup[1],
    });
  }
  return trouves;
}

/** Le même contrôle, sur l'ensemble du dépôt. */
export function chercherDansLeDepot() {
  return sources().flatMap((chemin) =>
    chercherRayonsVitrine(
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
    console.error('Rayon de vitrine dans une application — deux jeux de formes à l’écran :');
    for (const f of fautifs) {
      console.error(`  ${f.chemin}:${f.ligne} — ${f.classe}`);
    }
    console.error(
      '\nCarte d’application : « rounded-lg » (10 px). Bloc mis en avant : « rounded-xl » (12 px).',
    );
    console.error('Tableau des rôles : packages/core/src/tokens.ts.');
    process.exit(1);
  }

  console.log(`Les ${sources().length} composants des applications tiennent un seul jeu de rayons.`);
}

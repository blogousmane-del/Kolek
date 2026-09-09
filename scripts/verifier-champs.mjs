import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Aucun champ de saisie sous 16 px.
 *
 * ## Le défaut que ce fichier empêche
 *
 * Safari sur iPhone zoome la page dès qu'on touche un champ dont la police
 * calculée passe sous 16 px. Le champ grossit, la page déborde, et le
 * collecteur doit pincer pour ressortir — au milieu d'un geste qu'il fait
 * cinquante fois par jour, debout, à une main, sur un marché.
 *
 * Il n'y a pas d'attribut pour le désactiver. La seule autre porte de sortie
 * est `maximum-scale=1` dans le `viewport`, qui supprime le zoom manuel de
 * l'écran entier : on échangerait un agacement contre un défaut
 * d'accessibilité, et les trois `index.html` ont raison de ne pas le porter.
 *
 * ## Pourquoi un contrôle de source, et pas un test d'interface
 *
 * Parce que le défaut est invisible là où on écrit le code. Un champ en 13 px
 * se lit très bien sur un écran de bureau ; jsdom n'a pas de disposition, donc
 * aucun test de composant ne mesure quoi que ce soit ; et le seul endroit où
 * ça se voit est un téléphone qu'on n'a pas sous la main au moment de la
 * revue. Les trois applications sont concernées — l'admin aussi, qui porte un
 * tiroir `lg:hidden` et se consulte donc au téléphone.
 *
 * ## Ce qu'il refuse, exactement
 *
 * Une balise `input`, `textarea` ou `select` dont la liste de classes déclare
 * `text-xs`, `text-sm` ou `text-base` — les trois seules tailles de l'échelle
 * sous 16 px. Il ne demande pas `text-champ` : `text-lg` et au-delà sont déjà
 * au-dessus du seuil, et un champ de montant en `text-2xl` n'a rien à corriger.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les arbres qui portent des composants. Les tests en sont exclus : ils
    écrivent parfois du balisage fautif exprès, pour vérifier ce contrôle. */
const ARBRES = [
  'apps/admin/src',
  'apps/collecteur/src',
  'apps/site/src',
  'packages/ui/src',
];

/** Les tailles de l'échelle qui tombent sous le seuil. `text-champ` vaut
    16 px, `text-lg` aussi, et tout ce qui suit est plus grand. */
const TROP_PETITES = ['text-xs', 'text-sm', 'text-base'];

/**
 * Ce qui compte comme une taille déclarée.
 *
 * La liste est explicite, et elle doit l'être : `text-ink` et
 * `text-muted-foreground` commencent eux aussi par `text-`. Les prendre pour
 * des tailles déclarerait conforme un champ qui n'en porte aucune — le trou
 * exact que ce garde-fou vient de fermer.
 */
const TAILLES = [
  ...TROP_PETITES,
  'text-champ',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl',
  'text-7xl',
  'text-8xl',
];

const SEUIL_PX = 16;

const BALISES = ['input', 'textarea', 'select'];

/**
 * Les types d'`input` qui ne reçoivent aucune saisie.
 *
 * iOS ne zoome pas dessus, et leur imposer 16 px de police n'aurait aucun
 * sens : c'est leur taille de boîte qui compte, pas leur police.
 */
const SANS_SAISIE = ['checkbox', 'radio', 'hidden', 'range', 'color', 'file', 'submit', 'button'];

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
 * Rend l'indice du `>` qui ferme la balise ouvrante commencée à `debut`.
 *
 * Compter les accolades est indispensable, et ce n'est pas une précaution
 * théorique : le premier `>` d'un champ ordinaire appartient presque toujours
 * à la flèche de son `onChange`.
 *
 *     <input
 *       onChange={(e) => onChange(e.target.value)}   ← ce `>`-là
 *       className="text-base"
 *     />
 *
 * S'arrêter dessus, c'est ne jamais lire `className`, donc rendre vert tout
 * champ dont le gestionnaire précède la classe — c'est-à-dire presque tous.
 * La première version de ce fichier faisait exactement ça et déclarait le
 * dépôt conforme alors que douze champs ne l'étaient pas.
 */
function finDeBalise(source, debut) {
  let profondeur = 0;
  let guillemet = null;

  for (let i = debut; i < source.length; i += 1) {
    const c = source[i];
    const suivant = source[i + 1];

    // Dans une chaîne, rien ne compte — ni les accolades, ni le `>` d'une
    // invite comme `placeholder="a > b"`.
    if (guillemet) {
      if (c === '\\') i += 1;
      else if (c === guillemet) guillemet = null;
      continue;
    }

    // Les commentaires non plus, et ce n'est pas une précaution théorique : une
    // apostrophe française — « croix d'effacement », « l'iPhone » — ouvrirait
    // une chaîne qui avale la suite de la balise, `className` compris. Les
    // balises de ce dépôt en portent.
    if (c === '/' && suivant === '/') {
      const fin = source.indexOf('\n', i);
      i = fin === -1 ? source.length : fin;
      continue;
    }
    if (c === '/' && suivant === '*') {
      const fin = source.indexOf('*/', i + 2);
      i = fin === -1 ? source.length : fin + 1;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') guillemet = c;
    else if (c === '{') profondeur += 1;
    else if (c === '}') profondeur -= 1;
    else if (c === '>' && profondeur === 0) return i;
  }
  return source.length;
}

/**
 * Les constantes de classes du fichier, par nom.
 *
 * Sans elles, le contrôle a un angle mort de la taille d'un formulaire : la
 * vitrine range les classes de ses sept champs dans un seul `CHAMP_SOMBRE`, et
 * une lecture bornée à la balise les déclarait tous conformes. La page qui
 * demande un mot de passe zoomait donc sur chacun de ses champs, sans que rien
 * ne le dise.
 *
 * Seules les constantes dont la valeur est une chaîne littérale sont suivies —
 * on lit du texte, on n'exécute rien. Une classe calculée à l'exécution reste
 * hors de portée, et c'est une limite écrite plutôt que cachée.
 */
function constantesDeClasses(source) {
  const table = new Map();
  const motif = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(['"`])([\s\S]*?)\2/g;

  let coup;
  while ((coup = motif.exec(source)) !== null) {
    table.set(coup[1], coup[3]);
  }
  return table;
}

/**
 * Repère chaque champ et la taille qu'il déclare.
 *
 * La lecture est bornée à la balise ouvrante : sans cette borne, le `text-sm`
 * d'une étiquette voisine serait imputé au champ, le contrôle crierait au
 * loup, et un garde-fou qui crie au loup finit désarmé. Les constantes que la
 * balise cite sont dépliées dans cette borne.
 *
 * Une taille écrite dans une branche `? :` compte comme déclarée — c'est le
 * comportement voulu, puisqu'elle peut s'appliquer.
 */
export function champs(source, chemin = '') {
  const trouves = [];
  const constantes = constantesDeClasses(source);
  const ouverture = new RegExp(`<(${BALISES.join('|')})[\\s>]`, 'g');

  let coup;
  while ((coup = ouverture.exec(source)) !== null) {
    const balise = coup[1];
    const corps = source.slice(coup.index, finDeBalise(source, coup.index));
    const ligne = source.slice(0, coup.index).split('\n').length;

    let texte = corps;
    for (const [nom, valeur] of constantes) {
      if (new RegExp(`\\b${nom}\\b`).test(corps)) texte += ` ${valeur}`;
    }

    const tailles = texte.match(/\btext-[a-z0-9[\]#.%-]+/g) ?? [];
    const type = corps.match(/type=["']([a-z]+)["']/)?.[1] ?? null;
    trouves.push({ chemin, ligne, balise, tailles, type });
  }

  return trouves;
}

/** La taille en pixels d'une classe arbitraire `text-[14px]`, ou `null`. */
function pixelsArbitraires(classe) {
  const px = classe.match(/^text-\[(\d+(?:\.\d+)?)px\]$/);
  return px ? Number.parseFloat(px[1]) : null;
}

/** Tous les champs du dépôt. Exporté pour le contrôle du contrôle. */
export function tousLesChamps() {
  return sources().flatMap((chemin) =>
    champs(readFileSync(chemin, 'utf8'), relative(RACINE, chemin).replace(/\\/g, '/')),
  );
}

/**
 * Les champs d'une source qui n'atteignent pas 16 px.
 *
 * Deux fautes, et la seconde est la plus discrète : **ne rien déclarer du
 * tout**. Un champ sans classe de taille n'hérite pas d'une valeur neutre — la
 * préflight de Tailwind lui pose `font: inherit`, donc les 15 px du corps de
 * texte, donc le zoom. Il est aussi fautif qu'un champ en `text-sm`, et la
 * première version de ce contrôle le laissait passer.
 */
export function chercherChampsTropPetits(source, chemin = '') {
  return champs(source, chemin).flatMap((champ) => {
    if (champ.type !== null && SANS_SAISIE.includes(champ.type)) return [];

    const declarees = champ.tailles.filter(
      (taille) => TAILLES.includes(taille) || pixelsArbitraires(taille) !== null,
    );

    const fautive =
      declarees.find(
        (taille) =>
          TROP_PETITES.includes(taille) ||
          (pixelsArbitraires(taille) !== null && pixelsArbitraires(taille) < SEUIL_PX),
      ) ?? (declarees.length === 0 ? 'aucune' : null);

    if (!fautive) return [];
    return [{ chemin: champ.chemin, ligne: champ.ligne, balise: champ.balise, taille: fautive }];
  });
}

/** Le même contrôle, sur l'ensemble du dépôt. */
export function chercherDansLeDepot() {
  return sources().flatMap((chemin) =>
    chercherChampsTropPetits(
      readFileSync(chemin, 'utf8'),
      relative(RACINE, chemin).replace(/\\/g, '/'),
    ),
  );
}

// Comparaison via `pathToFileURL` plutôt qu'un gabarit `file://${...}` : ce
// dernier échoue sous Windows et empêcherait le bloc CLI de s'exécuter, en
// silence. Même raison que dans `verifier-bundles.mjs`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fautifs = chercherDansLeDepot();

  if (fautifs.length > 0) {
    console.error('Champ sous 16 px — iOS zoomera la page au premier toucher :');
    for (const f of fautifs) {
      console.error(`  ${f.chemin}:${f.ligne} — <${f.balise}> porte ${f.taille}`);
    }
    console.error('\nRemplacer par « text-champ » (16 px, packages/core/src/tokens.ts).');
    process.exit(1);
  }

  console.log(`Les ${tousLesChamps().length} champs du dépôt tiennent les 16 px.`);
}

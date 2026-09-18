/**
 * Trois fautes que seule une lecture des sources attrape.
 *
 * 1. L'ancienne adresse personnelle qui reparaît — par un copier-coller, ou
 *    par une branche qui n'avait pas la correction.
 * 2. Un numéro ARTCI cité alors qu'aucune autorisation n'a été délivrée. Une
 *    fausse mention dans un texte juridique est pire que son absence.
 * 3. Un champ d'identité requis (jamais typé `| Trou` dans l'interface
 *    `Identite`) qui vaut `null` : ce n'est pas un trou à afficher, c'est une
 *    régression du typage — le code a dérivé de son propre contrat.
 *
 * Le marqueur des trous, lui, n'est PAS une faute au sens de cette garde : il
 * est là pour être vu. C'est l'exploitant qui décide quand publier, pas ce
 * script. Il les compte, les NOMME, et ne fait jamais échouer dessus.
 */
import { globSync, readFileSync } from 'node:fs';

// Un segment de chemin entier, pas une sous-chaîne : `distribution.ts`
// resterait lu, seul un vrai dossier `node_modules/` ou `dist/` est écarté.
// `exclude` évite en plus à `globSync` de descendre dans les `node_modules`
// de chaque espace de travail avant qu'on les rejette.
const EXCLUSIONS = ['**/node_modules/**', '**/dist/**'];

// Quatre motifs plutôt qu'une expansion d'accolades : `fs.globSync` ne la
// garantit pas. Chacun a SON témoin, pas une somme : un plancher sur le total
// laisserait les deux motifs `.ts` couvrir pour des `.tsx` cassés — exactement
// ce qui s'est produit ici, alors que les trois pages légales que cette garde
// protège sont toutes des `.tsx`.
const MOTIFS = {
  'apps/**/*.ts': globSync('apps/**/*.ts', { exclude: EXCLUSIONS }),
  'apps/**/*.tsx': globSync('apps/**/*.tsx', { exclude: EXCLUSIONS }),
  'packages/**/*.ts': globSync('packages/**/*.ts', { exclude: EXCLUSIONS }),
  'packages/**/*.tsx': globSync('packages/**/*.tsx', { exclude: EXCLUSIONS }),
};

for (const [motif, resultat] of Object.entries(MOTIFS)) {
  if (resultat.length === 0) {
    console.error(`Le motif ${motif} n'a trouvé aucun fichier : il est cassé.`);
    process.exit(1);
  }
}

const sources = Object.values(MOTIFS).flat();

const fautes = [];
for (const fichier of sources) {
  const texte = readFileSync(fichier, 'utf8');
  if (/gsmtechnoloy@gmail\.com/.test(texte)) {
    fautes.push(`${fichier} : adresse personnelle, remplacer par contact@kolek.cash`);
  }
  if (/ARTCI\s*:?\s*(?:num[ée]ro|n[°o])\s*\d/i.test(texte)) {
    fautes.push(`${fichier} : cite un numéro ARTCI, or aucune autorisation n'existe`);
  }
}

if (fautes.length > 0) {
  console.error(fautes.join('\n'));
  process.exit(1);
}
console.log(`Les ${sources.length} sources ne citent ni adresse personnelle ni numéro ARTCI.`);

// Le marqueur des trous, en dur comme l'adresse personnelle et le numéro
// ARTCI ci-dessus : ce script lit du texte brut, il n'exécute et n'importe
// aucun module — importer `identite.ts` depuis un `.mjs` lancé par
// `node scripts/verifier-mentions.mjs` demanderait un chargeur TypeScript
// que ce script n'a pas. Même raison plus bas pour lire l'objet `IDENTITE`
// et l'interface `Identite` à coups d'expressions régulières plutôt que d'un
// vrai analyseur TypeScript.
const MARQUEUR_TROU = 'À COMPLÉTER';

/** Le compte des marqueurs dans un texte. Fonction à part, et non recopiée
    dans la boucle ci-dessous : c'est elle que le témoin qui suit éprouve, pas
    une copie qui pourrait diverger sans que le témoin s'en aperçoive. */
function compterTrous(texte) {
  return texte.split(MARQUEUR_TROU).length - 1;
}

// Garde-fou du garde-fou : si `compterTrous` cesse de trouver un marqueur
// qu'on sait présent, mieux vaut le crier ici que rendre zéro trou en
// silence sur tout le dépôt — même raison que la garde sur un motif de
// fichiers vide, plus haut. Il éprouve la fonction que la boucle appelle
// vraiment, pas un calcul séparé qui pourrait rester vert pendant qu'elle
// casse.
const TEMOIN = `Champ : ${MARQUEUR_TROU} : numéro de téléphone`;
if (compterTrous(TEMOIN) !== 1) {
  console.error('Le comptage des trous est cassé : il ne trouve pas son propre témoin.');
  process.exit(1);
}

// --- Champs d'identité nommés ---------------------------------------------
//
// Compter les occurrences du marqueur ne dit rien de CE QUI manque : si
// l'exploitant remplissait tous les champs demain, un compte par occurrence
// resterait inchangé partout où le marqueur ne sert pas de valeur de champ.
// Ce que l'exploitant doit lire, c'est le nom des champs de `IDENTITE` qui
// valent encore `null` — pas un nombre.
//
// Deux extractions, chacune sur son bloc de texte :
//  - l'interface `Identite`, pour savoir quels champs ont le droit d'être un
//    trou (`| Trou` dans leur type) ;
//  - l'objet `IDENTITE`, pour savoir lesquels le sont réellement (`null`).
// Les deux doivent nommer exactement les mêmes champs : sinon, soit le
// fichier a dérivé de son propre type (auquel cas `tsc` l'aurait refusé),
// soit — bien plus probable — l'une des deux extractions ci-dessous s'est
// cassée sur un fichier qui a changé de forme. Dans les deux cas, ce n'est
// pas un trou à afficher : c'est une raison d'échouer bruyamment plutôt que
// de rendre « aucun trou » en silence.

/** Les champs déclarés par `export interface Identite { ... }`, chacun avec
    son nom et si son type autorise un trou (porte `Trou` dans son union). */
function extraireChampsInterface(texte) {
  const bloc = texte.match(/export interface Identite \{([\s\S]*?)\n\}/);
  if (!bloc) return [];
  return bloc[1]
    .split('\n')
    .map((ligne) => ligne.trim())
    .map((ligne) => ligne.match(/^([A-Za-z_]\w*)\s*:\s*(.+);$/))
    .filter(Boolean)
    .map((correspondance) => ({
      nom: correspondance[1],
      autoriseTrou: /\bTrou\b/.test(correspondance[2]),
    }));
}

/** Les champs assignés par `export const IDENTITE = Object.freeze({ ... })`,
    chacun avec son nom et si sa valeur vaut littéralement `null`. */
function extraireChampsObjet(texte) {
  const bloc = texte.match(/export const IDENTITE[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
  if (!bloc) return [];
  return bloc[1]
    .split('\n')
    .map((ligne) => ligne.trim())
    .map((ligne) => ligne.match(/^([A-Za-z_]\w*)\s*:\s*(.+?),?$/))
    .filter(Boolean)
    .map((correspondance) => ({
      nom: correspondance[1],
      estNul: correspondance[2].trim() === 'null',
    }));
}

// Garde-fou du garde-fou, comme pour `compterTrous` ci-dessus : chaque
// extraction est éprouvée sur un texte dont la réponse est connue, avant
// qu'on lui confie le dépôt réel.
const TEMOIN_INTERFACE = [
  'export interface Identite {',
  '  champRequis: string;',
  '  champFacultatif: string | Trou;',
  '}',
].join('\n');
const champsTemoinInterface = extraireChampsInterface(TEMOIN_INTERFACE);
const temoinInterfaceOk =
  champsTemoinInterface.length === 2 &&
  champsTemoinInterface[0].nom === 'champRequis' &&
  champsTemoinInterface[0].autoriseTrou === false &&
  champsTemoinInterface[1].nom === 'champFacultatif' &&
  champsTemoinInterface[1].autoriseTrou === true;
if (!temoinInterfaceOk) {
  console.error("L'extraction de l'interface Identite est cassée : elle ne retrouve pas son propre témoin.");
  process.exit(1);
}

const TEMOIN_OBJET = [
  'export const IDENTITE: Readonly<Identite> = Object.freeze({',
  "  champRequis: 'valeur',",
  '  champFacultatif: null,',
  '});',
].join('\n');
const champsTemoinObjet = extraireChampsObjet(TEMOIN_OBJET);
const temoinObjetOk =
  champsTemoinObjet.length === 2 &&
  champsTemoinObjet[0].nom === 'champRequis' &&
  champsTemoinObjet[0].estNul === false &&
  champsTemoinObjet[1].nom === 'champFacultatif' &&
  champsTemoinObjet[1].estNul === true;
if (!temoinObjetOk) {
  console.error("L'extraction de l'objet IDENTITE est cassée : elle ne retrouve pas son propre témoin.");
  process.exit(1);
}

const resultatsInterface = [];
const resultatsObjet = [];
for (const fichier of sources) {
  const texte = readFileSync(fichier, 'utf8');
  const champsI = extraireChampsInterface(texte);
  if (champsI.length > 0) resultatsInterface.push({ fichier, champs: champsI });
  const champsO = extraireChampsObjet(texte);
  if (champsO.length > 0) resultatsObjet.push({ fichier, champs: champsO });
}

// Même principe que le motif de fichiers vide, plus haut : ne rien trouver
// n'est pas « aucun trou », c'est la garde qui a cessé de regarder. La pire
// version de ce script est celle qui dit « rien à compléter » parce qu'elle
// n'a rien lu.
if (resultatsObjet.length === 0) {
  console.error(
    "Extraction des champs d'identité cassée : aucune source ne porte l'objet IDENTITE (ou il est vide). " +
      'Impossible de dire à l’exploitant ce qui lui reste à compléter.',
  );
  process.exit(1);
}
if (resultatsInterface.length === 0) {
  console.error(
    "Extraction des champs d'identité cassée : aucune source ne porte l'interface Identite. " +
      'Impossible de distinguer un trou légitime d’un champ requis resté vide.',
  );
  process.exit(1);
}

const champsObjet = resultatsObjet.flatMap((resultat) => resultat.champs);
const champsInterface = resultatsInterface.flatMap((resultat) => resultat.champs);

const nomsInterface = new Set(champsInterface.map((champ) => champ.nom));
const nomsObjet = new Set(champsObjet.map((champ) => champ.nom));
const seulementInterface = [...nomsInterface].filter((nom) => !nomsObjet.has(nom));
const seulementObjet = [...nomsObjet].filter((nom) => !nomsInterface.has(nom));
if (seulementInterface.length > 0 || seulementObjet.length > 0) {
  console.error(
    "Extraction des champs d'identité incohérente : l'interface Identite et l'objet IDENTITE ne nomment " +
      `pas les mêmes champs (${[...seulementInterface, ...seulementObjet].join(', ')}). L'une des deux ` +
      'lectures a cassé sur la forme réelle du fichier.',
  );
  process.exit(1);
}

const autoriseTrouParNom = new Map(champsInterface.map((champ) => [champ.nom, champ.autoriseTrou]));
const champsVides = champsObjet.filter((champ) => champ.estNul);
const champsRequisVides = champsVides.filter((champ) => !autoriseTrouParNom.get(champ.nom));

// Une faute, pas un trou : l'interface dit que ce champ ne peut pas être un
// trou (il n'est pas typé `| Trou`), donc `tsc` ne l'aurait jamais laissé
// passer en l'état — le voir ici signale que la garde a mal lu le fichier,
// ou que le contrat de types a été contourné. Dans les deux cas, il ne s'agit
// pas d'attendre l'exploitant : c'est le code qui a dérivé de son propre
// contrat, pas un fait métier encore inconnu.
if (champsRequisVides.length > 0) {
  console.error(
    'Des champs requis (non déclarés `| Trou` dans Identite) valent null : ' +
      `${champsRequisVides.map((champ) => champ.nom).join(', ')}. Ce n’est pas un trou à afficher, ` +
      'c’est une régression du typage à corriger dans le code.',
  );
  process.exit(1);
}

const nomsChampsVides = champsVides.map((champ) => champ.nom).sort();
const fichiersIdentite = [...new Set(resultatsObjet.map((resultat) => resultat.fichier))].join(', ');

// Sans faire échouer : c'est l'exploitant qui décide quand publier, pas ce
// script. Un champ vide n'est pas une faute au sens de cette garde, il est là
// pour être vu — voir la tête de ce fichier.
if (nomsChampsVides.length > 0) {
  console.log(
    `Champs d'identité encore vides dans ${fichiersIdentite}, à compléter avant publication :\n` +
      nomsChampsVides.map((nom) => `  - ${nom}`).join('\n'),
  );
} else {
  console.log(`Tous les champs d'identité de ${fichiersIdentite} sont renseignés.`);
}

// --- Occurrences littérales du marqueur, ailleurs que dans sa définition ---
//
// Distinct du décompte par champ ci-dessus : celui-ci ne voit que
// `identite.ts`. Un marqueur écrit en dur dans une page ou un composant, au
// lieu d'être lu depuis `IDENTITE`, lui échapperait complètement — c'est ce
// que cette seconde lecture attrape encore. Deux occurrences ne sont pas des
// trous et sont exclues avant de compter : la définition du marqueur
// (`MARQUEUR_TROU = 'À COMPLÉTER'`), qui contient nécessairement sa propre
// valeur, et les fichiers de test, qui citent le marqueur pour vérifier qu'il
// s'affiche — ce n'est pas une valeur non renseignée montrée à un visiteur.
const DEFINITION_MARQUEUR = /MARQUEUR_TROU\s*=\s*'À COMPLÉTER'/;
const FICHIER_DE_TEST = /\.test\.tsx?$/;

const occurrencesLitterales = [];
for (const fichier of sources) {
  if (FICHIER_DE_TEST.test(fichier)) continue;
  const texte = readFileSync(fichier, 'utf8').replace(DEFINITION_MARQUEUR, '');
  const occurrences = compterTrous(texte);
  if (occurrences > 0) occurrencesLitterales.push(`${fichier} : ${occurrences}`);
}

if (occurrencesLitterales.length > 0) {
  console.log(
    `Occurrences littérales de « ${MARQUEUR_TROU} » ailleurs que dans sa définition et les tests ` +
      '(à ne pas confondre avec les champs ci-dessus : un marqueur écrit en dur au lieu d’être lu ' +
      `depuis identite.ts) :\n${occurrencesLitterales.join('\n')}`,
  );
} else {
  console.log(`Aucune occurrence littérale isolée de « ${MARQUEUR_TROU} » hors définition et tests.`);
}

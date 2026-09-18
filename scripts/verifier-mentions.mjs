/**
 * Deux fautes que seule une lecture des sources attrape.
 *
 * 1. L'ancienne adresse personnelle qui reparaît — par un copier-coller, ou
 *    par une branche qui n'avait pas la correction.
 * 2. Un numéro ARTCI cité alors qu'aucune autorisation n'a été délivrée. Une
 *    fausse mention dans un texte juridique est pire que son absence.
 *
 * Le marqueur des trous, lui, n'est PAS une faute au sens de cette garde : il
 * est là pour être vu. C'est l'exploitant qui décide quand publier, pas ce
 * script. Il les compte et les nomme, sans échouer.
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
// que ce script n'a pas.
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

const trous = [];
for (const fichier of sources) {
  const texte = readFileSync(fichier, 'utf8');
  const occurrences = compterTrous(texte);
  if (occurrences > 0) trous.push(`${fichier} : ${occurrences}`);
}

// Sans faire échouer : c'est l'exploitant qui décide quand publier, pas ce
// script. Un trou n'est pas une faute au sens de cette garde, il est là pour
// être vu — voir la tête de ce fichier.
if (trous.length > 0) {
  console.log(`Trous « ${MARQUEUR_TROU} » restants :\n${trous.join('\n')}`);
} else {
  console.log(`Aucun trou « ${MARQUEUR_TROU} » dans les ${sources.length} sources.`);
}

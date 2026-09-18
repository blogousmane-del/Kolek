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

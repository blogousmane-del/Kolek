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

// Deux motifs plutot qu'une expansion d'accolades : `fs.globSync` ne la
// garantit pas, et un motif qui ne correspond a rien rend une liste vide —
// donc une garde qui passe sans rien avoir lu. Le compte est verifie plus bas.
const sources = [
  ...globSync('apps/**/*.ts'),
  ...globSync('apps/**/*.tsx'),
  ...globSync('packages/**/*.ts'),
  ...globSync('packages/**/*.tsx'),
].filter((p) => !p.includes('node_modules') && !p.includes('dist'));

// Temoin : une garde qui ne lit aucun fichier passerait toujours.
if (sources.length < 100) {
  console.error(`Seulement ${sources.length} sources lues : le motif est casse.`);
  process.exit(1);
}

const fautes = [];
for (const fichier of sources) {
  const texte = readFileSync(fichier, 'utf8');
  if (/gsmtechnoloy@gmail\.com/.test(texte)) {
    fautes.push(`${fichier} : adresse personnelle, remplacer par contact@kolek.cash`);
  }
  if (/ARTCI\s*n[°o]\s*\d/i.test(texte)) {
    fautes.push(`${fichier} : cite un numéro ARTCI, or aucune autorisation n'existe`);
  }
}

if (fautes.length > 0) {
  console.error(fautes.join('\n'));
  process.exit(1);
}
console.log(`Les ${sources.length} sources ne citent ni adresse personnelle ni numéro ARTCI.`);

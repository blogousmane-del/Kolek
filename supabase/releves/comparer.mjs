// Compare deux relevés. Sortie non nulle au premier écart.
// Usage : node "supabase/releves/comparer.mjs" <avant.json> <apres.json>
import { readFileSync } from 'node:fs';

const [avant, apres] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));

if (JSON.stringify(avant.calme) !== JSON.stringify(apres.calme)) {
  console.log('Fenêtre non calme : une écriture est arrivée entre les deux relevés. Refaire la paire.');
  console.log('avant :', JSON.stringify(avant.calme));
  console.log('après :', JSON.stringify(apres.calme));
  process.exit(2);
}

const ecarts = [];

/**
 * Compare deux valeurs de même chemin.
 *
 * Les chaînes se comparent entières : les parcourir par index rendrait un écart
 * par caractère d'une empreinte md5, et trente-deux lignes pour un seul fait.
 */
const comparer = (x, y, chemin) => {
  const estObjet = (v) => v !== null && typeof v === 'object';
  if (estObjet(x) && estObjet(y)) {
    for (const cle of new Set([...Object.keys(x), ...Object.keys(y)])) {
      comparer(x[cle], y[cle], `${chemin}.${cle}`);
    }
    return;
  }
  if (JSON.stringify(x) !== JSON.stringify(y)) ecarts.push(`${chemin} : ${x} → ${y}`);
};

for (const cle of new Set([...Object.keys(avant), ...Object.keys(apres)])) {
  if (cle === 'calme') continue;
  comparer(avant[cle], apres[cle], cle);
}

if (ecarts.length > 0) {
  console.log('ÉCARTS :');
  for (const e of ecarts) console.log(` - ${e}`);
  process.exit(1);
}
console.log('Relevés identiques.');

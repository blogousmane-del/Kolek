// Exécute un relevé en lecture seule et garde son résultat.
// Usage, depuis la racine : node "supabase/releves/releve.mjs" <local|linked> <fichier.sql> <sortie.json>
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [cible, fichier, sortie] = process.argv.slice(2);
if (!['local', 'linked'].includes(cible) || !fichier || !sortie) {
  throw new Error('Usage : <local|linked> <fichier.sql> <sortie.json>');
}

// La garde, et elle compte : `--linked` vise la production. Commentaires
// retirés, le texte doit être une seule instruction qui lit.
const sql = readFileSync(fichier, 'utf8').replace(/--[^\n]*/g, '').trim();
if (!/^(select|with)\b/i.test(sql)) throw new Error('Refusé : un relevé commence par select ou with.');
if (/;[\s\S]*\S/.test(sql)) throw new Error('Refusé : plus d’une instruction.');
if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call)\b/i.test(sql)) {
  throw new Error('Refusé : le relevé contient un mot qui écrit.');
}

const brut = execSync(`npx supabase db query --${cible} --output-format json -f "${fichier}"`, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const { rows } = JSON.parse(brut.slice(brut.indexOf('{')));
if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].releve) {
  throw new Error('Relevé inattendu : une ligne « releve » était attendue.');
}

writeFileSync(sortie, JSON.stringify(rows[0].releve, null, 2));
console.log(`relevé ${cible} écrit : ${sortie}`);

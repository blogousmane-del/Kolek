import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PALIERS } from '../packages/core/src/paliers.ts';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CIBLE = join(RACINE, 'supabase/functions/_shared/paliers.ts');

const ENTETE = `// Fichier engendré par scripts/generer-paliers-edge.mjs — ne pas modifier à la main.
// La source est packages/core/src/paliers.ts. Relancer : npm run generer:paliers
//
// Les Edge Functions tournent sous Deno et ne voient pas les paquets de l'espace
// de travail npm. Sans ce fichier, le calcul du chiffre d'affaires porterait sa
// propre copie des prix — exactement ce que l'en-tête de paliers.ts interdit :
// « un prix qui diverge entre la page de vente et l'écran d'administration
// n'est pas un défaut d'affichage, c'est un litige commercial ».
//
// Le contrôle de fraîcheur (npm run verifier:paliers) est ce qui empêche les
// deux de diverger. Il tourne dans \`npm run verifier\`, à côté de celui du thème.

`;

/**
 * Seuls la clé, le nom, le prix et les deux plafonds traversent. Les couleurs,
 * accroches et listes de fonctions sont de l'affichage : les emporter côté
 * serveur inviterait à fabriquer des écrans depuis l'Edge Function, ce qui n'est
 * pas son travail. `collaborateursInclus` traverse parce que c'est une règle
 * appliquée côté serveur, pas un libellé.
 */
export function contenuAttendu() {
  const lignes = PALIERS.map(
    (p) =>
      `  { cle: '${p.cle}', nom: '${p.nom}', prix: ${p.prix}, limiteClients: ${p.limiteClients}, collaborateursInclus: ${p.collaborateursInclus} },`,
  ).join('\n');

  return (
    ENTETE +
    `export type Palier = ${PALIERS.map((p) => `'${p.cle}'`).join(' | ')};\n\n` +
    `export interface TarifPalier {\n` +
    `  cle: Palier;\n` +
    `  nom: string;\n` +
    `  /** En FCFA par mois. */\n` +
    `  prix: number;\n` +
    `  /** Plafond de clients ; \`null\` vaut « aucun plafond ». */\n` +
    `  limiteClients: number | null;\n` +
    `  /** Collaborateurs inclus dans le forfait. */\n` +
    `  collaborateursInclus: number;\n` +
    `}\n\n` +
    `export const TARIFS: readonly TarifPalier[] = [\n${lignes}\n];\n\n` +
    `const PAR_CLE = new Map(TARIFS.map((t) => [t.cle, t]));\n\n` +
    `/** Rend le tarif, ou lève : un palier inconnu en base doit se voir, pas se taire. */\n` +
    `export function tarifParCle(cle: string): TarifPalier {\n` +
    `  const trouve = PAR_CLE.get(cle as Palier);\n` +
    `  if (!trouve) throw new RangeError(\`Palier inconnu : \${cle}\`);\n` +
    `  return trouve;\n` +
    `}\n`
  );
}

/** Les fins de ligne ne sont pas du contenu. Ce fichier est engendré en `\n` et
    `core.autocrlf` le rend en `\r\n` sur Windows : sans cette normalisation, le
    contrôle de fraîcheur échoue sur tout dépôt fraîchement cloné, en annonçant
    une divergence de prix qui n'existe pas. Même idiome que `generer-theme.mjs`,
    qui porte cette normalisation depuis toujours. */
function normaliser(texte) {
  return texte.replace(/\r\n/g, '\n');
}

/**
 * Le fichier engendré correspond-il à la grille ?
 *
 * Séparée de `estAJour` pour être testable sans toucher au disque : la lecture
 * du fichier est un détail, la comparaison est la règle.
 */
export function correspond(texte) {
  return normaliser(texte) === normaliser(contenuAttendu());
}

export function estAJour() {
  try {
    return correspond(readFileSync(CIBLE, 'utf8'));
  } catch {
    return false;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const verifier = process.argv.includes('--verifier');

  if (verifier) {
    if (estAJour()) {
      console.log('_shared/paliers.ts est à jour.');
      process.exit(0);
    }
    console.error(
      '_shared/paliers.ts ne correspond plus à paliers.ts. Lance `npm run generer:paliers` et rejoue le build.',
    );
    process.exit(1);
  }

  mkdirSync(dirname(CIBLE), { recursive: true });
  writeFileSync(CIBLE, contenuAttendu());
  console.log('_shared/paliers.ts engendré.');
}

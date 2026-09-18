import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * La garde de `verifier-mentions.mjs`.
 *
 * Le script n'exporte rien : il lit le dépôt et tranche au premier appel, code
 * de sortie compris. Son contrat réel est donc ce code de sortie et ce qu'il
 * imprime — pas une fonction qu'on pourrait importer. On le fait donc tourner
 * en sous-processus, sur un faux dépôt jetable, exactement comme il tourne en
 * vrai : `node scripts/verifier-mentions.mjs` depuis une racine qui porte
 * `apps/`.
 */

const SCRIPT = fileURLToPath(new URL('./verifier-mentions.mjs', import.meta.url));

let dossier;

afterEach(() => {
  if (dossier) {
    rmSync(dossier, { recursive: true, force: true });
    dossier = undefined;
  }
});

function ecrire(cheminRelatif, texte) {
  const chemin = join(dossier, cheminRelatif);
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, texte);
}

/**
 * Un faux dépôt qui franchit, à lui seul, le plancher des quatre motifs — un
 * fichier sous `apps/**\/*.ts`, un sous `apps/**\/*.tsx`, un sous
 * `packages/**\/*.ts`, un sous `packages/**\/*.tsx` — puis le fichier qui
 * porte le texte à vérifier.
 *
 * Le sujet va sous `apps/site/src/vitrine/legal/` (un `.tsx` imbriqué, le cas
 * des pages légales) ou sous `packages/core/src/` (un `.ts` de package) selon
 * l'appelant — jamais à plat à la racine d'`apps/` : un dépôt qui ne prouve
 * qu'un `.ts` plat ne dit rien des `.tsx`, et ce sont les `.tsx` que cette
 * garde existe pour protéger.
 */
function depotAvec(cheminSujet, texte) {
  dossier = mkdtempSync(join(tmpdir(), 'verifier-mentions-'));
  ecrire('apps/f0.ts', 'export const x = 1;\n');
  ecrire('apps/site/src/vitrine/legal/f0.tsx', 'export const X = () => null;\n');
  ecrire('packages/core/src/f0.ts', 'export const x = 1;\n');
  ecrire('packages/ui/src/f0.tsx', 'export const X = () => null;\n');
  ecrire(cheminSujet, texte);
  return dossier;
}

function executer(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
}

describe('garde de source des mentions', () => {
  it('refuse un texte qui porte l’ancienne adresse personnelle, dans une page légale', () => {
    const resultat = executer(
      depotAvec('apps/site/src/vitrine/legal/sujet.tsx', "export const x = 'gsmtechnoloy@gmail.com';\n"),
    );

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/adresse personnelle/);
  });

  it('refuse un texte qui cite un numéro ARTCI, dans un package', () => {
    const resultat = executer(depotAvec('packages/core/src/sujet.ts', "export const x = 'ARTCI n° 12345';\n"));

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/numéro ARTCI/);
  });

  it('reconnaît un numéro ARTCI écrit en toutes lettres, avec un séparateur', () => {
    const resultat = executer(depotAvec('packages/core/src/sujet.ts', "export const x = 'ARTCI : n° 12345';\n"));

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/numéro ARTCI/);
  });

  it('accepte un dépôt sans faute, marqueur compris', () => {
    const resultat = executer(
      depotAvec('apps/site/src/vitrine/legal/sujet.tsx', "export const x = 'À COMPLÉTER';\n"),
    );

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/ne citent ni adresse personnelle ni numéro ARTCI/);
  });

  it('compte et nomme un trou « À COMPLÉTER », sans faire échouer le script', () => {
    const resultat = executer(
      depotAvec(
        'apps/site/src/vitrine/legal/sujet.tsx',
        "export const x = 'À COMPLÉTER : numéro de téléphone';\n",
      ),
    );

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/sujet\.tsx\s*:\s*1/);
  });

  it('compte deux trous dans le même fichier', () => {
    const resultat = executer(
      depotAvec(
        'apps/site/src/vitrine/legal/sujet.tsx',
        "export const x = 'À COMPLÉTER'; export const y = 'À COMPLÉTER';\n",
      ),
    );

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/sujet\.tsx\s*:\s*2/);
  });

  it('échoue si un motif ne trouve aucun fichier, et nomme lequel', () => {
    dossier = mkdtempSync(join(tmpdir(), 'verifier-mentions-'));
    // Cinq fichiers, tous sous `apps/` : les motifs `apps/**\/*.ts` et
    // `apps/**\/*.tsx` sont couverts, mais aucun dossier `packages/` n'existe
    // — les deux motifs `packages/**\/*` ne trouvent donc rien.
    ecrire('apps/f0.ts', 'export const x = 1;\n');
    ecrire('apps/f1.ts', 'export const x = 1;\n');
    ecrire('apps/f2.ts', 'export const x = 1;\n');
    ecrire('apps/f0.tsx', 'export const X = () => null;\n');
    ecrire('apps/f1.tsx', 'export const X = () => null;\n');

    const resultat = executer(dossier);

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toContain('packages/**/*.ts');
    expect(resultat.stderr).toContain('cassé');
  });
});

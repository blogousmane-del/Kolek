import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * La garde de `verifier-mentions.mjs`.
 *
 * Le script n'exporte rien : il lit le dépôt et tranche au premier appel, code
 * de sortie compris. Le tester en l'important reviendrait à l'exécuter deux
 * fois — une fois pour l'import, une fois pour le test — et un `process.exit`
 * déclenché par l'import tuerait le runner entier plutôt que ce seul cas. On
 * le fait donc tourner en sous-processus, sur un faux dépôt jetable, exactement
 * comme il tourne en vrai : `node scripts/verifier-mentions.mjs` depuis une
 * racine qui porte `apps/`.
 */

const SCRIPT = fileURLToPath(new URL('./verifier-mentions.mjs', import.meta.url));

let dossier;

afterEach(() => {
  if (dossier) {
    rmSync(dossier, { recursive: true, force: true });
    dossier = undefined;
  }
});

/**
 * Un faux dépôt avec assez de fichiers pour franchir le plancher de 100 — sous
 * peine de tomber sur « le motif est cassé » au lieu du contrôle qu'on veut
 * exercer — plus un fichier qui porte le texte à vérifier.
 */
function depotAvec(texte) {
  dossier = mkdtempSync(join(tmpdir(), 'verifier-mentions-'));
  const apps = join(dossier, 'apps');
  mkdirSync(apps, { recursive: true });
  for (let i = 0; i < 100; i += 1) {
    writeFileSync(join(apps, `f${i}.ts`), 'export const x = 1;\n');
  }
  writeFileSync(join(apps, 'sujet.ts'), texte);
  return dossier;
}

function executer(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
}

describe('garde de source des mentions', () => {
  it('refuse un texte qui porte l’ancienne adresse personnelle', () => {
    const resultat = executer(depotAvec("export const x = 'gsmtechnoloy@gmail.com';\n"));

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/adresse personnelle/);
  });

  it('refuse un texte qui cite un numéro ARTCI', () => {
    const resultat = executer(depotAvec("export const x = 'ARTCI n° 12345';\n"));

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/numéro ARTCI/);
  });

  it('accepte un texte qui porte le marqueur des trous', () => {
    const resultat = executer(depotAvec("export const x = 'À COMPLÉTER';\n"));

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/ne citent ni adresse personnelle ni numéro ARTCI/);
  });
});

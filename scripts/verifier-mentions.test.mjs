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

/**
 * Un fichier au format réel de `identite.ts` : une interface `Identite` qui
 * dit quels champs ont le droit d'être un trou (`| Trou`), puis l'objet
 * `IDENTITE` qui les assigne. `declarationActiviteValeur` est le texte brut
 * de la valeur — `'null'` pour un trou, une chaîne entre quotes pour un champ
 * rempli — exactement ce que la garde doit lire pour nommer ou non ce champ.
 */
function texteIdentiteSujet({ declarationActiviteValeur }) {
  return [
    'export interface Identite {',
    '  exploitant: string;',
    '  adressePrecise: string | Trou;',
    '  declarationActivite: string | Trou;',
    '}',
    '',
    'export const IDENTITE: Readonly<Identite> = Object.freeze({',
    "  exploitant: 'BERTHE OUSMANE',",
    "  adressePrecise: 'Place Blé Zokou',",
    `  declarationActivite: ${declarationActiviteValeur},`,
    '});',
    '',
  ].join('\n');
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

  it('accepte un dépôt sans faute, tous les champs d’identité renseignés', () => {
    const resultat = executer(
      depotAvec(
        'apps/site/src/vitrine/legal/identite.ts',
        texteIdentiteSujet({ declarationActiviteValeur: "'Déposée le 2 janvier 2026'" }),
      ),
    );

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/ne citent ni adresse personnelle ni numéro ARTCI/);
    expect(resultat.stdout).toMatch(/Tous les champs d'identité .* sont renseignés/);
  });

  it('nomme le champ d’identité encore vide, pas seulement son compte', () => {
    const resultat = executer(
      depotAvec(
        'apps/site/src/vitrine/legal/identite.ts',
        texteIdentiteSujet({ declarationActiviteValeur: 'null' }),
      ),
    );

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/declarationActivite/);
  });

  it('change de sortie quand un champ auparavant vide est renseigné — la propriété que l’ancien compte n’avait pas', () => {
    const resultatVide = executer(
      depotAvec(
        'apps/site/src/vitrine/legal/identite.ts',
        texteIdentiteSujet({ declarationActiviteValeur: 'null' }),
      ),
    );
    const resultatRempli = executer(
      depotAvec(
        'apps/site/src/vitrine/legal/identite.ts',
        texteIdentiteSujet({ declarationActiviteValeur: "'Déposée le 2 janvier 2026'" }),
      ),
    );

    expect(resultatVide.status).toBe(0);
    expect(resultatRempli.status).toBe(0);
    expect(resultatVide.stdout).toMatch(/declarationActivite/);
    expect(resultatRempli.stdout).not.toMatch(/declarationActivite/);
    expect(resultatVide.stdout).not.toBe(resultatRempli.stdout);
  });

  it('échoue si l’extraction ne trouve aucun champ dans IDENTITE, au lieu de dire silencieusement « aucun trou »', () => {
    const resultat = executer(
      depotAvec(
        'apps/site/src/vitrine/legal/identite.ts',
        'export const IDENTITE: Readonly<Identite> = Object.freeze({\n});\n',
      ),
    );

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/cassée/);
  });

  it('signale une occurrence littérale du marqueur écrite en dur ailleurs que dans identite.ts, sans faire échouer le script', () => {
    const dossierRepo = depotAvec(
      'apps/site/src/vitrine/legal/identite.ts',
      texteIdentiteSujet({ declarationActiviteValeur: "'Déposée le 2 janvier 2026'" }),
    );
    ecrire(
      'apps/site/src/vitrine/legal/page-en-dur.tsx',
      "export const X = () => 'À COMPLÉTER : numéro de téléphone';\n",
    );

    const resultat = executer(dossierRepo);

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/page-en-dur\.tsx\s*:\s*1/);
  });

  it('compte deux occurrences littérales dans le même fichier', () => {
    const dossierRepo = depotAvec(
      'apps/site/src/vitrine/legal/identite.ts',
      texteIdentiteSujet({ declarationActiviteValeur: "'Déposée le 2 janvier 2026'" }),
    );
    ecrire(
      'apps/site/src/vitrine/legal/page-en-dur.tsx',
      "export const X = () => 'À COMPLÉTER'; export const Y = () => 'À COMPLÉTER';\n",
    );

    const resultat = executer(dossierRepo);

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/page-en-dur\.tsx\s*:\s*2/);
  });

  it('n’imprime ni la définition du marqueur ni une assertion de test comme occurrence littérale', () => {
    const dossierRepo = depotAvec(
      'apps/site/src/vitrine/legal/identite.ts',
      `${texteIdentiteSujet({ declarationActiviteValeur: "'Déposée le 2 janvier 2026'" })}\nexport const MARQUEUR_TROU = 'À COMPLÉTER';\n`,
    );
    ecrire(
      'apps/site/src/vitrine/legal/sujet.test.tsx',
      'expect(screen.getAllByText(/À COMPLÉTER/).length).toBeGreaterThan(0);\n',
    );

    const resultat = executer(dossierRepo);

    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/Aucune occurrence littérale isolée/);
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

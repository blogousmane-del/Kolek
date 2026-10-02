import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { cheminsSurveilles, reproches, scriptsLus } from './verifier-ignore.mjs';

/**
 * La garde de `verifier-ignore.mjs`.
 *
 * Le défaut qu'elle empêche a vécu dans les trois `netlify.toml` à la fois,
 * sans qu'aucun contrôle le voie : leur règle `ignore` ne surveillait pas les
 * scripts que leur construction exécute. Une correction du seul script aurait
 * été validée, fusionnée, et jamais construite.
 */

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(SCRIPTS, 'verifier-ignore.mjs');
const RACINE = join(SCRIPTS, '..');

const VITE = `import { decouperLib } from '../../scripts/decouper-lib.mjs';
import { gardeEnv } from '../../scripts/garde-env.mjs';
export default {};
`;

const IGNORE_COMPLET =
  'ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/x packages scripts/garde-env.mjs scripts/decouper-lib.mjs"';

describe('cheminsSurveilles', () => {
  it('lit les chemins de la règle ignore', () => {
    expect(cheminsSurveilles(`[build]\n  ${IGNORE_COMPLET}\n`)).toEqual([
      'apps/x',
      'packages',
      'scripts/garde-env.mjs',
      'scripts/decouper-lib.mjs',
    ]);
  });

  it('ne prend pas une règle commentée pour la vraie', () => {
    const toml = `[build]\n  # ${IGNORE_COMPLET}\n  ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/x"\n`;

    expect(cheminsSurveilles(toml)).toEqual(['apps/x']);
  });

  it('rend null sans règle ignore, au lieu d’une liste vide', () => {
    // Une liste vide dirait « rien n'est surveillé », ce qui est faux : sans
    // règle, Netlify construit à chaque fois. Les deux cas ne se confondent pas.
    expect(cheminsSurveilles('[build]\n  command = "npm ci"\n')).toBeNull();
  });
});

describe('scriptsLus', () => {
  it('trouve les scripts importés par vite.config.ts', () => {
    expect(scriptsLus({ viteConfig: VITE, build: 'tsc -b && vite build', lire: () => '' })).toEqual([
      'scripts/decouper-lib.mjs',
      'scripts/garde-env.mjs',
    ]);
  });

  it('trouve un script lancé par la commande de construction', () => {
    const lus = scriptsLus({
      viteConfig: '',
      build: 'tsc -b && vite build && node ../../scripts/prerendre.mjs',
      lire: () => '',
    });

    expect(lus).toEqual(['scripts/prerendre.mjs']);
  });

  it('suit les imports d’un script vers un autre script', () => {
    // Un script surveillé qui en importe un second : modifier le second change
    // la construction tout autant.
    const lire = (chemin) =>
      chemin === 'scripts/prerendre.mjs' ? "import { x } from './outil-commun.mjs';\n" : '';

    const lus = scriptsLus({
      viteConfig: '',
      build: 'vite build && node ../../scripts/prerendre.mjs',
      lire,
    });

    expect(lus).toEqual(['scripts/outil-commun.mjs', 'scripts/prerendre.mjs']);
  });
});

describe('reproches', () => {
  const app = (ignore, build = 'tsc -b && vite build') => ({
    nom: 'x',
    viteConfig: VITE,
    build,
    netlifyToml: `[build]\n  ${ignore}\n`,
  });

  it('ne trouve rien quand chaque script lu est surveillé', () => {
    expect(reproches([app(IGNORE_COMPLET)], () => '')).toEqual([]);
  });

  it('signale un script lu que la règle ne surveille pas', () => {
    const trouves = reproches(
      [app('ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/x packages"')],
      () => '',
    );

    expect(trouves).toHaveLength(2);
    expect(trouves.join(' ')).toMatch(/x.*scripts\/garde-env\.mjs/);
    expect(trouves.join(' ')).toMatch(/x.*scripts\/decouper-lib\.mjs/);
  });

  it('accepte le répertoire scripts entier à la place des noms', () => {
    const large = 'ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/x packages scripts"';

    expect(reproches([app(large)], () => '')).toEqual([]);
  });

  it('ne reproche rien à une app sans règle ignore, qui construit toujours', () => {
    expect(reproches([{ ...app(''), netlifyToml: '[build]\n' }], () => '')).toEqual([]);
  });
});

describe('en sous-processus, sur un faux dépôt', () => {
  let dossier = null;

  afterEach(() => {
    if (dossier) rmSync(dossier, { recursive: true, force: true });
    dossier = null;
  });

  function depot(ignoreCollecteur) {
    dossier = mkdtempSync(join(tmpdir(), 'verifier-ignore-'));
    for (const nom of ['site', 'collecteur', 'admin']) {
      const ignore =
        nom === 'collecteur'
          ? ignoreCollecteur
          : `ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/${nom} packages scripts/garde-env.mjs scripts/decouper-lib.mjs"`;
      mkdirSync(join(dossier, 'apps', nom), { recursive: true });
      writeFileSync(join(dossier, 'apps', nom, 'vite.config.ts'), VITE);
      writeFileSync(
        join(dossier, 'apps', nom, 'package.json'),
        JSON.stringify({ scripts: { build: 'tsc -b && vite build' } }),
      );
      writeFileSync(join(dossier, 'apps', nom, 'netlify.toml'), `[build]\n  ${ignore}\n`);
    }
    mkdirSync(join(dossier, 'scripts'), { recursive: true });
    writeFileSync(join(dossier, 'scripts', 'garde-env.mjs'), 'export const x = 1;\n');
    writeFileSync(join(dossier, 'scripts', 'decouper-lib.mjs'), 'export const y = 1;\n');
    return dossier;
  }

  const executer = (cwd) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });

  it('réussit — code 0 — quand chaque règle surveille ce que sa construction lit', () => {
    const resultat = executer(
      depot(
        'ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/collecteur packages scripts/garde-env.mjs scripts/decouper-lib.mjs"',
      ),
    );

    expect(resultat.stderr).toBe('');
    expect(resultat.status).toBe(0);
  });

  it('échoue — code 1 — et nomme l’app et le script oubliés', () => {
    const resultat = executer(
      depot('ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/collecteur packages"'),
    );

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/collecteur.*scripts\/garde-env\.mjs/s);
  });
});

describe('sur le vrai dépôt', () => {
  it('chaque netlify.toml surveille les scripts que sa construction lit', () => {
    const resultat = spawnSync(process.execPath, [SCRIPT], { cwd: RACINE, encoding: 'utf8' });

    expect(resultat.stderr).toBe('');
    expect(resultat.status).toBe(0);
  });
});

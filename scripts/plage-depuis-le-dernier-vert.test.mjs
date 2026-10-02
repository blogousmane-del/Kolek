import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { plage } from './plage-depuis-le-dernier-vert.mjs';

/**
 * La plage que lisent le déploiement des Edge Functions et le rappel des
 * migrations.
 *
 * Elle se mesurait depuis la poussée précédente. Constaté le 2026-10-02, à la
 * fusion de la #18 puis de la #19 à deux minutes d'écart : le run de la
 * première a été annulé par la seconde, et la seconde a comparé sa propre
 * fusion à la première. Ce que la #18 aurait apporté sous `supabase/` n'entrait
 * dans aucune plage, avec un CI vert pour le dire. Ce jour-là elle n'apportait
 * rien : le trou est resté sans effet, et ces épreuves sont là pour qu'il le
 * reste.
 *
 * Chaque épreuve monte un vrai dépôt Git jetable : la plage est une question
 * d'historique, et un faux historique mentirait sur ce qui compte.
 */

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'plage-depuis-le-dernier-vert.mjs');

let depots = [];

afterEach(() => {
  for (const d of depots) rmSync(d, { recursive: true, force: true });
  depots = [];
});

function git(depot, ...args) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Epreuve',
      '-c',
      'user.email=epreuve@kolek.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.autocrlf=false',
      ...args,
    ],
    { cwd: depot, encoding: 'utf8' },
  ).trim();
}

function depotNeuf() {
  const depot = mkdtempSync(join(tmpdir(), 'plage-'));
  depots.push(depot);
  git(depot, 'init', '-q', '-b', 'main');
  return depot;
}

/** Écrit les fichiers, commite, et rend l'empreinte du commit. */
function commit(depot, fichiers, message) {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(depot, chemin)), { recursive: true });
    writeFileSync(join(depot, chemin), contenu);
  }
  git(depot, 'add', '-A');
  git(depot, 'commit', '-q', '-m', message);
  return git(depot, 'rev-parse', 'HEAD');
}

/**
 * L'historique du 2026-10-02, réduit à l'os : un dernier run vert, une poussée
 * dont le run est annulé et qui touche une fonction, puis une poussée qui ne
 * touche que la documentation.
 */
function historiqueAvecPousseeAnnulee() {
  const depot = depotNeuf();
  const vert = commit(depot, { 'README.md': 'kolek\n' }, 'le dernier run vert');
  const annulee = commit(
    depot,
    { 'supabase/functions/envoyer-avis/index.ts': 'export {};\n' },
    'la poussée dont le run est annulé',
  );
  const tete = commit(depot, { 'Docs/note.md': 'note\n' }, 'la poussée suivante');
  return { depot, vert, annulee, tete };
}

describe('la plage commence au dernier run vert, pas à la poussée précédente', () => {
  it('voit la fonction modifiée par une poussée dont le run a été annulé', () => {
    const { depot, vert, tete } = historiqueAvecPousseeAnnulee();

    const resultat = plage({ depuis: vert, jusqua: tete, chemin: 'supabase/functions', depot });

    expect(resultat.touche).toBe(true);
    expect(resultat.certaine).toBe(true);
    expect(resultat.fichiers).toEqual(['supabase/functions/envoyer-avis/index.ts']);
  });

  it('montre ce que manquait l’ancienne base, la poussée précédente', () => {
    // Le témoin du défaut : depuis `github.event.before` de la dernière
    // poussée, c'est-à-dire depuis la poussée annulée, la même question rend
    // « rien ». C'était la mesure du workflow jusqu'au 2026-10-02.
    const { depot, annulee, tete } = historiqueAvecPousseeAnnulee();

    const resultat = plage({ depuis: annulee, jusqua: tete, chemin: 'supabase/functions', depot });

    expect(resultat.touche).toBe(false);
  });

  it('ne voit rien quand rien n’a changé sous le chemin depuis le dernier vert', () => {
    const depot = depotNeuf();
    const vert = commit(depot, { 'supabase/functions/a.ts': 'a\n' }, 'vert');
    const tete = commit(depot, { 'apps/site/x.ts': 'x\n' }, 'front seul');

    const resultat = plage({ depuis: vert, jusqua: tete, chemin: 'supabase/functions', depot });

    expect(resultat).toMatchObject({ touche: false, certaine: true, fichiers: [] });
  });

  it('lit le chemin des migrations de la même façon', () => {
    const depot = depotNeuf();
    const vert = commit(depot, { 'README.md': 'kolek\n' }, 'vert');
    commit(depot, { 'supabase/migrations/20261002000000_x.sql': 'select 1;\n' }, 'migration');
    const tete = commit(depot, { 'Docs/note.md': 'note\n' }, 'docs');

    const resultat = plage({ depuis: vert, jusqua: tete, chemin: 'supabase/migrations', depot });

    expect(resultat.touche).toBe(true);
    expect(resultat.fichiers).toEqual(['supabase/migrations/20261002000000_x.sql']);
  });
});

/**
 * Le repli couvre, il ne saute pas — la règle du 2026-09-09. Redéployer pour
 * rien remplace du code par le même code ; sauter un déploiement laisse la
 * production en arrière sans que rien ne le dise.
 */
describe('quand la base est inconnue, la plage couvre tout', () => {
  it('aucun run vert connu', () => {
    const { depot, tete } = historiqueAvecPousseeAnnulee();

    const resultat = plage({ depuis: '', jusqua: tete, chemin: 'supabase/functions', depot });

    expect(resultat).toMatchObject({ touche: true, certaine: false });
    expect(resultat.raison).toMatch(/aucun run vert/i);
  });

  it('une réponse d’erreur de l’API à la place d’une empreinte', () => {
    // Vu en rejouant l'étape du workflow à blanc : quand l'API échoue, `gh api`
    // écrit le corps de l'erreur sur sa sortie standard, et `$(…)` le capture.
    // La plage couvrait déjà tout, mais en prenant ce JSON pour un commit.
    const { depot, tete } = historiqueAvecPousseeAnnulee();

    const resultat = plage({
      depuis: '{"message":"Not Found","status":"404"}',
      jusqua: tete,
      chemin: 'supabase/functions',
      depot,
    });

    expect(resultat).toMatchObject({ touche: true, certaine: false });
    expect(resultat.raison).toMatch(/n'est pas une empreinte de commit/);
  });

  it('le commit du dernier vert est introuvable', () => {
    const { depot, tete } = historiqueAvecPousseeAnnulee();

    const resultat = plage({
      depuis: 'f'.repeat(40),
      jusqua: tete,
      chemin: 'supabase/functions',
      depot,
    });

    expect(resultat).toMatchObject({ touche: true, certaine: false });
    expect(resultat.raison).toMatch(/introuvable/);
  });

  it('l’historique a été réécrit : le dernier vert n’est plus un ancêtre', () => {
    const depot = depotNeuf();
    const base = commit(depot, { 'README.md': 'kolek\n' }, 'base');
    git(depot, 'checkout', '-q', '-b', 'reecrite');
    const ecarte = commit(depot, { 'Docs/a.md': 'a\n' }, 'commit écarté par la réécriture');
    git(depot, 'checkout', '-q', 'main');
    const tete = commit(depot, { 'Docs/b.md': 'b\n' }, 'main réécrite');
    expect(base).not.toBe(ecarte);

    const resultat = plage({ depuis: ecarte, jusqua: tete, chemin: 'supabase/functions', depot });

    expect(resultat).toMatchObject({ touche: true, certaine: false });
    expect(resultat.raison).toMatch(/ancêtre/);
  });
});

describe('en ligne de commande, comme le workflow l’appelle', () => {
  it('écrit sa décision dans GITHUB_OUTPUT et nomme les fichiers', () => {
    const { depot, vert, tete } = historiqueAvecPousseeAnnulee();
    const sortie = join(depot, 'sortie-github.txt');
    writeFileSync(sortie, '');

    const r = spawnSync(
      process.execPath,
      [SCRIPT, '--chemin', 'supabase/functions', '--depuis', vert, '--jusqua', tete],
      { cwd: depot, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: sortie } },
    );

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('supabase/functions/envoyer-avis/index.ts');
    expect(readFileSync(sortie, 'utf8')).toBe('touche=oui\ncertaine=oui\n');
  });

  it('accepte une base vide, telle que la rend une API muette', () => {
    // `gh api … || true` rend une chaîne vide quand l'appel échoue : le script
    // la reçoit en argument vide, et doit couvrir tout plutôt que de tomber.
    const { depot, tete } = historiqueAvecPousseeAnnulee();
    const sortie = join(depot, 'sortie-github.txt');
    writeFileSync(sortie, '');

    const r = spawnSync(
      process.execPath,
      [SCRIPT, '--chemin', 'supabase/migrations', '--depuis', '', '--jusqua', tete],
      { cwd: depot, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: sortie } },
    );

    expect(r.status).toBe(0);
    expect(readFileSync(sortie, 'utf8')).toBe('touche=oui\ncertaine=non\n');
  });

  it('refuse de deviner un chemin qu’on ne lui a pas donné', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--depuis', 'abc'], { encoding: 'utf8' });

    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--chemin/);
  });
});

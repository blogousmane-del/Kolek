import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { SITEMAP, engendrer } from './engendrer-sitemap.mjs';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const RACINE = join(SCRIPTS, '..');
const SCRIPT = join(SCRIPTS, 'engendrer-sitemap.mjs');

const TABLE = [
  { chemin: '/', fichier: 'index.html', indexable: true, prerendu: true },
  { chemin: '/conditions', fichier: 'conditions/index.html', indexable: true, prerendu: true },
  { chemin: '/inscription', fichier: 'inscription/index.html', indexable: false, prerendu: false },
];

const ROUTES_OK = `export const ROUTES = ${JSON.stringify(TABLE, null, 2)};\n`;

describe('le document engendré', () => {
  it('déclare les routes indexables, et elles seules', () => {
    const xml = engendrer(TABLE);

    expect(xml).toContain('<loc>https://kolek.cash/</loc>');
    expect(xml).toContain('<loc>https://kolek.cash/conditions</loc>');
    expect(xml).not.toContain('/inscription');
  });

  it('garde la barre oblique de la racine, qui est la forme déjà indexée', () => {
    expect(engendrer(TABLE)).toContain('<loc>https://kolek.cash/</loc>');
  });

  it('ne pose aucun lastmod', () => {
    // Un lastmod faux est pire qu'absent : Google apprend à ne plus le croire.
    // La balise, pas le mot : le commentaire du document explique justement
    // pourquoi elle est absente, et le chercher partout accuserait ce texte.
    expect(engendrer(TABLE)).not.toContain('<lastmod>');
  });

  it('écrit en LF, la forme sous laquelle le dépôt garde ses fichiers', () => {
    // `core.autocrlf = true` : le dépôt stocke du LF, et le CRLF n'existe que
    // dans un répertoire de travail Windows, posé par Git au checkout. Cette
    // épreuve exigeait du CRLF jusqu'au 2026-10-02, sur la foi d'un CRLF lu
    // dans le répertoire de travail et pris pour celui du dépôt.
    expect(engendrer(TABLE).includes('\r')).toBe(false);
  });

  it('rend deux fois le même octet pour la même table', () => {
    // Le mode --verifier compare des chaînes : une sortie instable le ferait
    // échouer au hasard, et le contrôle serait désarmé dans la semaine.
    expect(engendrer(TABLE)).toBe(engendrer(TABLE));
  });
});

describe('en sous-processus, sur un faux dépôt', () => {
  let dossier = null;

  afterEach(() => {
    if (dossier) rmSync(dossier, { recursive: true, force: true });
    dossier = null;
  });

  function depot(sitemap) {
    dossier = mkdtempSync(join(tmpdir(), 'engendrer-sitemap-'));
    mkdirSync(join(dossier, 'apps/site/src/vitrine'), { recursive: true });
    mkdirSync(join(dossier, 'apps/site/public'), { recursive: true });
    writeFileSync(join(dossier, 'apps/site/src/vitrine/routes.ts'), ROUTES_OK);
    if (sitemap !== undefined) writeFileSync(join(dossier, SITEMAP), sitemap);
    return dossier;
  }

  function executer(cwd, ...args) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  }

  it('écrit le fichier, puis se vérifie lui-même', () => {
    const cwd = depot();

    expect(executer(cwd).status).toBe(0);
    expect(readFileSync(join(cwd, SITEMAP), 'utf8')).toBe(engendrer(TABLE));
    expect(executer(cwd, '--verifier').status).toBe(0);
  });

  /*
    La preuve que le contrôle sait rougir. Le cas reproduit est celui qui a
    coûté l'indexation des trois pages légales : un sitemap qui déclare une
    adresse que la table ne connaît pas. Google s'y rend, la page lui répond
    qu'elle est ailleurs, et le signal se perd entre les deux.
  */
  it('échoue — code 1 — quand le fichier déclare une adresse absente de la table', () => {
    const menteur = engendrer(TABLE).replace(
      '</urlset>',
      '  <url>\n    <loc>https://kolek.cash/tarifs</loc>\n  </url>\n</urlset>',
    );

    const resultat = executer(depot(menteur), '--verifier');

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/dérivé de la table/);
  });

  /*
    Le CI du 2026-10-02 : vert sous Windows, rouge sous Linux, sur un sitemap
    qui n'avait pas bougé. Le clone Linux reçoit le LF du dépôt, le checkout
    Windows du CRLF. Le contrôle doit accepter les deux, comme le fait déjà
    `generer-theme.mjs`, qui a appris la même chose le 2026-08-24.
  */
  it('ne réécrit pas un fichier déjà à jour', () => {
    // Le checkout Windows dépose du CRLF. Réécrire en LF un fichier inchangé
    // le faisait marquer « modifié » par `git status`, sans aucune différence
    // à montrer : constaté le 2026-10-02, au premier essai du générateur.
    const crlf = engendrer(TABLE).replace(/\r?\n/g, '\r\n');
    const cwd = depot(crlf);

    const resultat = executer(cwd);

    expect(resultat.status).toBe(0);
    expect(readFileSync(join(cwd, SITEMAP), 'utf8')).toBe(crlf);
    expect(resultat.stdout).toMatch(/déjà à jour/);
  });

  it('accepte le fichier tel que Git le dépose sous Linux, en LF', () => {
    const lf = engendrer(TABLE).replace(/\r\n/g, '\n');

    expect(executer(depot(lf), '--verifier').status).toBe(0);
  });

  it('accepte le fichier tel que Git le dépose sous Windows, en CRLF', () => {
    const crlf = engendrer(TABLE).replace(/\r?\n/g, '\r\n');

    expect(executer(depot(crlf), '--verifier').status).toBe(0);
  });

  it('échoue — code 1 — sur une simple retouche à la main', () => {
    const retouche = engendrer(TABLE).replace('https://kolek.cash/conditions', 'https://kolek.cash/cgu');

    const resultat = executer(depot(retouche), '--verifier');

    expect(resultat.status).toBe(1);
  });
});

describe('sur le vrai dépôt', () => {
  it('le sitemap versionné correspond déjà à la table', () => {
    const resultat = spawnSync(process.execPath, [SCRIPT, '--verifier'], {
      cwd: RACINE,
      encoding: 'utf8',
    });

    expect(resultat.stderr).toBe('');
    expect(resultat.status).toBe(0);
  });
});

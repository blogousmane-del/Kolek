import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  blocsRedirects,
  jokerPresent,
  reecrituresDeNetlify,
  reproches,
} from './verifier-routes.mjs';

/**
 * La garde de `verifier-routes.mjs`.
 *
 * Deux familles d'épreuves. La première appelle les fonctions exportées : c'est
 * le seul moyen de viser précisément un reproche. La seconde fait tourner le
 * script en sous-processus sur un faux dépôt jetable, comme
 * `verifier-mentions.test.mjs` le fait déjà — c'est le contrat réel, code de
 * sortie et texte imprimé compris.
 *
 * La seconde famille a une raison de plus d'exister depuis le 2026-09-20 : le
 * script **importe** désormais la table au lieu de lire un fichier. Un import
 * mal résolu lirait la vraie table pendant qu'on lui présente une table
 * cassée, et passerait au vert sur un dépôt délibérément rompu. Seul un faux
 * dépôt le démasque.
 */

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'verifier-routes.mjs');

const ROUTES_OK = `export const ORIGINE = 'https://kolek.cash';
export const ROUTES = [
  { chemin: '/', fichier: 'index.html', titre: 'A', description: 'a', indexable: true, prerendu: true },
  { chemin: '/conditions', fichier: 'conditions/index.html', titre: 'B', description: 'b', indexable: true, prerendu: true },
  { chemin: '/inscription', fichier: 'inscription/index.html', titre: 'C', description: 'c', indexable: false, prerendu: false },
];
`;

const NETLIFY_OK = `[[redirects]]
  from = "https://kolek-site.netlify.app/*"
  to = "https://kolek.cash/:splat"
  status = 301
  force = true

[[redirects]]
  from = "/conditions"
  to = "/conditions/index.html"
  status = 200

[[redirects]]
  from = "/inscription"
  to = "/inscription/index.html"
  status = 200
`;

/** La table telle que le script la reçoit une fois importée. */
const TABLE_OK = [
  { chemin: '/', fichier: 'index.html' },
  { chemin: '/conditions', fichier: 'conditions/index.html' },
  { chemin: '/inscription', fichier: 'inscription/index.html' },
];

describe('blocsRedirects et reecrituresDeNetlify', () => {
  it('lit les règles nommées, sans la redirection de domaine en 301', () => {
    const reecritures = reecrituresDeNetlify(blocsRedirects(NETLIFY_OK));

    expect([...reecritures.keys()]).toEqual(['/conditions', '/inscription']);
    expect(reecritures.get('/conditions')).toBe('/conditions/index.html');
  });

  it('retient une règle qui vise le mauvais fichier, au lieu de l’écarter', () => {
    // Écartée, elle deviendrait une route « sans règle » et le message
    // parlerait d'un tout autre défaut que celui qui est là.
    const toml = NETLIFY_OK.replace('/conditions/index.html', '/index.html');

    expect(reecrituresDeNetlify(blocsRedirects(toml)).get('/conditions')).toBe('/index.html');
  });

  it('exclut le joker de la liste des routes nommées', () => {
    const toml = `${NETLIFY_OK}\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;

    expect([...reecrituresDeNetlify(blocsRedirects(toml)).keys()]).not.toContain('/*');
  });
});

describe('jokerPresent', () => {
  it('voit un joker qui réécrit tout vers /index.html en 200', () => {
    const toml = `${NETLIFY_OK}\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;

    expect(jokerPresent(blocsRedirects(toml))).toBe(true);
  });

  it('ne confond pas la redirection de domaine, qui vise une autre adresse', () => {
    expect(jokerPresent(blocsRedirects(NETLIFY_OK))).toBe(false);
  });
});

describe('reproches', () => {
  it('ne trouve rien à redire quand la table et le fichier se répondent', () => {
    expect(reproches({ routes: TABLE_OK, netlifyToml: NETLIFY_OK })).toEqual([]);
  });

  it('n’exige aucune règle pour la racine, que Netlify sert directement', () => {
    // `netlify.toml` ne porte volontairement aucune règle pour `/`. Si le
    // script en réclamait une, cette table — qui est le vrai cas du dépôt —
    // ferait échouer chaque construction.
    const sansLaRacine = [
      { chemin: '/', fichier: 'index.html' },
      { chemin: '/conditions', fichier: 'conditions/index.html' },
      { chemin: '/inscription', fichier: 'inscription/index.html' },
    ];

    expect(reproches({ routes: sansLaRacine, netlifyToml: NETLIFY_OK })).toEqual([]);
    expect(NETLIFY_OK).not.toContain('from = "/"');
  });

  it('signale une route de la table sans règle dans netlify.toml', () => {
    const routes = [...TABLE_OK, { chemin: '/confidentialite', fichier: 'confidentialite/index.html' }];

    const trouves = reproches({ routes, netlifyToml: NETLIFY_OK });

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toMatch(/\/confidentialite.*aucune règle/s);
  });

  it('signale une règle orpheline que la table ne connaît pas', () => {
    const toml = `${NETLIFY_OK}\n[[redirects]]\n  from = "/tarifs"\n  to = "/tarifs/index.html"\n  status = 200\n`;

    const trouves = reproches({ routes: TABLE_OK, netlifyToml: toml });

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toMatch(/\/tarifs.*ne connaît pas/s);
  });

  /**
   * Le reproche neuf du 2026-09-20, et le plus coûteux des trois.
   *
   * Une règle restée sur `/index.html` sert la page d'accueil sous l'adresse
   * des conditions : son texte, son titre et sa balise canonique. C'est-à-dire
   * exactement le défaut que le prérendu vient de fermer — 14 mots indexables
   * et une canonique unique pour cinq adresses — réintroduit par une ligne, et
   * invisible partout ailleurs : la construction réussit, les fichiers sont
   * bien écrits, seule la réécriture ment.
   */
  it('signale une règle qui sert le fichier d’une autre page', () => {
    const toml = NETLIFY_OK.replace('/conditions/index.html', '/index.html');

    const trouves = reproches({ routes: TABLE_OK, netlifyToml: toml });

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toMatch(/réécrit \/conditions vers \/index\.html/);
  });

  it('signale le retour du joker même quand les routes nommées sont correctes', () => {
    const toml = `${NETLIFY_OK}\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;

    expect(reproches({ routes: TABLE_OK, netlifyToml: toml }).join(' ')).toMatch(/joker|\/\*/);
  });

  it('signale une table vide, qui trahit un script qui ne lit plus rien', () => {
    expect(reproches({ routes: [], netlifyToml: NETLIFY_OK }).join(' ')).toMatch(/Aucune route/);
  });

  it('signale un netlify.toml sans aucune réécriture', () => {
    expect(reproches({ routes: TABLE_OK, netlifyToml: '' }).join(' ')).toMatch(/Aucune réécriture/);
  });
});

describe('en sous-processus, sur un faux dépôt', () => {
  let dossier = null;

  afterEach(() => {
    if (dossier) rmSync(dossier, { recursive: true, force: true });
    dossier = null;
  });

  function ecrire(cheminRelatif, texte) {
    const chemin = join(dossier, cheminRelatif);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, texte);
  }

  function depotAvec({ routes = ROUTES_OK, netlifyToml = NETLIFY_OK } = {}) {
    dossier = mkdtempSync(join(tmpdir(), 'verifier-routes-'));
    ecrire('apps/site/src/vitrine/routes.ts', routes);
    ecrire('apps/site/netlify.toml', netlifyToml);
    return dossier;
  }

  function executer(cwd) {
    return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
  }

  it('réussit — code 0 — quand la table et le fichier se répondent', () => {
    const resultat = executer(depotAvec());

    expect(resultat.stderr).toBe('');
    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/décrivent exactement le même site/);
  });

  /*
    La preuve que le contrôle sait rougir. Sans elle, le vert ne dit rien :
    un import mal résolu lirait la vraie table du dépôt et passerait au vert
    ici même, sur un faux dépôt délibérément cassé.
  */
  it('échoue — code 1 — quand une page perd sa règle netlify.toml', () => {
    const netlifyToml = `[[redirects]]
  from = "/inscription"
  to = "/inscription/index.html"
  status = 200
`;

    const resultat = executer(depotAvec({ netlifyToml }));

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/\/conditions.*aucune règle/s);
  });

  it('échoue — code 1 — quand une règle vise encore /index.html', () => {
    const netlifyToml = NETLIFY_OK.replace('/conditions/index.html', '/index.html');

    const resultat = executer(depotAvec({ netlifyToml }));

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/réécrit \/conditions vers \/index\.html/);
  });

  it('échoue — code 1 — quand le joker /* revient', () => {
    const netlifyToml = `${NETLIFY_OK}\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;

    const resultat = executer(depotAvec({ netlifyToml }));

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/joker/);
  });

  it('échoue — code 1 — quand la table ne contient plus aucune route', () => {
    const resultat = executer(depotAvec({ routes: 'export const ROUTES = [];\n' }));

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/Aucune route/);
  });
});

describe('sur le vrai dépôt', () => {
  it('réussit — code 0 — quand la vraie table et le vrai netlify.toml se répondent', () => {
    const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

    const resultat = spawnSync(process.execPath, [SCRIPT], { cwd: racine, encoding: 'utf8' });

    expect(resultat.stderr).toBe('');
    expect(resultat.status).toBe(0);
  });
});

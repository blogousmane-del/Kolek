import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  blocsRedirects,
  constantesDeLiens,
  jokerPresent,
  reproches,
  routesDeAppTsx,
  routesDeNetlify,
} from './verifier-routes.mjs';

/**
 * La garde de \`verifier-routes.mjs\`.
 *
 * Deux familles d'épreuves. La première appelle les fonctions exportées
 * directement — c'est le seul moyen de viser précisément une extraction
 * cassée (le motif d'App.tsx, celui de netlify.toml, la résolution d'une
 * constante). La seconde fait tourner le script en sous-processus sur un
 * faux dépôt jetable, comme \`verifier-mentions.test.mjs\` le fait déjà :
 * c'est le contrat réel, code de sortie et texte imprimé compris, et rien
 * d'autre ne le vérifie — le script n'est jamais importé pour son effet de
 * bord.
 */

const APP_TSX_OK = `export default function App() {
  const chemin = window.location.pathname.replace(/\\/+$/, '');

  if (chemin === '/inscription') return <Inscription />;
  if (chemin === MENTIONS_LEGALES) return <MentionsLegales />;
  if (chemin === CONDITIONS) return <Conditions />;
  if (chemin === CONFIDENTIALITE) return <Confidentialite />;
  return <Vitrine />;
}
`;

const LIENS_OK = `export const INSCRIPTION = '/inscription';
export const MENTIONS_LEGALES = '/mentions-legales';
export const CONDITIONS = '/conditions';
export const CONFIDENTIALITE = '/confidentialite';
export const CONTACT_DEMO =
  'mailto:contact@kolek.cash?subject=Kolek%20-%20demande%20de%20démo';
`;

const NETLIFY_OK = `[[redirects]]
  from = "https://kolek-site.netlify.app/*"
  to = "https://kolek.cash/:splat"
  status = 301
  force = true

# Un commentaire, collé sans ligne vide, comme dans le vrai fichier.
[[redirects]]
  from = "/inscription"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/mentions-legales"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/conditions"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/confidentialite"
  to = "/index.html"
  status = 200
`;

describe('routesDeAppTsx', () => {
  it("extrait les quatre routes, en résolvant les constantes de liens.ts", () => {
    const { routes, inconnues } = routesDeAppTsx(APP_TSX_OK, constantesDeLiens(LIENS_OK));
    expect(routes.sort()).toEqual(
      ['/confidentialite', '/conditions', '/inscription', '/mentions-legales'].sort(),
    );
    expect(inconnues).toEqual([]);
  });

  it('ne prend pas le repli final pour une route', () => {
    const { routes } = routesDeAppTsx(APP_TSX_OK, constantesDeLiens(LIENS_OK));
    expect(routes).not.toContain('/');
  });

  it("signale une constante qu'aucune ligne de liens.ts ne résout", () => {
    const appTsx = `if (chemin === ROUTE_FANTOME) return <X />;\nreturn <Vitrine />;\n`;
    const { routes, inconnues } = routesDeAppTsx(appTsx, {});
    expect(routes).toEqual([]);
    expect(inconnues).toEqual(['ROUTE_FANTOME']);
  });

  it('rend un ensemble vide sur un texte qui ne contient aucun dispatch', () => {
    const { routes, inconnues } = routesDeAppTsx('export default function App() { return null; }\n', {});
    expect(routes).toEqual([]);
    expect(inconnues).toEqual([]);
  });
});

describe('constantesDeLiens', () => {
  it('lit les quatre constantes à une ligne, et ignore CONTACT_DEMO sur deux lignes', () => {
    const c = constantesDeLiens(LIENS_OK);
    expect(c.MENTIONS_LEGALES).toBe('/mentions-legales');
    expect(c.CONDITIONS).toBe('/conditions');
    expect(c.CONFIDENTIALITE).toBe('/confidentialite');
    expect(c.INSCRIPTION).toBe('/inscription');
    expect(c.CONTACT_DEMO).toBeUndefined();
  });
});

describe('blocsRedirects et routesDeNetlify', () => {
  it('lit les quatre règles nommées, sans le joker ni la redirection de domaine', () => {
    const blocs = blocsRedirects(NETLIFY_OK);
    expect(routesDeNetlify(blocs).sort()).toEqual(
      ['/confidentialite', '/conditions', '/inscription', '/mentions-legales'].sort(),
    );
  });

  it("n'est pas dérouté par le commentaire collé sans ligne vide avant une règle", () => {
    const texte = `# Un commentaire\n# sur plusieurs lignes, collé.\n[[redirects]]\n  from = "/x"\n  to = "/index.html"\n  status = 200\n`;
    const blocs = blocsRedirects(texte);
    expect(routesDeNetlify(blocs)).toEqual(['/x']);
  });

  it('exclut le joker /* de la liste des routes nommées', () => {
    const texte = `[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;
    expect(routesDeNetlify(blocsRedirects(texte))).toEqual([]);
  });
});

describe('jokerPresent', () => {
  it('voit un joker qui réécrit tout vers /index.html en 200', () => {
    const texte = `[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;
    expect(jokerPresent(blocsRedirects(texte))).toBe(true);
  });

  it("ne confond pas le joker avec une route nommée", () => {
    expect(jokerPresent(blocsRedirects(NETLIFY_OK))).toBe(false);
  });

  it("ne confond pas le joker avec la redirection de domaine, qui vise une autre adresse", () => {
    const texte = `[[redirects]]\n  from = "https://kolek-site.netlify.app/*"\n  to = "https://kolek.cash/:splat"\n  status = 301\n  force = true\n`;
    expect(jokerPresent(blocsRedirects(texte))).toBe(false);
  });
});

describe('reproches', () => {
  it('ne trouve rien à redire quand les deux listes se répondent', () => {
    expect(reproches({ appTsx: APP_TSX_OK, liens: LIENS_OK, netlifyToml: NETLIFY_OK })).toEqual([]);
  });

  it("signale une route d'App.tsx sans règle dans netlify.toml", () => {
    const appTsx = APP_TSX_OK.replace(
      "if (chemin === CONFIDENTIALITE) return <Confidentialite />;\n",
      "if (chemin === CONFIDENTIALITE) return <Confidentialite />;\n  if (chemin === '/nouvelle-page') return <Nouvelle />;\n",
    );
    const trouves = reproches({ appTsx, liens: LIENS_OK, netlifyToml: NETLIFY_OK });
    expect(trouves.some((t) => t.includes('/nouvelle-page') && t.includes('404 en production'))).toBe(true);
  });

  it("signale une règle de netlify.toml sans route dans App.tsx", () => {
    const netlifyToml =
      NETLIFY_OK + `\n[[redirects]]\n  from = "/orpheline"\n  to = "/index.html"\n  status = 200\n`;
    const trouves = reproches({ appTsx: APP_TSX_OK, liens: LIENS_OK, netlifyToml });
    expect(trouves.some((t) => t.includes('/orpheline') && t.includes('orpheline'))).toBe(true);
  });

  it('signale le retour du joker même quand les routes nommées sont correctes', () => {
    const netlifyToml = NETLIFY_OK + `\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;
    const trouves = reproches({ appTsx: APP_TSX_OK, liens: LIENS_OK, netlifyToml });
    expect(trouves.some((t) => t.includes('joker'))).toBe(true);
  });

  it("signale une constante qu'App.tsx dispatche sans que liens.ts la résolve", () => {
    const appTsx = APP_TSX_OK.replace('MENTIONS_LEGALES', 'MENTIONS_LEGALES_RENOMMEE');
    const trouves = reproches({ appTsx, liens: LIENS_OK, netlifyToml: NETLIFY_OK });
    expect(trouves.some((t) => t.includes('MENTIONS_LEGALES_RENOMMEE'))).toBe(true);
  });
});

// --- Sous-processus, sur un faux dépôt jetable ------------------------------

const SCRIPT = fileURLToPath(new URL('./verifier-routes.mjs', import.meta.url));

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

function depotAvec({ appTsx = APP_TSX_OK, liens = LIENS_OK, netlifyToml = NETLIFY_OK } = {}) {
  dossier = mkdtempSync(join(tmpdir(), 'verifier-routes-'));
  ecrire('apps/site/src/App.tsx', appTsx);
  ecrire('apps/site/src/vitrine/liens.ts', liens);
  ecrire('apps/site/netlify.toml', netlifyToml);
  return dossier;
}

function executer(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
}

describe('en sous-processus, sur un faux dépôt', () => {
  it('réussit — code 0 — quand les deux listes se répondent', () => {
    const resultat = executer(depotAvec());
    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toMatch(/dispatchent exactement les mêmes routes/);
  });

  /**
   * La preuve demandée par la tâche 6 : casser le dépôt hors de l'arbre de
   * travail, sur une copie jetable, et vérifier que le script tombe — avant
   * de faire confiance à la version qui protège le vrai dépôt.
   *
   * Le cas reproduit ici est le défaut que la tâche nomme explicitement :
   * une page légale ajoutée à App.tsx (par une future tâche 7 ou 8, par
   * exemple) sans sa règle dans netlify.toml. Rien d'autre dans la suite
   * (`npm test`, `verifier-mentions`) ne visite netlify.toml — c'est ce
   * script, et lui seul, qui doit s'y opposer.
   */
  it('échoue — code 1 — quand une page légale perd sa règle netlify.toml', () => {
    // netlify.toml reconstruit sans le bloc /confidentialite, plutôt qu'une
    // amputation par .replace() sur NETLIFY_OK : les deux constantes passent
    // par la même conversion de fin de ligne que le reste du fichier, et une
    // recherche de sous-chaîne écrite à la main s'est déjà révélée fragile à
    // ce passage-là (CRLF d'un côté, séquence \n tapée de l'autre).
    // App.tsx, lui, dispatche toujours CONFIDENTIALITE : seul netlify.toml a
    // perdu sa règle, pour isoler le cas.
    const netlifyToml = `[[redirects]]
  from = "https://kolek-site.netlify.app/*"
  to = "https://kolek.cash/:splat"
  status = 301
  force = true

[[redirects]]
  from = "/inscription"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/mentions-legales"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/conditions"
  to = "/index.html"
  status = 200
`;
    const resultat = executer(depotAvec({ netlifyToml }));
    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toContain('/confidentialite');
    expect(resultat.stderr).toMatch(/404 en production/);
  });

  it('échoue — code 1 — quand le joker /* revient dans netlify.toml', () => {
    const netlifyToml = NETLIFY_OK + `\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;
    const resultat = executer(depotAvec({ netlifyToml }));
    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/joker/);
  });

  it("échoue — code 1 — quand l'extraction ne trouve aucune route dans App.tsx", () => {
    const resultat = executer(depotAvec({ appTsx: 'export default function App() { return null; }\n' }));
    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/Aucune route trouvée/);
  });

  it("échoue — code 1 — quand netlify.toml ne porte plus aucune règle vers /index.html", () => {
    const netlifyToml = `[[redirects]]\n  from = "https://kolek-site.netlify.app/*"\n  to = "https://kolek.cash/:splat"\n  status = 301\n  force = true\n`;
    const resultat = executer(depotAvec({ netlifyToml }));
    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/Aucune règle/);
  });
});

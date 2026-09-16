import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { admin, anonyme } from './harnais';

/**
 * Le garde-fou du registre : plus personne ne lit l'argent en direct.
 *
 * Une vue ne protège que si on l'utilise, et rien n'oblige un développeur pressé
 * à le faire. La documentation ne suffira pas : elle ne casse rien quand on
 * l'ignore. Ce fichier casse.
 *
 * Deux listes d'exemptions, chacune avec sa raison écrite. Toute lecture
 * nouvelle hors de ces listes fait tomber l'épreuve, quel que soit son auteur.
 */

const RACINE = fileURLToPath(new URL('../..', import.meta.url));

/** Les fonctions SQL qui citent `mises` ou `retraits` pour autre chose que de l'argent. */
const EXEMPTES_SQL: Record<string, string> = {
  'public.admin_reglages()':
    'Compte les lignes de chaque table : la taille de la base, pas une somme d’argent.',
  'public.mises_avant_insert()':
    'Cherche un doublon avant d’écrire, et pose les colonnes du serveur : une écriture.',
};

/** Les sources qui nomment encore `mises` ou `retraits`, et pourquoi. */
const EXEMPTES_SOURCE: Record<string, { lectures: number; raison: string }> = {
  'apps/collecteur/src/hors-ligne/envoyer.ts': {
    lectures: 1,
    raison: 'Insère la mise d’une opération de la file.',
  },
  'apps/collecteur/src/hors-ligne/rafraichir.ts': {
    lectures: 3,
    raison: 'Copie brute de la tournée ; les calculs d’argent passent par mouvementsDepuis.',
  },
  'supabase/functions/admin-supprimer-collecteur/index.ts': {
    lectures: 2,
    raison: 'Contrôle d’existence avant suppression, pour un message lisible.',
  },
  'supabase/functions/collecteur-cloturer-carte/index.ts': {
    lectures: 1,
    raison: 'Écrit le retrait de la clôture.',
  },
  'supabase/functions/collecteur-encaisser-pour/index.ts': {
    lectures: 1,
    raison: 'Écrit la mise encaissée pour un coéquipier.',
  },
};

const MOTIF = /\.from\(\s*['"`](mises|retraits)['"`]\s*\)/g;
const DOSSIERS = ['apps', 'packages', 'supabase/functions'];
const IGNORES = new Set(['node_modules', 'dist', '.vite']);

function lecturesDansLesSources(): Record<string, number> {
  const trouvees: Record<string, number> = {};

  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) {
        if (!IGNORES.has(e.name)) parcourir(chemin);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      const trouvailles = readFileSync(join(RACINE, chemin), 'utf8').match(MOTIF);
      if (trouvailles) trouvees[chemin] = trouvailles.length;
    }
  };

  for (const d of DOSSIERS) parcourir(d);
  return trouvees;
}

async function fonctionsSql(): Promise<string[]> {
  const { data, error } = await admin.rpc('lecteurs_directs_argent');
  expect(error).toBeNull();
  return ((data ?? []) as Array<{ fonction: string }>).map((l) => l.fonction);
}

describe('les fonctions SQL', () => {
  it('trouve les exemptées, avant de juger', async () => {
    // Le contrôle qui protège le suivant : une liste vide se lit « aucune
    // faute » alors qu'elle peut vouloir dire « je ne vois plus rien » —
    // motif cassé, fonction renommée, schéma déplacé.
    const fonctions = await fonctionsSql();

    for (const exemptee of Object.keys(EXEMPTES_SQL)) expect(fonctions).toContain(exemptee);
  });

  it('n’en laisse aucune autre lire mises ou retraits', async () => {
    const fonctions = await fonctionsSql();

    expect(fonctions.filter((f) => !(f in EXEMPTES_SQL))).toEqual([]);
  });

  it('n’est pas exécutable depuis un navigateur', async () => {
    const { error } = await anonyme.rpc('lecteurs_directs_argent');

    expect(error).not.toBeNull();
  });
});

describe('les sources', () => {
  it('trouve les lectures exemptées, avant de juger', () => {
    expect(Object.keys(lecturesDansLesSources()).sort()).toEqual(Object.keys(EXEMPTES_SOURCE).sort());
  });

  it('n’en laisse aucune autre nommer mises ou retraits', () => {
    const attendu = Object.fromEntries(
      Object.entries(EXEMPTES_SOURCE).map(([fichier, e]) => [fichier, e.lectures]),
    );

    expect(lecturesDansLesSources()).toEqual(attendu);
  });
});

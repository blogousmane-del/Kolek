import { describe, expect, it } from 'vitest';

import { analyser, extraireJson } from './verifier-migrations.mjs';

/**
 * Le contrôle de dérive du schéma.
 *
 * Les deux fonctions testées ici sont pures : c'est pour ça qu'elles sont
 * séparées de l'appel au CLI. Un contrôle qui exige un projet lié pour être
 * vérifié n'est vérifié par personne.
 */

const FICHIERS = [
  '20260901090000_mise_sans_plafond.sql',
  '20260902100000_collaborateurs_rattachement.sql',
];

describe('extraction de la réponse du CLI', () => {
  it('ignore les lignes que le CLI écrit avant sa charge utile', () => {
    // `Connecting to local database...` précède le JSON. Un `JSON.parse` de la
    // sortie entière échouerait, et le contrôle passerait pour cassé plutôt que
    // pour rouge.
    const sortie = ['Connecting to remote database...', '{"migrations":[],"message":"ok"}'].join(
      '\n',
    );
    expect(extraireJson(sortie).migrations).toEqual([]);
  });

  it('refuse une sortie qui ne porte pas de liste, plutôt que de la lire comme vide', () => {
    // Le cas d'un projet non lié. Rendre « aucune migration manquante » ici
    // serait le pire résultat possible : un feu vert tiré d'une absence de
    // réponse.
    expect(() => extraireJson('Cannot find project ref.')).toThrow(/link/);
  });
});

describe('verdict sur la dérive', () => {
  it('se tait quand les deux côtés portent la même chose', () => {
    const charge = {
      migrations: [{ local: '20260901090000', remote: '20260901090000' }],
    };
    expect(analyser(charge, FICHIERS)).toEqual({ manquantes: [], inconnues: [] });
  });

  it('nomme le fichier d’une migration jamais appliquée', () => {
    // Le cas du 2026-09-02. Rendre l'horodatage seul obligerait à ouvrir le
    // dossier pour savoir de quoi on parle ; le nom dit la conséquence.
    const charge = {
      migrations: [
        { local: '20260901090000', remote: '' },
        { local: '20260902100000', remote: '20260902100000' },
      ],
    };
    expect(analyser(charge, FICHIERS).manquantes).toEqual([
      '20260901090000_mise_sans_plafond.sql',
    ]);
  });

  it('signale aussi une migration appliquée là-bas et absente ici', () => {
    // Plus rare et plus grave : la base porte quelque chose que personne ne
    // peut relire. Ne regarder que le sens « manquantes » laisserait ce cas
    // muet.
    const charge = { migrations: [{ local: '', remote: '20260830999999' }] };
    expect(analyser(charge, FICHIERS)).toEqual({
      manquantes: [],
      inconnues: ['20260830999999'],
    });
  });

  it('retombe sur l’horodatage quand le fichier a disparu du dépôt', () => {
    const charge = { migrations: [{ local: '20261231120000', remote: '' }] };
    expect(analyser(charge, FICHIERS).manquantes).toEqual(['20261231120000']);
  });
});

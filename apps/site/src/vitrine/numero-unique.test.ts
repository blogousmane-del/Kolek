import { describe, expect, it } from 'vitest';

import { IDENTITE } from './legal/identite';
import { WHATSAPP } from './liens';

/**
 * Le numéro de l'exploitant ne s'écrit qu'à un seul endroit.
 *
 * `identite.ts` s'ouvre sur la règle : « Deux copies d'un nom ou d'un numéro
 * finissent par diverger. » Elle a pourtant été enfreinte pour ce numéro-là
 * jusqu'au 2026-09-19 — `liens.ts` portait les mêmes chiffres en dur, et le
 * champ `IDENTITE.whatsapp` n'avait aucun lecteur. Le fait d'identité était le
 * mort, la copie le vivant.
 *
 * Aucune garde existante ne pouvait le voir : `verifier:mentions` contrôle
 * qu'un champ est renseigné, pas qu'il est lu, et une épreuve qui recopie le
 * numéro dans son attente devient la troisième copie au lieu de la sonde.
 *
 * D'où cette lecture des sources : les chiffres nus n'apparaissent que dans
 * `legal/identite.ts`. Partout ailleurs, on passe par le fait.
 */

const SOURCES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('le numéro de l’exploitant', () => {
  it('ne s’écrit en chiffres nus que dans identite.ts', () => {
    const chiffres = IDENTITE.whatsapp;
    expect(chiffres, 'sans numéro, cette épreuve ne mesure rien').toBeTruthy();

    const porteurs = Object.entries(SOURCES)
      .filter(([, source]) => source.includes(chiffres as string))
      .map(([chemin]) => chemin.replace('./', ''))
      .sort();

    // Témoin : la sonde doit trouver au moins la source qui fait autorité,
    // sinon c'est la lecture qui est muette, pas le dépôt qui est propre.
    expect(porteurs).toEqual(['legal/identite.ts']);
  });

  it('se rend en lien wa.me sans jamais le recopier', () => {
    expect(WHATSAPP).toBe(`https://wa.me/${IDENTITE.whatsapp}`);
  });
});

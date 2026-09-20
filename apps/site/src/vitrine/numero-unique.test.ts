import { describe, expect, it } from 'vitest';

import { IDENTITE } from './legal/identite';
import { WHATSAPP } from './liens';

/**
 * Le numéro de l'exploitant ne s'écrit qu'une fois, et sous une seule forme.
 *
 * `identite.ts` s'ouvre sur la règle : « Deux copies d'un nom ou d'un numéro
 * finissent par diverger. » Elle a été enfreinte deux fois pour ce numéro-là.
 *
 * Le 2026-09-19 : `liens.ts` portait `https://wa.me/…` en dur avec les chiffres
 * recopiés, pendant que le champ `IDENTITE.whatsapp` n'avait aucun lecteur — le
 * fait d'identité était le mort, la copie le vivant.
 *
 * Le 2026-09-20 : le champ `whatsapp` lui-même était une seconde écriture du
 * numéro de `telephone`, en chiffres nus. Deux formes d'un seul fait, tenues
 * d'accord à la main. Il est parti ; le lien se déduit.
 *
 * Aucune garde existante ne voyait ni l'une ni l'autre : `verifier:mentions`
 * contrôle qu'un champ est renseigné, pas qu'il est lu, ni qu'il est seul.
 */

const SOURCES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function porteursDe(aiguille: string): string[] {
  return Object.entries(SOURCES)
    .filter(([, source]) => source.includes(aiguille))
    .map(([chemin]) => chemin.replace('./', ''))
    .sort();
}

describe('le numéro de l’exploitant', () => {
  const lisible = IDENTITE.telephone as string;
  const nus = lisible.replace(/\D/g, '');

  it('ne s’écrit que dans identite.ts, et sous sa seule forme lisible', () => {
    expect(lisible, 'sans numéro, cette épreuve ne mesure rien').toBeTruthy();

    // Témoin positif : la sonde doit trouver la source qui fait autorité,
    // sinon c'est la lecture qui est muette, pas le dépôt qui est propre.
    expect(porteursDe(lisible)).toEqual(['legal/identite.ts']);
  });

  it('n’existe nulle part en chiffres nus : cette forme se calcule', () => {
    expect(nus).toHaveLength(13);
    expect(porteursDe(nus)).toEqual([]);
  });

  it('se rend en lien wa.me sans jamais être recopié', () => {
    expect(WHATSAPP).toBe(`https://wa.me/${nus}`);
  });
});

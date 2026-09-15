import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { operationMise } from './fabriques';
import { mettreAJour } from './file';
import { fermerBases, ouvrirBase } from './stockage-local';

/**
 * Rien n'est « fait » avant d'être sur le disque (spec J2b §4.1).
 *
 * Depuis Chrome 121, une transaction IndexedDB se termine par défaut quand la
 * donnée est remise au système, pas quand elle est écrite : une coupure franche
 * d'alimentation dans les secondes qui suivent peut perdre ce que l'écran a déjà
 * montré. `durability: 'strict'` fait attendre le disque. Décision de
 * l'exploitant, 2026-09-15, après la revue finale de J2b.
 */

/** Les sources du hors-ligne, épreuves exclues, lues telles quelles par Vite. */
const SOURCES = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('les écritures du téléphone attendent le disque (§4.1)', () => {
  it('passe l’écriture stricte jusqu’à IndexedDB', async () => {
    const base = await ouvrirBase('col-1');
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');

    await mettreAJour(base, operationMise(1, { carteId: 'k1' }));

    expect(transaction).toHaveBeenCalledWith('file', 'readwrite', { durability: 'strict' });
  });

  it('la demande à chaque transaction qui écrit, dans tout le hors-ligne', () => {
    // Une écriture ajoutée demain sans l'option retomberait dans le défaut du
    // navigateur sans qu'aucune épreuve de comportement ne le voie : fake-indexeddb
    // n'a pas de disque.
    const ecritures = Object.entries(SOURCES).flatMap(([nom, source]) =>
      [...source.matchAll(/\.transaction\(([^)]*)\)/g)]
        .map((m) => ({ nom, appel: m[1]!.replace(/\s+/g, ' ') }))
        .filter((e) => e.appel.includes("'readwrite'")),
    );

    // file.ts (6), stockage-local.ts (2), rafraichir.ts (1).
    expect(ecritures).toHaveLength(9);
    expect(ecritures.filter((e) => !e.appel.includes("durability: 'strict'"))).toEqual([]);
  });
});

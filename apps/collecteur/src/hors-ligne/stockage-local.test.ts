import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { carte, client, operationMise, tournee } from './fabriques';
import {
  CLE_INSTANTANE,
  CLE_PROFIL,
  compterFile,
  compterOperationsSurCeTelephone,
  dans,
  demanderPersistance,
  effacerDonneesDeTournee,
  fermerBases,
  lireOperations,
  lireProfil,
  lireRefus,
  lireTournee,
  modifierInstantane,
  nomBase,
  ouvrirBase,
} from './stockage-local';

beforeEach(async () => {
  await fermerBases();
  // Une fabrique neuve par épreuve : aucune base ne survit d'une épreuve à l'autre.
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PROFIL = {
  nom: 'Awa',
  telephone: '+2250700000000',
  zone: null,
  palier: 'pro',
  abonnementStatut: 'actif',
  abonnementEcheance: null,
  titulaireId: null,
  lueLe: '2026-09-13T09:00:00.000Z',
};

describe('une base par collecteur (§5.1)', () => {
  it('se nomme d’après le collecteur', () => {
    expect(nomBase('abc')).toBe('kolek-collecteur-abc');
  });

  it('porte les quatre espaces de la spec', async () => {
    const base = await ouvrirBase('a');
    expect([...base.objectStoreNames].sort()).toEqual(['file', 'profil', 'refus', 'tournee']);
  });

  it('n’ouvre jamais la base d’un autre collecteur', async () => {
    const a = await ouvrirBase('a');
    await a.add('file', operationMise(1, { carteId: 'k1' }));

    const b = await ouvrirBase('b');

    expect(await compterFile(a)).toBe(1);
    expect(await compterFile(b)).toBe(0);
  });

  it('rend la même base à deux appels', async () => {
    expect(await ouvrirBase('a')).toBe(await ouvrirBase('a'));
  });
});

describe('lire', () => {
  it('rend une tournée vide et une file vide sur un téléphone neuf', async () => {
    const base = await ouvrirBase('a');
    expect(await lireTournee(base)).toEqual({
      tournee: { clients: [], cartes: [], mises: [], retraits: [], caisses: [], lueLe: null },
      operations: [],
    });
  });

  it('montre l’instantané avec la file réappliquée', async () => {
    const base = await ouvrirBase('a');
    await base.put('tournee', tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] }), CLE_INSTANTANE);
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    const { tournee: t, operations } = await lireTournee(base);

    expect(t.cartes[0]!.misesEncaissees).toBe(1);
    expect(operations).toHaveLength(1);
  });

  it('rend la file dans l’ordre des séquences', async () => {
    const base = await ouvrirBase('a');
    await base.add('file', operationMise(3, { carteId: 'k1' }));
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    expect((await lireOperations(base)).map((o) => o.sequence)).toEqual([1, 3]);
  });

  it('rend le profil et les refus gardés', async () => {
    const base = await ouvrirBase('a');
    expect(await lireProfil(base)).toBeNull();
    await base.put('profil', PROFIL, CLE_PROFIL);

    expect(await lireProfil(base)).toEqual(PROFIL);
    expect(await lireRefus(base)).toEqual([]);
  });
});

describe('une transaction avortée ne laisse rien (durcissement après relecture)', () => {
  it('avorte l’écriture quand le travail échoue : rien ne reste sur le disque', async () => {
    const base = await ouvrirBase('a');
    const tx = base.transaction('tournee', 'readwrite');

    await expect(
      dans(tx, async () => {
        await tx.store.put(tournee(), CLE_INSTANTANE);
        throw new Error('panne');
      }),
    ).rejects.toThrow('panne');

    expect((await lireTournee(base)).tournee.lueLe).toBeNull();
  });
});

describe('ce qui survit, et ce qui s’efface', () => {
  it('garde tout à la réouverture — un rechargement de la page ne perd rien', async () => {
    const base = await ouvrirBase('a');
    await base.add('file', operationMise(1, { carteId: 'k1' }));
    await fermerBases();

    expect(await compterFile(await ouvrirBase('a'))).toBe(1);
  });

  it('efface tournée, profil et refus à la déconnexion, et garde la file', async () => {
    const base = await ouvrirBase('a');
    await base.put('tournee', tournee({ clients: [client('c1')] }), CLE_INSTANTANE);
    await base.put('profil', PROFIL, CLE_PROFIL);
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    await effacerDonneesDeTournee(base);

    expect((await lireTournee(base)).tournee.clients).toEqual([]);
    expect(await lireProfil(base)).toBeNull();
    expect(await compterFile(base)).toBe(1);
  });

  it('modifie l’instantané en une écriture', async () => {
    const base = await ouvrirBase('a');
    await base.put('tournee', tournee({ clients: [client('c1')] }), CLE_INSTANTANE);

    await modifierInstantane(base, (t) => {
      t.clients[0]!.nom = 'Awa Traoré';
    });

    expect((await lireTournee(base)).tournee.clients[0]!.nom).toBe('Awa Traoré');
  });
});

describe('compter sans rien lire (§8.6)', () => {
  it('additionne les files de tous les collecteurs du téléphone', async () => {
    const a = await ouvrirBase('a');
    const b = await ouvrirBase('b');
    await a.add('file', operationMise(1, { carteId: 'k1' }));
    await a.add('file', operationMise(2, { carteId: 'k1' }));
    await b.add('file', operationMise(1, { carteId: 'k2' }));

    expect(await compterOperationsSurCeTelephone()).toBe(3);
  });

  it('se tait là où le navigateur ne sait pas lister ses bases', async () => {
    vi.stubGlobal('indexedDB', { databases: undefined });
    expect(await compterOperationsSurCeTelephone()).toBeNull();
  });

  it('ne crée pas de base pour un nom disparu entre la liste et l’ouverture (durcissement après relecture)', async () => {
    const espion = vi
      .spyOn(indexedDB, 'databases')
      .mockResolvedValue([{ name: 'kolek-collecteur-fantome', version: 1 }]);

    expect(await compterOperationsSurCeTelephone()).toBe(0);

    espion.mockRestore();
    expect((await indexedDB.databases()).some((d) => d.name === 'kolek-collecteur-fantome')).toBe(false);
  });
});

describe('le stockage persistant (§4.6)', () => {
  it('dit « inconnu » là où l’API manque, plutôt que d’inquiéter à tort', async () => {
    vi.stubGlobal('navigator', {});
    expect(await demanderPersistance()).toBe('inconnu');
  });

  it('ne redemande pas ce qui est déjà accordé', async () => {
    const persist = vi.fn();
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist } });
    expect(await demanderPersistance()).toBe('persistant');
    expect(persist).not.toHaveBeenCalled();
  });

  it('dit « non garanti » quand le navigateur refuse', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => false } });
    expect(await demanderPersistance()).toBe('non_garanti');
  });
});

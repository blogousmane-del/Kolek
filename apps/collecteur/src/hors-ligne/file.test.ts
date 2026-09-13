import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { carte, client, operationMise, tournee } from './fabriques';
import { ajouter, annuler, avancer, mettreAJour, retirerAcceptee, retirerEnRefus } from './file';
import { construireMise } from './gestes';
import type { OperationMise } from './modele';
import {
  CLE_INSTANTANE,
  compterFile,
  fermerBases,
  lireOperations,
  lireRefus,
  lireTournee,
  ouvrirBase,
} from './stockage-local';

const MAINTENANT = Date.parse('2026-09-13T10:00:00.000Z');

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

async function baseAvecUneCarte() {
  const base = await ouvrirBase('col-1');
  await base.put('tournee', tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] }), CLE_INSTANTANE);
  return base;
}

const mise = (sursisMs?: number) =>
  construireMise(
    { collecteurId: 'col-1', maintenant: MAINTENANT, sursisMs },
    { carteId: 'k1', montant: 1000, encaisseLe: new Date(MAINTENANT) },
  );

describe('ajouter', () => {
  it('écrit l’opération, et la tournée lue la montre aussitôt', async () => {
    const base = await baseAvecUneCarte();

    const r = await ajouter(base, mise());

    expect(r.ok).toBe(true);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(1);
  });

  it('numérote les opérations dans l’ordre du geste', async () => {
    const base = await baseAvecUneCarte();
    for (let i = 0; i < 3; i += 1) await ajouter(base, mise());

    expect((await lireOperations(base)).map((o) => o.sequence)).toEqual([1, 2, 3]);
  });

  it('vérifie le geste contre la tournée file comprise : la 32e mise est refusée', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 30 })] }), CLE_INSTANTANE);

    expect((await ajouter(base, mise())).ok).toBe(true);
    expect(await ajouter(base, mise())).toMatchObject({ ok: false, echec: { code: 'CYCLE_COMPLET' } });
    expect(await compterFile(base)).toBe(1);
  });

  it('n’écrit rien et ne montre rien quand le disque refuse (§4.1)', async () => {
    const base = await baseAvecUneCarte();
    // Une fonction ne se clone pas : l'ajout échoue dans la transaction, comme
    // sur un disque plein.
    const empoisonnee = (() => {
      const r = mise()(tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] }), [], 1);
      if (!r.ok) throw new Error('fabrique');
      return { ...r.operation, charge: { ...r.operation.charge, montant: (() => 1000) as unknown as number } };
    })();

    const r = await ajouter(base, () => ({ ok: true, operation: empoisonnee }));

    expect(r).toMatchObject({ ok: false, echec: { code: 'STOCKAGE' } });
    expect(await compterFile(base)).toBe(0);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(0);
  });
});

describe('le sursis (§7)', () => {
  it('« Annuler » avant l’échéance retire l’opération, et la case se revide', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise(6000));
    if (!r.ok) throw new Error('ajout');

    expect(await annuler(base, r.operation.id, MAINTENANT + 3000)).toBe('annulee');
    expect(await compterFile(base)).toBe(0);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(0);
  });

  it('refuse d’annuler une opération dont l’heure est passée', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise(6000));
    if (!r.ok) throw new Error('ajout');

    expect(await annuler(base, r.operation.id, MAINTENANT + 6000)).toBe('partie');
    expect(await compterFile(base)).toBe(1);
  });

  it('dit « absente » d’une opération déjà sortie de la file', async () => {
    expect(await annuler(await baseAvecUneCarte(), 'op-inconnue', MAINTENANT)).toBe('absente');
  });

  it('garde l’opération quand la page se recharge pendant le sursis (écart 4)', async () => {
    const base = await baseAvecUneCarte();
    await ajouter(base, mise(6000));

    await fermerBases();
    const rouverte = await ouvrirBase('col-1');

    expect(await compterFile(rouverte)).toBe(1);
    expect((await lireTournee(rouverte)).tournee.cartes[0]!.misesEncaissees).toBe(1);
  });

  it('« avancer » fait partir tout de suite, et ne recule jamais une échéance passée', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise(6000));
    if (!r.ok) throw new Error('ajout');

    await avancer(base, r.operation.id, MAINTENANT + 1000);
    expect((await lireOperations(base))[0]!.envoyableApres).toBe('2026-09-13T10:00:01.000Z');

    await avancer(base, r.operation.id, MAINTENANT + 2000);
    expect((await lireOperations(base))[0]!.envoyableApres).toBe('2026-09-13T10:00:01.000Z');
  });
});

describe('quitter la file', () => {
  it('ne ressuscite pas une opération annulée', async () => {
    const base = await baseAvecUneCarte();
    const op = operationMise(1, { carteId: 'k1' });

    await mettreAJour(base, op);

    expect(await compterFile(base)).toBe(0);
  });

  it('acceptée : quitte la file et entre dans l’instantané, ensemble', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise());
    if (!r.ok) throw new Error('ajout');

    await retirerAcceptee(base, r.operation);

    expect(await compterFile(base)).toBe(0);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(1);
  });

  it('acceptée mais l’instantané ne s’écrit pas : l’opération reste en file', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise());
    if (!r.ok) throw new Error('ajout');
    const empoisonnee: OperationMise = {
      ...r.operation,
      charge: { ...r.operation.charge, encaisseLe: (() => 'x') as unknown as string },
    };

    await expect(retirerAcceptee(base, empoisonnee)).rejects.toThrow();

    expect(await compterFile(base)).toBe(1);
  });

  it('refusée et consignée : quitte la file, sa copie reste lisible', async () => {
    const base = await baseAvecUneCarte();
    const op = operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' });
    await base.add('file', op);

    await retirerEnRefus(base, op, MAINTENANT);

    expect(await compterFile(base)).toBe(0);
    expect(await lireRefus(base)).toEqual([
      {
        id: 'op-1',
        motif: 'CARTE_CLOTUREE',
        chargeUtile: {
          version: 1,
          type: 'mise',
          charge: op.charge,
          faiteLe: op.faiteLe,
          sequence: 1,
          dependDe: [],
        },
        creeLe: '2026-09-13T10:00:00.000Z',
      },
    ]);
  });
});

describe('deux collecteurs sur un téléphone (§4.5)', () => {
  it('ne voient jamais la file l’un de l’autre', async () => {
    const a = await baseAvecUneCarte();
    await ajouter(a, mise());

    const b = await ouvrirBase('col-2');

    expect(await compterFile(b)).toBe(0);
    expect((await lireTournee(b)).tournee.cartes).toEqual([]);
  });
});

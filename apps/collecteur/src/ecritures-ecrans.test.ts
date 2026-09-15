import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { caisse, carte, client, tournee } from './hors-ligne/fabriques';
import { CLE_INSTANTANE, fermerBases, lireOperations, lireTournee, ouvrirBase } from './hors-ligne/stockage-local';

const invoke = vi.fn();
const demanderRafraichissement = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock('./hors-ligne/moteur', () => ({
  apresGeste: () => {},
  collecteurCourant: () => 'col-1',
  demanderRafraichissement: () => demanderRafraichissement(),
}));

const { cloturerCarte, declarerCaisse } = await import('./ecritures-ecrans');

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  invoke.mockReset();
  demanderRafraichissement.mockReset();
});

describe('déclarer la caisse (§6.4)', () => {
  it('met la déclaration en file, sous l’identifiant de la ligne du jour', async () => {
    const base = await ouvrirBase('col-1');
    await base.put(
      'tournee',
      tournee({ caisses: [caisse({ id: 'ligne-du-jour', date: '2026-09-13', cashDeclare: 3000 })] }),
      CLE_INSTANTANE,
    );

    expect(await declarerCaisse('col-1', '2026-09-13', 5000)).toEqual({ ok: true });

    const [op] = await lireOperations(base);
    expect(op).toMatchObject({
      type: 'caisse',
      charge: { id: 'ligne-du-jour', date: '2026-09-13', cashDeclare: 5000 },
    });
  });

  it('refuse un montant négatif sans rien écrire', async () => {
    expect(await declarerCaisse('col-1', '2026-09-13', -1)).toMatchObject({
      ok: false,
      echec: { code: 'CAISSE_INVALIDE' },
    });
    expect(await lireOperations(await ouvrirBase('col-1'))).toEqual([]);
  });
});

describe('clôturer une carte, et le dire à la tournée', () => {
  it('porte la clôture et le retrait dans l’instantané, puis demande la relecture', async () => {
    const base = await ouvrirBase('col-1');
    await base.put(
      'tournee',
      tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 31 })] }),
      CLE_INSTANTANE,
    );
    invoke.mockResolvedValue({ data: { montantRestitue: 30000, commission: 1000 }, error: null });

    expect(await cloturerCarte('k1')).toEqual({ ok: true, montantRestitue: 30000, commission: 1000 });

    const { tournee: t } = await lireTournee(base);
    // Sans ce report, la tournée proposerait d'encaisser sur une carte que le
    // serveur refusera, jusqu'au prochain rafraîchissement.
    expect(t.cartes[0]).toMatchObject({ statut: 'cloturee' });
    expect(t.retraits).toMatchObject([{ carteId: 'k1', montantRestitue: 30000 }]);
    expect(demanderRafraichissement).toHaveBeenCalled();
  });

  it('ne touche pas la tournée quand la clôture échoue', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] }), CLE_INSTANTANE);
    invoke.mockResolvedValue({ data: { erreur: 'CLOTURE_PARTIELLE' }, error: null });

    expect(await cloturerCarte('k1')).toMatchObject({ ok: false, echec: { code: 'CLOTURE_PARTIELLE' } });

    expect((await lireTournee(base)).tournee.cartes[0]).toMatchObject({ statut: 'active' });
  });
});

import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const { cloturerCarte, declarerCaisse, encaisserPour } = await import('./ecritures-ecrans');

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  invoke.mockReset();
  demanderRafraichissement.mockReset();
  // La clôture date sa sortie de caisse à l'heure du téléphone. `Date` seul est
  // figé : fake-indexeddb garde ses vrais minuteurs.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-13T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
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
  const duJour = () => caisse({ date: '2026-09-13', cashAttendu: 50000, cashDeclare: 50000, ecart: 0 });

  it('porte la clôture, le retrait et la sortie de caisse dans l’instantané, puis demande la relecture', async () => {
    const base = await ouvrirBase('col-1');
    await base.put(
      'tournee',
      tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 31 })], caisses: [duJour()] }),
      CLE_INSTANTANE,
    );
    invoke.mockResolvedValue({ data: { montantRestitue: 30000, commission: 1000 }, error: null });

    expect(await cloturerCarte('k1')).toEqual({ ok: true, montantRestitue: 30000, commission: 1000 });

    const { tournee: t } = await lireTournee(base);
    // Sans ce report, la tournée proposerait d'encaisser sur une carte que le
    // serveur refusera, jusqu'au prochain rafraîchissement.
    expect(t.cartes[0]).toMatchObject({ statut: 'cloturee' });
    expect(t.retraits).toMatchObject([{ carteId: 'k1', montantRestitue: 30000, restituePar: 'col-1' }]);
    // `caisses_rafraichir_apres_retrait`, repris : l'argent rendu sort de la caisse du jour.
    expect(t.caisses[0]).toMatchObject({ cashAttendu: 20000, ecart: null });
    expect(demanderRafraichissement).toHaveBeenCalled();
  });

  it('ne sort pas deux fois de la caisse un retrait que la tournée porte déjà', async () => {
    const base = await ouvrirBase('col-1');
    await base.put(
      'tournee',
      tournee({
        clients: [client('c1')],
        cartes: [carte('k1', 'c1', { misesEncaissees: 31 })],
        retraits: [
          { id: 'r-serveur', carteId: 'k1', montantRestitue: 30000, effectueLe: '2026-09-13T11:00:00.000Z', restituePar: 'col-1' },
        ],
        caisses: [caisse({ date: '2026-09-13', cashAttendu: 20000, cashDeclare: 20000, ecart: 0 })],
      }),
      CLE_INSTANTANE,
    );
    invoke.mockResolvedValue({ data: { montantRestitue: 30000, commission: 1000 }, error: null });

    await cloturerCarte('k1');

    const { tournee: t } = await lireTournee(base);
    expect(t.retraits.map((r) => r.id)).toEqual(['r-serveur']);
    expect(t.caisses[0]).toMatchObject({ cashAttendu: 20000 });
  });

  it('sur la carte d’un coéquipier, oublie l’écart du jour sans rien recompter', async () => {
    // La carte n'est pas dans cette tournée, mais l'argent sort de cette
    // sacoche-ci : le serveur a changé la ligne, pas la tournée.
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ caisses: [duJour()] }), CLE_INSTANTANE);
    invoke.mockResolvedValue({ data: { montantRestitue: 30000, commission: 1000 }, error: null });

    await cloturerCarte('k-awa');

    const { tournee: t } = await lireTournee(base);
    expect(t.retraits).toEqual([]);
    expect(t.caisses[0]).toMatchObject({ cashAttendu: 50000, ecart: null });
    expect(demanderRafraichissement).toHaveBeenCalled();
  });

  it('partielle, ne ferme pas la carte, oublie l’écart du jour et relit la tournée', async () => {
    const base = await ouvrirBase('col-1');
    await base.put(
      'tournee',
      tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')], caisses: [duJour()] }),
      CLE_INSTANTANE,
    );
    invoke.mockResolvedValue({ data: { erreur: 'CLOTURE_PARTIELLE' }, error: null });

    expect(await cloturerCarte('k1')).toMatchObject({ ok: false, echec: { code: 'CLOTURE_PARTIELLE' } });

    const { tournee: t } = await lireTournee(base);
    expect(t.cartes[0]).toMatchObject({ statut: 'active' });
    expect(t.caisses[0]).toMatchObject({ cashAttendu: 50000, ecart: null });
    expect(demanderRafraichissement).toHaveBeenCalled();
  });

  it('refusée ou sans réponse, relit la tournée et oublie l’écart du jour', async () => {
    // Carte fermée ailleurs, ou réponse perdue après la fermeture : la tournée
    // ne doit pas garder pour active une carte que le serveur a peut-être close.
    const base = await ouvrirBase('col-1');
    await base.put(
      'tournee',
      tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')], caisses: [duJour()] }),
      CLE_INSTANTANE,
    );
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ erreur: 'CARTE_DEJA_CLOTUREE' }), { status: 409 }) },
    });

    expect(await cloturerCarte('k1')).toMatchObject({ ok: false, echec: { code: 'CARTE_DEJA_CLOTUREE' } });

    const { tournee: t } = await lireTournee(base);
    expect(t.cartes[0]).toMatchObject({ statut: 'active' });
    expect(t.caisses[0]).toMatchObject({ cashAttendu: 50000, ecart: null });
    expect(demanderRafraichissement).toHaveBeenCalled();
  });
});

describe('encaisser pour un coéquipier, et le dire à la caisse', () => {
  const duJour = () => caisse({ date: '2026-09-13', cashAttendu: 5000, cashDeclare: 5000, ecart: 0 });

  it('oublie l’écart du jour et demande la relecture : le serveur compte cet argent dans cette caisse', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ caisses: [duJour()] }), CLE_INSTANTANE);
    invoke.mockResolvedValue({ data: { miseId: 'x' }, error: null });

    expect(await encaisserPour('k-awa', 1000, new Date('2026-09-13T11:00:00.000Z'))).toMatchObject({ ok: true });

    // Rien n'est recompté : un rechargement concurrent a pu déjà porter la
    // mise, et l'ajouter ici la compterait deux fois.
    expect((await lireTournee(base)).tournee.caisses[0]).toMatchObject({ cashAttendu: 5000, ecart: null });
    expect(demanderRafraichissement).toHaveBeenCalled();
  });

  it('sans réponse, fait de même : l’argent a pu être compté', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ caisses: [duJour()] }), CLE_INSTANTANE);
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });

    expect(await encaisserPour('k-awa', 1000, new Date('2026-09-13T11:00:00.000Z'))).toMatchObject({ ok: false });

    expect((await lireTournee(base)).tournee.caisses[0]).toMatchObject({ cashAttendu: 5000, ecart: null });
    expect(demanderRafraichissement).toHaveBeenCalled();
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

let col: CollecteurTest;

beforeAll(async () => {
  col = await creerCollecteur('Aminata Bamba', `+225076${Date.now() % 10000000}`);
});

describe('caisses_jour', () => {
  it('calcule l’écart en colonne générée', async () => {
    const { data, error } = await admin
      .from('caisses_jour')
      .insert({
        collecteur_id: col.id,
        date: '2026-08-15',
        cash_attendu: 45000,
        cash_declare: 44000,
      })
      .select('ecart')
      .single();

    expect(error).toBeNull();
    expect(data!.ecart).toBe(-1000);
  });

  it('refuse deux caisses pour le même collecteur le même jour', async () => {
    const { error } = await admin.from('caisses_jour').insert({
      collecteur_id: col.id,
      date: '2026-08-15',
      cash_attendu: 1,
      cash_declare: 1,
    });
    expect(error!.code).toBe('23505');
  });
});

describe('synchro_rejets', () => {
  it('conserve la charge utile intégrale d’une mise refusée', async () => {
    const charge = { id: crypto.randomUUID(), carte_id: crypto.randomUUID(), montant: 1000 };

    const { data, error } = await admin
      .from('synchro_rejets')
      .insert({ collecteur_id: col.id, charge_utile: charge, motif: 'CARTE_CLOTUREE' })
      .select('charge_utile, motif, traite')
      .single();

    expect(error).toBeNull();
    expect(data!.charge_utile).toEqual(charge);
    expect(data!.traite).toBe(false);
  });
});

describe('journal d’audit', () => {
  it('journalise chaque mise encaissée', async () => {
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    const miseId = crypto.randomUUID();

    await admin.from('clients').insert({ id: clientId, collecteur_id: col.id, nom: 'Kadi' });
    await admin
      .from('cartes')
      .insert({ id: carteId, collecteur_id: col.id, client_id: clientId, mise: 2000 });
    await admin.from('mises').insert({
      id: miseId,
      collecteur_id: col.id,
      carte_id: carteId,
      montant: 2000,
      encaisse_le: new Date().toISOString(),
    });

    const { data } = await admin
      .from('audit_log')
      .select('table_cible, action, ligne_id')
      .eq('ligne_id', miseId);

    expect(data).toHaveLength(1);
    expect(data![0]!.table_cible).toBe('mises');
    expect(data![0]!.action).toBe('insert');
  });

  it('journalise aussi l’ouverture d’une carte', async () => {
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: col.id, nom: 'Salif' });
    await admin
      .from('cartes')
      .insert({ id: carteId, collecteur_id: col.id, client_id: clientId, mise: 500 });

    const { data } = await admin.from('audit_log').select('table_cible').eq('ligne_id', carteId);
    expect(data![0]!.table_cible).toBe('cartes');
  });
});

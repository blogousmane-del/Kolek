import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

let col: CollecteurTest;

beforeAll(async () => {
  col = await creerCollecteur('Aminata Bamba', `+225076${Date.now() % 10000000}`);
});

/** Date UTC du jour, au format attendu par une colonne `date`. */
function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Encaisse une mise sur une carte neuve du collecteur, et renvoie le montant. */
async function encaisser(collecteurId: string, montant: number): Promise<void> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  await admin.from('clients').insert({ id: clientId, collecteur_id: collecteurId, nom: 'Caisse' });
  await admin
    .from('cartes')
    .insert({ id: carteId, collecteur_id: collecteurId, client_id: clientId, mise: montant });
  await admin.from('mises').insert({
    id: crypto.randomUUID(),
    collecteur_id: collecteurId,
    carte_id: carteId,
    montant,
    encaisse_le: new Date().toISOString(),
  });
}

describe('caisses_jour', () => {
  // Le rapprochement de caisse est l'instrument qui détecte un manquant. Son
  // terme de gauche ne peut donc pas venir de la personne qu'il contrôle.
  let caisse: string;

  it('ignore le cash_attendu envoyé par le client et le calcule depuis les mises', async () => {
    await encaisser(col.id, 2000);
    await encaisser(col.id, 3000);

    const { data, error } = await admin
      .from('caisses_jour')
      .insert({
        collecteur_id: col.id,
        date: aujourdhui(),
        cash_attendu: 45000, // tentative de masquage : ignorée
        cash_declare: 4000,
      })
      .select('id, cash_attendu, ecart')
      .single();

    expect(error).toBeNull();
    expect(data!.cash_attendu).toBe(5000);
    expect(data!.ecart).toBe(-1000); // 4 000 déclarés contre 5 000 encaissés
    caisse = data!.id;
  });

  it('recalcule l’attendu quand une mise du jour arrive après la clôture', async () => {
    // Cadrage J2 : une mise synchronisée en retard, datée du jour clôturé, doit
    // refermer l'écart d'elle-même. Un attendu figé le laisserait faux à jamais.
    await encaisser(col.id, 1000);

    const { data } = await admin
      .from('caisses_jour')
      .select('cash_attendu, ecart')
      .eq('id', caisse)
      .single();

    expect(data!.cash_attendu).toBe(6000);
    expect(data!.ecart).toBe(-2000);
  });

  it('journalise l’ouverture puis la correction d’une caisse', async () => {
    await admin.from('caisses_jour').update({ cash_declare: 6000 }).eq('id', caisse);

    const { data } = await admin
      .from('audit_log')
      .select('table_cible, action')
      .eq('ligne_id', caisse)
      .order('survenu_le');

    expect(data!.map((l) => l.action)).toContain('insert');
    expect(data!.map((l) => l.action)).toContain('update');
    expect(data!.every((l) => l.table_cible === 'caisses_jour')).toBe(true);
  });

  it('refuse deux caisses pour le même collecteur le même jour', async () => {
    const { error } = await admin.from('caisses_jour').insert({
      collecteur_id: col.id,
      date: aujourdhui(),
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

  it('journalise aussi un retrait', async () => {
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();

    await admin.from('clients').insert({ id: clientId, collecteur_id: col.id, nom: 'Drissa' });
    await admin
      .from('cartes')
      .insert({ id: carteId, collecteur_id: col.id, client_id: clientId, mise: 1000 });
    await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: col.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });

    const { data: retrait } = await admin
      .from('retraits')
      .insert({
        collecteur_id: col.id,
        carte_id: carteId,
        montant_restitue: 0,
        commission: 1000,
      })
      .select('id')
      .single();

    const { data } = await admin
      .from('audit_log')
      .select('table_cible, action')
      .eq('ligne_id', retrait!.id);

    expect(data).toHaveLength(1);
    expect(data![0]!.table_cible).toBe('retraits');
  });
});

describe('immuabilité du journal', () => {
  it('refuse la modification et la suppression d’une ligne d’audit', async () => {
    const { data: ligne } = await admin.from('audit_log').select('id').limit(1).single();

    const maj = await admin.from('audit_log').update({ action: 'falsifie' }).eq('id', ligne!.id);
    expect(maj.error!.message).toContain('LIGNE_IMMUABLE');

    const sup = await admin.from('audit_log').delete().eq('id', ligne!.id);
    expect(sup.error!.message).toContain('LIGNE_IMMUABLE');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

let a: CollecteurTest;
let b: CollecteurTest;
let clientDeB: string;
let carteDeB: string;
let miseDeB: string;

beforeAll(async () => {
  a = await creerCollecteur('Collecteur A', `+225077${Date.now() % 10000000}`);
  b = await creerCollecteur('Collecteur B', `+225078${Date.now() % 10000000}`);

  clientDeB = crypto.randomUUID();
  carteDeB = crypto.randomUUID();
  miseDeB = crypto.randomUUID();

  await admin.from('clients').insert({ id: clientDeB, collecteur_id: b.id, nom: 'Client de B' });
  await admin
    .from('cartes')
    .insert({ id: carteDeB, collecteur_id: b.id, client_id: clientDeB, mise: 1000 });
  await admin.from('mises').insert({
    id: miseDeB,
    collecteur_id: b.id,
    carte_id: carteDeB,
    montant: 1000,
    encaisse_le: new Date().toISOString(),
  });
});

describe('isolation multi-tenant — A face aux données de B', () => {
  it('1. ne lit pas les clients de B', async () => {
    const { data } = await a.client.from('clients').select('id').eq('id', clientDeB);
    expect(data).toEqual([]);
  });

  it('2. ne lit pas les mises de B', async () => {
    const { data } = await a.client.from('mises').select('id').eq('id', miseDeB);
    expect(data).toEqual([]);
  });

  it('3. n’insère pas un client au nom de B', async () => {
    const { error } = await a.client
      .from('clients')
      .insert({ id: crypto.randomUUID(), collecteur_id: b.id, nom: 'Intrusion' });
    expect(error!.code).toBe('42501'); // violation de politique RLS
  });

  it('4. n’insère pas une mise sur une carte de B', async () => {
    const { error } = await a.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: b.id,
      carte_id: carteDeB,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });
    expect(error!.code).toBe('42501');
  });

  it('5. ne modifie pas un client de B', async () => {
    const { data } = await a.client
      .from('clients')
      .update({ nom: 'Détourné' })
      .eq('id', clientDeB)
      .select();
    expect(data).toEqual([]);

    const { data: intact } = await admin.from('clients').select('nom').eq('id', clientDeB).single();
    expect(intact!.nom).toBe('Client de B');
  });

  it('6. ne lit pas le journal d’audit', async () => {
    // audit_log ne reçoit aucun grant pour authenticated (migration
    // socle_operations) : le refus intervient au niveau des privilèges,
    // avant même l'évaluation de RLS. PostgREST renvoie donc une erreur
    // 42501 avec data à null — jamais un tableau vide filtré par une
    // politique. C'est un refus plus fort que celui des autres tables.
    const { data, error } = await a.client.from('audit_log').select('id');
    expect(data).toBeNull();
    expect(error!.code).toBe('42501');
  });
});

describe('accès légitime du collecteur à ses propres données', () => {
  it('lit son profil et pas celui des autres', async () => {
    const { data } = await a.client.from('collecteurs').select('id, nom');
    expect(data).toHaveLength(1);
    expect(data![0]!.id).toBe(a.id);
  });

  it('crée un client, une carte, puis encaisse une mise', async () => {
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();

    const r1 = await a.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: a.id, nom: 'Cliente de A', marche: 'Adjamé' });
    expect(r1.error).toBeNull();

    const r2 = await a.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: a.id, client_id: clientId, mise: 1000 });
    expect(r2.error).toBeNull();

    const r3 = await a.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });
    expect(r3.error).toBeNull();

    const { data } = await a.client
      .from('cartes')
      .select('mises_encaissees')
      .eq('id', carteId)
      .single();
    expect(data!.mises_encaissees).toBe(1);
  });

  it('ne peut ni modifier ni supprimer une mise qu’il a lui-même créée', async () => {
    const { data: sienne } = await a.client.from('mises').select('id').limit(1).single();

    const maj = await a.client.from('mises').update({ montant: 9999 }).eq('id', sienne!.id).select();
    expect(maj.data ?? []).toEqual([]);

    const sup = await a.client.from('mises').delete().eq('id', sienne!.id).select();
    expect(sup.data ?? []).toEqual([]);

    const { count } = await admin
      .from('mises')
      .select('*', { count: 'exact', head: true })
      .eq('id', sienne!.id);
    expect(count).toBe(1);
  });

  it('modifie son profil mais ne peut pas s’offrir un palier', async () => {
    const profil = await a.client.from('collecteurs').update({ zone: 'Adjamé' }).eq('id', a.id);
    expect(profil.error).toBeNull();

    const escalade = await a.client
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', a.id);
    expect(escalade.error).not.toBeNull();

    const { data } = await admin
      .from('collecteurs')
      .select('zone, palier')
      .eq('id', a.id)
      .single();
    expect(data!.zone).toBe('Adjamé');
    expect(data!.palier).toBe('essai');
  });
});

describe('privilèges de colonne rendus au serveur — audit du 2026-08-16', () => {
  it('déclare son cash mais n’écrit pas le cash attendu qui le contrôle', async () => {
    const jour = new Date().toISOString().slice(0, 10);

    // L'insert passe : le trigger écrase la valeur envoyée, il n'y a pas de
    // refus de privilège sur une colonne qu'on n'a pas nommée dans le INSERT.
    const ouverture = await a.client
      .from('caisses_jour')
      .insert({ collecteur_id: a.id, date: jour, cash_declare: 500 });
    expect(ouverture.error).toBeNull();

    // Nommer la colonne, en revanche, est refusé au niveau du privilège.
    const forgeage = await a.client
      .from('caisses_jour')
      .update({ cash_attendu: 500 })
      .eq('collecteur_id', a.id);
    expect(forgeage.error!.code).toBe('42501');

    const correction = await a.client
      .from('caisses_jour')
      .update({ cash_declare: 900 })
      .eq('collecteur_id', a.id);
    expect(correction.error).toBeNull();

    // A a encaissé une mise de 1 000 plus haut : l'attendu le sait.
    const { data } = await admin
      .from('caisses_jour')
      .select('cash_attendu, cash_declare, ecart')
      .eq('collecteur_id', a.id)
      .single();
    expect(data!.cash_attendu).toBe(1000);
    expect(data!.cash_declare).toBe(900);
    expect(data!.ecart).toBe(-100);
  });

  it('renomme un client mais ne réécrit ni son identifiant ni sa date de création', async () => {
    const clientId = crypto.randomUUID();
    await a.client.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Awa' });

    const ok = await a.client.from('clients').update({ nom: 'Awa Touré' }).eq('id', clientId);
    expect(ok.error).toBeNull();

    // `id` est la clé de la souscription hors-ligne : insertable, jamais réécrit.
    const identite = await a.client
      .from('clients')
      .update({ id: crypto.randomUUID() })
      .eq('id', clientId);
    expect(identite.error!.code).toBe('42501');

    const horodatage = await a.client
      .from('clients')
      .update({ cree_le: '2020-01-01T00:00:00Z' })
      .eq('id', clientId);
    expect(horodatage.error!.code).toBe('42501');
  });

  it('ne dépose pas un rejet de synchro déjà marqué traité', async () => {
    const forge = await a.client.from('synchro_rejets').insert({
      collecteur_id: a.id,
      charge_utile: { montant: 1000 },
      motif: 'CARTE_CLOTUREE',
      traite: true,
    });
    expect(forge.error!.code).toBe('42501');

    const honnete = await a.client.from('synchro_rejets').insert({
      collecteur_id: a.id,
      charge_utile: { montant: 1000 },
      motif: 'CARTE_CLOTUREE',
    });
    expect(honnete.error).toBeNull();
  });
});

describe('portillon du Dashboard Admin', () => {
  it('répond faux pour un collecteur ordinaire, vrai une fois inscrit aux admins', async () => {
    const avant = await a.client.rpc('est_admin');
    expect(avant.error).toBeNull();
    expect(avant.data).toBe(false);

    await admin.from('admins').insert({ user_id: a.id });

    const apres = await a.client.rpc('est_admin');
    expect(apres.data).toBe(true);

    // Le portillon ne donne pas accès à la table qu'il interroge.
    const lecture = await a.client.from('admins').select('user_id');
    expect(lecture.data).toBeNull();
    expect(lecture.error!.code).toBe('42501');

    await admin.from('admins').delete().eq('user_id', a.id);
  });
});

describe('privilège de colonne sur les rejets de synchro', () => {
  it('marque un rejet comme traité mais ne peut pas réécrire la charge utile', async () => {
    const charge = { id: crypto.randomUUID(), montant: 1000 };
    const { data: rejet } = await admin
      .from('synchro_rejets')
      .insert({ collecteur_id: a.id, charge_utile: charge, motif: 'CARTE_CLOTUREE' })
      .select('id')
      .single();

    const ok = await a.client.from('synchro_rejets').update({ traite: true }).eq('id', rejet!.id);
    expect(ok.error).toBeNull();

    const ko = await a.client
      .from('synchro_rejets')
      .update({ charge_utile: { falsifie: true } })
      .eq('id', rejet!.id);
    expect(ko.error!.code).toBe('42501');

    const { data } = await admin
      .from('synchro_rejets')
      .select('charge_utile, traite')
      .eq('id', rejet!.id)
      .single();
    expect(data!.charge_utile).toEqual(charge);
    expect(data!.traite).toBe(true);
  });
});

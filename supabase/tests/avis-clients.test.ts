import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Les avis envoyés aux clients — le déclencheur, exercé en base.
 *
 * Ce dispositif est le seul du produit qui rende un encaissement contestable
 * par celui qui l'a payé. Il porte donc deux risques opposés, et les tests
 * ci-dessous les couvrent tous les deux :
 *
 * **Ne pas prévenir.** Un client non averti ne peut rien vérifier ; le
 * dispositif ne sert à rien.
 *
 * **Prévenir de travers.** Un avis en double fait croire à un versement double.
 * Un avis pour la commission fait croire à une épargne qui ne reviendra jamais.
 * Un avis sans consentement livre un solde d'épargne sur le téléphone d'un
 * tiers. Et chaque avis se paie environ 20 FCFA.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;
let clientId: string;
let carteId: string;

async function poserReglages(champs: Record<string, unknown>) {
  await admin
    .from('avis_reglages')
    .upsert({ collecteur_id: collecteur.id, ...champs }, { onConflict: 'collecteur_id' });
}

async function encaisser(montant: number, commission = false) {
  // `mises.id` n'a pas de valeur par défaut : c'est le téléphone qui engendre
  // l'identifiant, et c'est ce qui empêche un rejeu de synchronisation de
  // compter deux fois. Le harnais fait donc comme le téléphone.
  const { data, error } = await admin
    .from('mises')
    .insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant,
      est_commission: commission,
      // `encaisse_le` vient du téléphone lui aussi : c'est l'heure du geste,
      // pas celle de la remontée au serveur. Une mise encaissée hors ligne le
      // matin et synchronisée le soir garde l'heure du matin.
      encaisse_le: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function avis() {
  const { data } = await admin
    .from('avis_clients')
    .select('*')
    .eq('collecteur_id', collecteur.id)
    .order('cree_le');
  return (data ?? []) as Array<Record<string, string | number | null>>;
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Avis ${MARQUE}`, `+225077${MARQUE}`);

  const { data: c, error: eC } = await collecteur.client
    .from('clients')
    .insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      nom: `Client ${MARQUE}`,
      telephone: '+2250700000001',
    })
    .select('id')
    .single();
  if (eC) throw new Error(eC.message);
  clientId = (c as { id: string }).id;

  const { data: k, error: eK } = await collecteur.client
    .from('cartes')
    .insert({ id: crypto.randomUUID(), collecteur_id: collecteur.id, client_id: clientId, mise: 500 })
    .select('id')
    .single();
  if (eK) throw new Error(eK.message);
  carteId = (k as { id: string }).id;
});

beforeEach(async () => {
  await admin.from('avis_clients').delete().eq('collecteur_id', collecteur.id);
  await admin.from('clients').update({ avis_actifs: true }).eq('id', clientId);
});

afterAll(async () => {
  await nettoyer();
});

describe('rien ne part sans décision explicite', () => {
  it('n’envoie rien quand le collecteur n’a aucun réglage', async () => {
    await admin.from('avis_reglages').delete().eq('collecteur_id', collecteur.id);
    await encaisser(500);

    // Le défaut le plus important du dispositif : il est éteint. Chaque avis
    // coûte de l'argent, et personne ne doit en dépenser par omission.
    expect(await avis()).toHaveLength(0);
  });

  it('n’envoie rien quand le canal est « aucun »', async () => {
    await poserReglages({ canal: 'aucun', sur_mise: true, quota_mensuel: 1000 });
    await encaisser(500);
    expect(await avis()).toHaveLength(0);
  });

  it('n’envoie rien sur une mise quand seul le retrait est activé', async () => {
    // La distinction qui rend le dispositif finançable : la clôture coûte
    // trente fois moins que l'avis par mise, et c'est le message qui compte le
    // plus — c'est là que l'argent sort.
    await poserReglages({ canal: 'sms', sur_mise: false, sur_retrait: true, quota_mensuel: 1000 });
    await encaisser(500);
    expect(await avis()).toHaveLength(0);
  });
});

describe('le consentement du client', () => {
  beforeEach(async () => {
    await poserReglages({ canal: 'sms', sur_mise: true, quota_mensuel: 1000 });
  });

  it('n’envoie rien à un client qui n’a pas consenti', async () => {
    // Le téléphone est souvent partagé en famille. Laisser un numéro n'est pas
    // consentir à ce que son solde d'épargne y arrive.
    await admin.from('clients').update({ avis_actifs: false }).eq('id', clientId);
    await encaisser(500);
    expect(await avis()).toHaveLength(0);
  });

  it('n’envoie rien à un client sans numéro', async () => {
    const { data } = await collecteur.client
      .from('clients')
      .insert({
        id: crypto.randomUUID(),
        collecteur_id: collecteur.id,
        nom: `Sans tel ${MARQUE}`,
        avis_actifs: true,
      })
      .select('id')
      .single();
    const { data: k } = await collecteur.client
      .from('cartes')
      .insert({
        id: crypto.randomUUID(),
        collecteur_id: collecteur.id,
        client_id: (data as { id: string }).id,
        mise: 500,
      })
      .select('id')
      .single();

    await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: (k as { id: string }).id,
      montant: 500,
      est_commission: false,
      encaisse_le: new Date().toISOString(),
    });

    expect(await avis()).toHaveLength(0);
  });
});

describe('ce qui part, et ce qu’il dit', () => {
  beforeEach(async () => {
    await poserReglages({ canal: 'sms', sur_mise: true, quota_mensuel: 1000 });
  });

  it('met en file un avis par versement', async () => {
    const id = await encaisser(500);
    const file = await avis();

    expect(file).toHaveLength(1);
    expect(file[0].statut).toBe('a_envoyer');
    expect(file[0].source_table).toBe('mises');
    expect(file[0].source_id).toBe(id);
    expect(file[0].destinataire).toBe('+2250700000001');
  });

  it('dit le montant et la référence, sans nommer personne', async () => {
    const id = await encaisser(500);
    const corps = String((await avis())[0].corps);

    expect(corps).toContain('500 FCFA');
    expect(corps).toContain(id.replace(/-/g, '').slice(0, 8).toUpperCase());
    expect(corps).not.toContain(`Client ${MARQUE}`);
    expect(corps).not.toContain(`Avis ${MARQUE}`);
  });

  it('n’émet aucun caractère hors GSM-7', async () => {
    // Le texte est composé en SQL ; il doit respecter la même contrainte que le
    // module TypeScript, sans quoi le message bascule en UCS-2 et coûte double.
    await encaisser(500);
    const corps = String((await avis())[0].corps);

    expect(corps).not.toMatch(/[çêâîôûëïœ’…—«»]/);
  });

  it('n’annonce pas la commission comme un versement', async () => {
    // La première mise du cycle revient au collecteur. L'annoncer comme une
    // épargne ferait attendre au client une somme qui ne lui reviendra jamais.
    //
    // `est_commission` n'est pas décidé par l'appelant : le déclencheur
    // `mises_avant_insert` le calcule côté serveur, à partir du rang de la mise
    // sur la carte. Une première version de ce test le forçait à `true` sur une
    // carte déjà entamée, et le serveur le ramenait — à juste titre — à `false`.
    // Il faut donc une carte neuve, dont la première mise est la commission.
    const { data: c } = await collecteur.client
      .from('clients')
      .insert({
        id: crypto.randomUUID(),
        collecteur_id: collecteur.id,
        nom: `Neuf ${MARQUE}`,
        telephone: '+2250700000002',
        avis_actifs: true,
      })
      .select('id')
      .single();

    const { data: k } = await collecteur.client
      .from('cartes')
      .insert({
        id: crypto.randomUUID(),
        collecteur_id: collecteur.id,
        client_id: (c as { id: string }).id,
        mise: 500,
      })
      .select('id')
      .single();

    const { error } = await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: (k as { id: string }).id,
      montant: 500,
      est_commission: true,
      encaisse_le: new Date().toISOString(),
    });
    expect(error).toBeNull();

    // La carte neuve n'a produit aucun avis : sa première mise est la
    // commission du collecteur, pas une épargne du client.
    const { data } = await admin
      .from('avis_clients')
      .select('id')
      .eq('client_id', (c as { id: string }).id);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('l’idempotence', () => {
  it('ne met qu’un avis par source, même si le déclencheur repasse', async () => {
    await poserReglages({ canal: 'sms', sur_mise: true, quota_mensuel: 1000 });
    const id = await encaisser(500);

    // Une seconde tentative d'insertion sur la même source, comme le ferait un
    // drainage rejoué. Un client qui reçoit deux fois « versement 500 FCFA »
    // croit avoir versé mille.
    const { error } = await admin.from('avis_clients').insert({
      collecteur_id: collecteur.id,
      client_id: clientId,
      source_table: 'mises',
      source_id: id,
      destinataire: '+2250700000001',
      canal: 'sms',
      corps: 'doublon',
      segments: 1,
    });

    expect(error?.code).toBe('23505');
    expect(await avis()).toHaveLength(1);
  });
});

describe('le quota', () => {
  it('marque « quota_atteint » plutôt que d’envoyer au-delà du plafond', async () => {
    // Un quota à zéro : tout est composé, rien n'est envoyable. Le collecteur
    // doit pouvoir constater que ses clients cessent d'être prévenus, et
    // pourquoi — un silence sans cause est indébogable.
    await poserReglages({ canal: 'sms', sur_mise: true, quota_mensuel: 0 });
    await encaisser(500);

    const file = await avis();
    expect(file).toHaveLength(1);
    expect(file[0].statut).toBe('quota_atteint');
  });
});

describe('les verrous', () => {
  it('refuse la lecture anonyme de la file', async () => {
    const { error } = await anonyme.from('avis_clients').select('*');
    expect(error).not.toBeNull();
  });

  it('laisse le collecteur lire ses propres avis', async () => {
    await poserReglages({ canal: 'sms', sur_mise: true, quota_mensuel: 1000 });
    await encaisser(500);

    const { data, error } = await collecteur.client.from('avis_clients').select('*');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('interdit au collecteur d’écrire un avis', async () => {
    // Le corps est composé par le serveur. Un collecteur qui pourrait le
    // rédiger pourrait annoncer un montant différent de celui qu'il a encaissé
    // — ce qui retournerait le dispositif contre son objet même.
    const { error } = await collecteur.client.from('avis_clients').insert({
      collecteur_id: collecteur.id,
      client_id: clientId,
      source_table: 'mises',
      source_id: crypto.randomUUID(),
      destinataire: '+2250700000001',
      canal: 'sms',
      corps: 'KOLEK. Versement recu : 50 000 FCFA.',
      segments: 1,
    });

    expect(error).not.toBeNull();
  });

  it('interdit au collecteur de modifier son quota', async () => {
    const { error } = await collecteur.client
      .from('avis_reglages')
      .update({ quota_mensuel: 999_999 })
      .eq('collecteur_id', collecteur.id);

    expect(error).not.toBeNull();
  });
});

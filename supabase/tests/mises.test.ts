import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

let col: CollecteurTest;

async function nouvelleCarte(mise = 1000): Promise<string> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  await admin.from('clients').insert({ id: clientId, collecteur_id: col.id, nom: 'Client test' });
  await admin.from('cartes').insert({
    id: carteId,
    collecteur_id: col.id,
    client_id: clientId,
    mise,
  });
  return carteId;
}

function nouvelleMise(carteId: string, montant = 1000, id = crypto.randomUUID()) {
  return {
    id,
    collecteur_id: col.id,
    carte_id: carteId,
    montant,
    encaisse_le: new Date().toISOString(),
  };
}

beforeAll(async () => {
  col = await creerCollecteur('Sékou Diarra', `+225074${Date.now() % 10000000}`);
});

describe('commission', () => {
  it('marque la 1ʳᵉ mise comme commission et les suivantes non', async () => {
    const carteId = await nouvelleCarte();

    await admin.from('mises').insert(nouvelleMise(carteId));
    await admin.from('mises').insert(nouvelleMise(carteId));

    const { data } = await admin
      .from('mises')
      .select('est_commission, recu_le')
      .eq('carte_id', carteId)
      .order('recu_le', { ascending: true });

    expect(data!.map((m) => m.est_commission)).toEqual([true, false]);
  });

  it('ignore un est_commission forgé par le client', async () => {
    const carteId = await nouvelleCarte();

    await admin.from('mises').insert({ ...nouvelleMise(carteId), est_commission: false });

    const { data } = await admin.from('mises').select('est_commission').eq('carte_id', carteId);
    expect(data![0]!.est_commission).toBe(true);
  });
});

describe('compteur de la carte', () => {
  it('incrémente mises_encaissees à chaque encaissement', async () => {
    const carteId = await nouvelleCarte();

    for (let i = 0; i < 3; i++) {
      await admin.from('mises').insert(nouvelleMise(carteId));
    }

    const { data } = await admin
      .from('cartes')
      .select('mises_encaissees')
      .eq('id', carteId)
      .single();
    expect(data!.mises_encaissees).toBe(3);
  });

  it('refuse une 32ᵉ mise — le cycle fait 31 mises', async () => {
    const carteId = await nouvelleCarte();

    for (let i = 0; i < 31; i++) {
      await admin.from('mises').insert(nouvelleMise(carteId));
    }

    const { error } = await admin.from('mises').insert(nouvelleMise(carteId));
    expect(error!.message).toContain('CYCLE_COMPLET');
  });
});

describe('validation à l’insertion', () => {
  it('refuse un montant différent de la mise de la carte', async () => {
    const carteId = await nouvelleCarte(1000);
    const { error } = await admin.from('mises').insert(nouvelleMise(carteId, 2000));
    expect(error!.message).toContain('MONTANT_INVALIDE');
  });

  it('refuse un encaissement sur une carte clôturée', async () => {
    const carteId = await nouvelleCarte();
    await admin
      .from('cartes')
      .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
      .eq('id', carteId);

    const { error } = await admin.from('mises').insert(nouvelleMise(carteId));
    expect(error!.message).toContain('CARTE_CLOTUREE');
  });

  it('force le collecteur_id depuis la carte, même si le client en envoie un autre', async () => {
    const carteId = await nouvelleCarte();
    const autre = await creerCollecteur('Intrus', `+225075${Date.now() % 10000000}`);

    await admin.from('mises').insert({ ...nouvelleMise(carteId), collecteur_id: autre.id });

    const { data } = await admin.from('mises').select('collecteur_id').eq('carte_id', carteId);
    expect(data![0]!.collecteur_id).toBe(col.id);
  });
});

describe('idempotence de la synchronisation', () => {
  it('rejoue trois fois la même mise et n’en enregistre qu’une', async () => {
    const carteId = await nouvelleCarte();
    const miseId = crypto.randomUUID();
    const charge = nouvelleMise(carteId, 1000, miseId);

    const premier = await admin.from('mises').insert(charge);
    expect(premier.error).toBeNull();

    for (let i = 0; i < 2; i++) {
      const rejeu = await admin.from('mises').insert(charge);
      expect(rejeu.error!.code).toBe('23505'); // violation de clé primaire
    }

    const { count } = await admin
      .from('mises')
      .select('*', { count: 'exact', head: true })
      .eq('carte_id', carteId);
    expect(count).toBe(1);

    const { data } = await admin
      .from('cartes')
      .select('mises_encaissees')
      .eq('id', carteId)
      .single();
    expect(data!.mises_encaissees).toBe(1);
  });
});

describe('immuabilité', () => {
  it('refuse la modification d’une mise, même avec la clé de service', async () => {
    const carteId = await nouvelleCarte();
    const miseId = crypto.randomUUID();
    await admin.from('mises').insert(nouvelleMise(carteId, 1000, miseId));

    const { error } = await admin.from('mises').update({ montant: 5000 }).eq('id', miseId);
    expect(error!.message).toContain('LIGNE_IMMUABLE');
  });

  it('refuse la suppression d’une mise, même avec la clé de service', async () => {
    const carteId = await nouvelleCarte();
    const miseId = crypto.randomUUID();
    await admin.from('mises').insert(nouvelleMise(carteId, 1000, miseId));

    const { error } = await admin.from('mises').delete().eq('id', miseId);
    expect(error!.message).toContain('LIGNE_IMMUABLE');
  });

  it('refuse la suppression d’un collecteur qui a encaissé', async () => {
    const carteId = await nouvelleCarte();
    await admin.from('mises').insert(nouvelleMise(carteId));

    const { error } = await admin.auth.admin.deleteUser(col.id);
    expect(error).not.toBeNull();

    const { data } = await admin.from('collecteurs').select('id').eq('id', col.id);
    expect(data).toHaveLength(1);
  });
});

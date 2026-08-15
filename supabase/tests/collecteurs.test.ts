import { afterAll, describe, expect, it } from 'vitest';
import { admin, creerCollecteur, nettoyer } from './harnais';

afterAll(nettoyer);

describe('création automatique du collecteur à l’inscription', () => {
  it('crée une ligne collecteurs avec les métadonnées et le palier essai', async () => {
    const a = await creerCollecteur('Awa Koné', `+225070${Date.now() % 10000000}`);

    const { data, error } = await admin
      .from('collecteurs')
      .select('id, nom, palier, abonnement_statut, abonnement_echeance')
      .eq('id', a.id)
      .single();

    expect(error).toBeNull();
    expect(data!.nom).toBe('Awa Koné');
    expect(data!.palier).toBe('essai');
    expect(data!.abonnement_statut).toBe('actif');
    expect(new Date(data!.abonnement_echeance).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('contraintes du schéma cartes', () => {
  it('refuse une deuxième carte active pour le même client', async () => {
    const a = await creerCollecteur('Bintou Traoré', `+225071${Date.now() % 10000000}`);
    const clientId = crypto.randomUUID();

    await admin.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Mariam' });
    await admin.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      client_id: clientId,
      mise: 1000,
    });

    const { error } = await admin.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      client_id: clientId,
      mise: 2000,
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
  });

  it('refuse une mise journalière hors des bornes 500 – 10 000', async () => {
    const a = await creerCollecteur('Yao Kouassi', `+225072${Date.now() % 10000000}`);
    const clientId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Adjoua' });

    for (const mise of [499, 10001]) {
      const { error } = await admin.from('cartes').insert({
        id: crypto.randomUUID(),
        collecteur_id: a.id,
        client_id: clientId,
        mise,
      });
      expect(error?.code).toBe('23514');
    }
  });

  it('exige une date de clôture cohérente avec le statut', async () => {
    const a = await creerCollecteur('Fanta Cissé', `+225073${Date.now() % 10000000}`);
    const clientId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Sali' });

    const { error } = await admin.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      client_id: clientId,
      mise: 1000,
      statut: 'cloturee',
    });

    expect(error?.code).toBe('23514');
  });
});

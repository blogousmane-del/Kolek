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
  it('accepte une deuxième carte active pour le même client', async () => {
    // Jusqu'au 2026-08-25, l'index `cartes_une_active_par_client` refusait cette
    // deuxième écriture avec 23505. Il est levé par
    // `20260825090000_cartes_multiples.sql` — voir `cartes-multiples.test.ts`
    // pour la couverture complète du nouveau comportement. Ici, on ne garde que
    // la vérification schéma minimale : les deux cartes, nommées, restent actives.
    const a = await creerCollecteur('Bintou Traoré', `+225071${Date.now() % 10000000}`);
    const clientId = crypto.randomUUID();

    await admin.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Mariam' });
    const premiere = crypto.randomUUID();
    await admin.from('cartes').insert({
      id: premiere,
      collecteur_id: a.id,
      client_id: clientId,
      mise: 1000,
    });

    const seconde = crypto.randomUUID();
    const { error } = await admin.from('cartes').insert({
      id: seconde,
      collecteur_id: a.id,
      client_id: clientId,
      mise: 2000,
    });
    expect(error).toBeNull();

    const { data } = await admin.from('cartes').select('id, statut').in('id', [premiere, seconde]);
    expect((data ?? []).every((c) => c.statut === 'active')).toBe(true);
  });

  it('refuse une mise journalière sous le plancher de 500', async () => {
    // Le plafond de 10 000 a été levé par `20260901090000_mise_sans_plafond.sql` —
    // voir `mise-sans-plafond.test.ts` pour la couverture complète du nouveau
    // comportement (carte à 50 000 acceptée, mise au-delà de l'integer rendue
    // juste). Ici, on ne garde que la vérification schéma qui subsiste : le
    // plancher.
    const a = await creerCollecteur('Yao Kouassi', `+225072${Date.now() % 10000000}`);
    const clientId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Adjoua' });

    const { error } = await admin.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      client_id: clientId,
      mise: 499,
    });
    expect(error?.code).toBe('23514');
  });

  it('laisse rouvrir une carte une fois la précédente clôturée', async () => {
    // La promesse du produit : quand un client retire son argent, la carte se
    // ferme mais le client reste — il peut reprendre, au même montant ou à un
    // autre.
    const a = await creerCollecteur('Aya Konan', `+225074${Date.now() % 10000000}`);
    const clientId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Aminata' });

    const premiere = crypto.randomUUID();
    await admin
      .from('cartes')
      .insert({ id: premiere, collecteur_id: a.id, client_id: clientId, mise: 1000 });

    await admin
      .from('cartes')
      .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
      .eq('id', premiere);

    const { error } = await admin.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      client_id: clientId,
      mise: 2000,
    });
    expect(error).toBeNull();

    // La carte close n'est pas effacée : c'est l'historique du client, et le
    // collecteur doit pouvoir dire « c'est ta deuxième carte ».
    const { data } = await admin.from('cartes').select('id, statut').eq('client_id', clientId);
    expect(data).toHaveLength(2);
    expect((data ?? []).filter((k) => k.statut === 'active')).toHaveLength(1);
  });

  it('accepte une mise composée hors des cinq paliers usuels', async () => {
    // `cartes.mise` est borné par un intervalle, pas par une liste. Une cliente
    // qui convient de 750 FCFA par jour avec son collecteur a le droit ;
    // l'interface a longtemps proposé cinq montants et rien d'autre, ce qui
    // était une limite d'écran prise pour une règle du métier.
    const a = await creerCollecteur('Sekou Diarra', `+225075${Date.now() % 10000000}`);
    const clientId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Fatou' });

    for (const mise of [500, 750, 1250, 3300, 10000]) {
      const carteId = crypto.randomUUID();
      const { error } = await admin
        .from('cartes')
        .insert({ id: carteId, collecteur_id: a.id, client_id: clientId, mise });
      expect(error, `mise de ${mise} refusée`).toBeNull();
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

  it('refuse une carte dont le client appartient à un autre collecteur', async () => {
    const a = await creerCollecteur('Moussa Fofana', `+225079${Date.now() % 10000000}`);
    const b = await creerCollecteur('Rokia Sanogo', `+225080${Date.now() % 10000000}`);

    const clientDeB = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientDeB, collecteur_id: b.id, nom: 'Client de B' });

    const { error } = await admin.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      client_id: clientDeB,
      mise: 1000,
    });

    expect(error!.code).toBe('23503'); // violation de clé étrangère
  });
});

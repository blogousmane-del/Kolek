import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * La caisse suit la main, pas le propriétaire.
 *
 * C'est la propriété que `mises.encaisse_par` et `retraits.restitue_par`
 * existent pour tenir. Elle ne se voit qu'à deux : tant qu'un collecteur
 * travaille seul, l'encaisseur EST le propriétaire, et n'importe quelle des deux
 * colonnes donnerait le même chiffre.
 *
 * Ce fichier écrit sous clé de service parce que c'est ce que font les Edge
 * Functions d'équipe : `auth.uid()` y est nul, et c'est la valeur posée par la
 * fonction que le `coalesce` de `mises_avant_insert` retient. Le chemin est donc
 * exactement celui de la production, sans passer par HTTP — que le runtime local
 * ne sert pas.
 */

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

/** Le cash attendu d'un collecteur pour aujourd'hui, lu sous clé de service. */
async function cashAttendu(collecteurId: string): Promise<number> {
  const { data, error } = await admin.rpc('cash_attendu_du_jour', {
    p_collecteur: collecteurId,
    p_date: new Date().toISOString().slice(0, 10),
  });
  expect(error).toBeNull();
  return data as number;
}

/** Un titulaire, un collaborateur, et une carte ouverte chez le collaborateur. */
async function equipe(): Promise<{
  patron: CollecteurTest;
  awa: CollecteurTest;
  carteId: string;
}> {
  const patron = await creerCollecteur('Patron Cash', telephone());
  const awa = await creerCollecteur('Awa Cash', telephone());
  await admin
    .from('collecteurs')
    .update({ palier: 'illimite', abonnement_statut: 'actif' })
    .eq('id', patron.id);
  const { error } = await admin
    .from('collecteurs')
    .update({ titulaire_id: patron.id })
    .eq('id', awa.id);
  expect(error).toBeNull();

  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  await awa.client.from('clients').insert({ id: clientId, collecteur_id: awa.id, nom: 'Aya' });
  await awa.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: awa.id, client_id: clientId, mise: 1000 });

  return { patron, awa, carteId };
}

describe('la caisse suit la main', () => {
  it('porte au titulaire ce qu’il a encaissé sur la carte d’Awa', async () => {
    const { patron, awa, carteId } = await equipe();

    const patronAvant = await cashAttendu(patron.id);
    const awaAvant = await cashAttendu(awa.id);

    const { error } = await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: awa.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
      encaisse_par: patron.id,
    });
    expect(error).toBeNull();

    // Le billet est dans la poche du titulaire.
    expect(await cashAttendu(patron.id)).toBe(patronAvant + 1000);
    // Celle d'Awa ne bouge pas : lui faire porter un billet qu'elle n'a pas eu
    // en main lui fabriquerait un écart de caisse tous les soirs.
    expect(await cashAttendu(awa.id)).toBe(awaAvant);
  });

  it('laisse la carte à son propriétaire, quel que soit qui encaisse', async () => {
    const { patron, awa, carteId } = await equipe();
    const miseId = crypto.randomUUID();

    await admin.from('mises').insert({
      id: miseId,
      collecteur_id: awa.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
      encaisse_par: patron.id,
    });

    const { data } = await admin
      .from('mises')
      .select('collecteur_id, encaisse_par')
      .eq('id', miseId)
      .single();
    expect(data?.collecteur_id).toBe(awa.id);
    expect(data?.encaisse_par).toBe(patron.id);

    // Le compteur de la carte a bien avancé : la mise compte pour le cycle
    // d'Awa, même encaissée par quelqu'un d'autre.
    const { data: carte } = await admin
      .from('cartes')
      .select('mises_encaissees')
      .eq('id', carteId)
      .single();
    expect(carte?.mises_encaissees).toBe(1);
  });

  it('attribue le retrait au propriétaire et la sortie de caisse à qui a payé', async () => {
    const { patron, awa, carteId } = await equipe();
    await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: awa.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
      encaisse_par: awa.id,
    });

    const patronAvant = await cashAttendu(patron.id);
    const awaAvant = await cashAttendu(awa.id);

    // Ce que `collecteur-cloturer-carte` écrit après vérification
    // d'appartenance : la carte à Awa, l'argent sorti de la poche du titulaire.
    // Une seule mise encaissée : elle est la commission, rien n'est restituable.
    const { error } = await admin.from('retraits').insert({
      collecteur_id: awa.id,
      restitue_par: patron.id,
      carte_id: carteId,
      montant_restitue: 0,
      commission: 1000,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('retraits')
      .select('collecteur_id, restitue_par')
      .eq('carte_id', carteId)
      .single();
    // `retraits.collecteur_id` désigne le propriétaire, pour rester cohérent
    // avec `mises.collecteur_id`.
    expect(data?.collecteur_id).toBe(awa.id);
    expect(data?.restitue_par).toBe(patron.id);

    // Rien n'a été restitué, donc aucune caisse ne bouge.
    expect(await cashAttendu(patron.id)).toBe(patronAvant);
    expect(await cashAttendu(awa.id)).toBe(awaAvant);
  });

  it('sort le montant restitué de la caisse de celui qui a payé', async () => {
    const { patron, awa, carteId } = await equipe();
    // Deux mises : la première est la commission, la seconde est due au client.
    for (let i = 0; i < 2; i += 1) {
      await admin.from('mises').insert({
        id: crypto.randomUUID(),
        collecteur_id: awa.id,
        carte_id: carteId,
        montant: 1000,
        encaisse_le: new Date().toISOString(),
        encaisse_par: awa.id,
      });
    }

    const patronAvant = await cashAttendu(patron.id);
    const awaAvant = await cashAttendu(awa.id);

    await admin.from('retraits').insert({
      collecteur_id: awa.id,
      restitue_par: patron.id,
      carte_id: carteId,
      montant_restitue: 1000,
      commission: 1000,
    });

    // Le titulaire a sorti 1 000 de sa sacoche : c'est SA caisse qui baisse.
    expect(await cashAttendu(patron.id)).toBe(patronAvant - 1000);
    // Awa a encaissé les 2 000 ; elle les doit toujours.
    expect(await cashAttendu(awa.id)).toBe(awaAvant);
  });
});

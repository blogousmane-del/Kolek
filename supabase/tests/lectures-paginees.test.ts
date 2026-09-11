import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Les lectures de l'application collecteur contre le vrai PostgREST, au-delà de
 * mille lignes.
 *
 * Les épreuves de `apps/collecteur` tournent sur un PostgREST factice qui coupe
 * à mille. Celle-ci vérifie la prémisse sur le vrai — `max_rows = 1000`
 * (`supabase/config.toml` ; la production le suit, `config diff` du
 * 2026-09-11) tronque **sans erreur** — et fait tourner les vraies fonctions,
 * avec la session d'un vrai collecteur. Une faute dans un nom de colonne, un
 * `range` oublié ou une politique RLS trop étroite tombent ici.
 *
 * Le module client est remplacé comme dans `historique-carte.test.ts` : par
 * un accesseur qui rend le client authentifié du harnais.
 */

const etat = vi.hoisted(() => ({ client: null as { from: unknown } | null }));

vi.mock('../../apps/collecteur/src/supabase', () => ({
  // Un accesseur et non une valeur : le client n'existe qu'après la connexion,
  // dans `beforeAll`, alors que la fabrique est évaluée au premier import.
  get supabase() {
    if (!etat.client) throw new Error('Client de test non posé — voir beforeAll.');
    return etat.client;
  },
}));

const { chargerCartesCloturables, chargerProfil } = await import(
  '../../apps/collecteur/src/lectures-ecrans'
);

const N = 1001;
const MARQUE = crypto.randomUUID().slice(0, 8);
const MISE = 2000;

let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Pagination ${MARQUE}`, `+225075${MARQUE}`);
  etat.client = collecteur.client as unknown as { from: unknown };

  // En deux lots, et non ligne à ligne : ni `clients` ni `cartes` ne portent
  // les déclencheurs de compteur qui imposent l'unité aux insertions de `mises`.
  const clients = Array.from({ length: N }, (_, i) => ({
    id: crypto.randomUUID(),
    collecteur_id: collecteur.id,
    nom: `Client ${MARQUE} ${i}`,
  }));
  const { error: erreurClients } = await collecteur.client.from('clients').insert(clients);
  if (erreurClients) throw erreurClients;

  const { error: erreurCartes } = await collecteur.client.from('cartes').insert(
    clients.map((c) => ({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      client_id: c.id,
      mise: MISE,
    })),
  );
  if (erreurCartes) throw erreurCartes;
});

afterAll(async () => {
  // Deux mille lignes laissées là fausseraient toute épreuve de la suite qui
  // compte le parc entier. Aucune mise n'a été encaissée : rien ne s'oppose à la
  // suppression, et une erreur ici ne ferait que laisser le ménage à `db:reset`.
  await admin.from('cartes').delete().eq('collecteur_id', collecteur.id);
  await admin.from('clients').delete().eq('collecteur_id', collecteur.id);
  await nettoyer();
});

describe('les lectures du collecteur contre le vrai PostgREST', () => {
  it('prémisse : sans range, PostgREST coupe à mille et ne dit rien', async () => {
    // Si cette épreuve tombe, `max_rows` a changé : tout ce plan repose sur
    // sa valeur, et `TAILLE_PAGE` doit la suivre.
    const { data, error } = await collecteur.client.from('clients').select('id');

    expect(error).toBeNull();
    expect(data).toHaveLength(1000);
  });

  it('chargerProfil compte les 1 001 clients et les 1 001 cartes actives', async () => {
    const profil = await chargerProfil();

    expect(profil.clients).toBe(N);
    expect(profil.cartesActives).toBe(N);
  });

  it('chargerCartesCloturables rend les 1 001 cartes, chacune nommée', async () => {
    const cartes = await chargerCartesCloturables();

    expect(cartes).toHaveLength(N);
    expect(cartes.every((c) => c.clientNom.startsWith(`Client ${MARQUE}`))).toBe(true);
  });
});

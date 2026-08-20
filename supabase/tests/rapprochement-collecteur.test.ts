import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le rapprochement de caisse, **écrit par le collecteur lui-même**.
 *
 * `operations.test.ts` couvre déjà `caisses_jour`, mais toujours avec la clé de
 * service : elle contourne RLS *et* la liste blanche de colonnes. Or c'est
 * précisément ce que l'écran du collecteur ne peut pas contourner. Le chemin
 * réel — session du collecteur, `grant insert (id, collecteur_id, date,
 * cash_declare)`, `grant update (cash_declare)` — n'était vérifié par rien.
 *
 * Ce fichier le vérifie, et il vérifie surtout la raison pour laquelle
 * `declarerCaisse` lit puis écrit au lieu d'utiliser un `upsert` : PostgREST,
 * sur conflit, réaffecte toutes les colonnes envoyées, `id` et `collecteur_id`
 * compris. Un `upsert` marcherait donc à la première déclaration du jour et
 * échouerait à la correction — le cas le plus utile.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

/** Le jour au sens du serveur : `cash_attendu_du_jour` découpe en UTC. */
function dateUtcDuJour(): string {
  return new Date().toISOString().slice(0, 10);
}

async function encaisser(montant: number): Promise<void> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();

  const { error: e1 } = await collecteur.client
    .from('clients')
    .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Caisse ${MARQUE}` });
  if (e1) throw e1;

  const { error: e2 } = await collecteur.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: montant });
  if (e2) throw e2;

  const { error: e3 } = await collecteur.client.from('mises').insert({
    id: crypto.randomUUID(),
    collecteur_id: collecteur.id,
    carte_id: carteId,
    montant,
    encaisse_le: new Date().toISOString(),
  });
  if (e3) throw e3;
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Caisse ${MARQUE}`, `+225071${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('le chemin exact de l’écran', () => {
  let ligneId: string;

  it('déclare sa caisse du jour, et le serveur pose l’attendu', async () => {
    await encaisser(2000);
    await encaisser(3000);

    // Exactement ce que `declarerCaisse` envoie à la première déclaration :
    // trois colonnes, pas une de plus.
    const { data, error } = await collecteur.client
      .from('caisses_jour')
      .insert({
        collecteur_id: collecteur.id,
        date: dateUtcDuJour(),
        cash_declare: 5000,
      })
      .select('id, cash_attendu, cash_declare, ecart')
      .single();

    expect(error).toBeNull();
    expect(data!.cash_attendu).toBe(5000);
    expect(data!.cash_declare).toBe(5000);
    expect(data!.ecart).toBe(0);
    ligneId = data!.id;
  });

  it('corrige sa déclaration par un update sur la seule colonne permise', async () => {
    // Le cas le plus utile de l'écran : le collecteur recompte et se reprend.
    const { data, error } = await collecteur.client
      .from('caisses_jour')
      .update({ cash_declare: 4000 })
      .eq('id', ligneId)
      .select('cash_attendu, cash_declare, ecart')
      .single();

    expect(error).toBeNull();
    expect(data!.cash_declare).toBe(4000);
    expect(data!.ecart).toBe(-1000);
  });

  it('voit son écart bouger quand une mise arrive après sa déclaration', async () => {
    await encaisser(1000);

    const { data } = await collecteur.client
      .from('caisses_jour')
      .select('cash_attendu, ecart')
      .eq('id', ligneId)
      .single();

    // L'attendu suit les mises, sans que le collecteur ait rien à refaire.
    expect(data!.cash_attendu).toBe(6000);
    expect(data!.ecart).toBe(-2000);
  });
});

describe('ce que la liste blanche interdit', () => {
  it('refuse au collecteur d’écrire l’attendu à l’insertion', async () => {
    // Le geste qui masquerait un manquant : poser soi-même le terme de gauche du
    // rapprochement. `grant insert` ne nomme pas `cash_attendu`.
    const { error } = await collecteur.client.from('caisses_jour').insert({
      collecteur_id: collecteur.id,
      date: '2026-08-01',
      cash_attendu: 999_999,
      cash_declare: 999_999,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('refuse au collecteur de corriger l’attendu après coup', async () => {
    const { data } = await collecteur.client
      .from('caisses_jour')
      .select('id')
      .eq('date', dateUtcDuJour())
      .single();

    const { error } = await collecteur.client
      .from('caisses_jour')
      .update({ cash_attendu: 0 })
      .eq('id', data!.id);

    expect(error?.code).toBe('42501');
  });

  it('explique pourquoi `declarerCaisse` n’utilise pas d’upsert', async () => {
    // La démonstration du choix. Un `upsert` envoie `collecteur_id` et `date`
    // dans le `do update set`, or `update` n'est accordé que sur `cash_declare`.
    const { error } = await collecteur.client
      .from('caisses_jour')
      .upsert(
        { collecteur_id: collecteur.id, date: dateUtcDuJour(), cash_declare: 7000 },
        { onConflict: 'collecteur_id,date' },
      );

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });
});

describe('cloisonnement entre collecteurs', () => {
  it('ne laisse pas déclarer une caisse au nom d’un autre', async () => {
    const autre = await creerCollecteur(`Voisin ${MARQUE}`, `+225072${MARQUE}`);

    const { error } = await collecteur.client.from('caisses_jour').insert({
      collecteur_id: autre.id,
      date: '2026-07-15',
      cash_declare: 100,
    });

    // La politique `caisses_insert` exige `collecteur_id = auth.uid()`. Sans
    // elle, un collecteur salirait le rapprochement d'un autre.
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });
});

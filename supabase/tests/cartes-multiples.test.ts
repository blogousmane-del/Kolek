import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Ce que la base garantit une fois l'index `cartes_une_active_par_client` levé.
 *
 * Le cadrage de Phase 1 interdisait deux carnets ouverts sur un même client. La
 * règle tombe le 2026-08-25 : un client épargne pour deux choses à deux rythmes,
 * et un client qui a rempli sa carte veut souvent continuer plutôt que reprendre
 * son argent.
 *
 * Ce qui tombe est **une seule contrainte**. Tout ce qui la voisinait doit tenir
 * — c'est l'objet de ce fichier, et la raison pour laquelle il vérifie autant de
 * choses qui n'ont pas changé que de choses qui changent.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

async function creerClient(): Promise<string> {
  const clientId = crypto.randomUUID();
  const { error } = await collecteur.client
    .from('clients')
    .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Client ${MARQUE}` });
  if (error) throw error;
  return clientId;
}

async function ouvrirCarte(clientId: string, mise: number): Promise<string> {
  const carteId = crypto.randomUUID();
  const { error } = await collecteur.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise });
  if (error) throw error;
  return carteId;
}

/** Encaisse `combien` mises, une par une. */
async function encaisser(carteId: string, mise: number, combien: number): Promise<void> {
  // Une par une, jamais en lot : les déclencheurs `AFTER` sont différés en fin
  // d'instruction, donc un lot verrait toutes les mises avec le même compteur et
  // les marquerait toutes commission. C'est le défaut trouvé le 2026-08-19.
  for (let i = 0; i < combien; i += 1) {
    const { error } = await collecteur.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant: mise,
      encaisse_le: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Cartes ${MARQUE}`, `+225071${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('plusieurs cartes actives sur un même client', () => {
  it('accepte deux cartes actives, de montants différents', async () => {
    const clientId = await creerClient();
    await ouvrirCarte(clientId, 1000);

    const carteId = crypto.randomUUID();
    const { error } = await collecteur.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: 5000 });

    expect(error).toBeNull();
  });

  it('accepte deux cartes actives du même montant', async () => {
    // Deux objectifs d'épargne au même rythme est un cas réel. Aucune règle ne
    // l'interdit — l'ambiguïté d'affichage se règle par la date d'ouverture,
    // pas par un refus de la base.
    const clientId = await creerClient();
    await ouvrirCarte(clientId, 2000);

    const carteId = crypto.randomUUID();
    const { error } = await collecteur.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: 2000 });

    expect(error).toBeNull();
  });

  it('compte les mises carte par carte, sans mélange', async () => {
    const clientId = await creerClient();
    const carteA = await ouvrirCarte(clientId, 1000);
    const carteB = await ouvrirCarte(clientId, 5000);

    await encaisser(carteA, 1000, 3);
    await encaisser(carteB, 5000, 1);

    const { data } = await collecteur.client
      .from('cartes')
      .select('id, mises_encaissees')
      .in('id', [carteA, carteB]);

    const parId = new Map(
      ((data ?? []) as Array<{ id: string; mises_encaissees: number }>).map((c) => [
        c.id,
        c.mises_encaissees,
      ]),
    );
    expect(parId.get(carteA)).toBe(3);
    expect(parId.get(carteB)).toBe(1);
  });

  it('donne à chaque carte sa propre commission, à sa première mise', async () => {
    // Une carte, un cycle, une commission. Trois cartes ouvertes, trois
    // commissions : c'est ce qui rend l'empilement intéressant pour le collecteur.
    const clientId = await creerClient();
    const carteA = await ouvrirCarte(clientId, 1000);
    const carteB = await ouvrirCarte(clientId, 1000);

    await encaisser(carteA, 1000, 2);
    await encaisser(carteB, 1000, 2);

    const { data } = await collecteur.client
      .from('mises')
      .select('carte_id, est_commission')
      .in('carte_id', [carteA, carteB]);

    const commissions = ((data ?? []) as Array<{ carte_id: string; est_commission: boolean }>)
      .filter((m) => m.est_commission)
      .map((m) => m.carte_id)
      .sort();

    expect(commissions).toEqual([carteA, carteB].sort());
  });
});

describe('ce qui ne change pas', () => {
  it('refuse toujours une mise sur une carte au bout de son cycle', async () => {
    // Garder ses mises chez le collecteur, c'est exactement ceci : la carte
    // reste active, elle refuse simplement d'en prendre davantage.
    const clientId = await creerClient();
    const carteId = await ouvrirCarte(clientId, 500);
    await encaisser(carteId, 500, 31);

    const { error } = await collecteur.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant: 500,
      encaisse_le: new Date().toISOString(),
    });

    expect(error?.message).toContain('CYCLE_COMPLET');

    const { data } = await collecteur.client
      .from('cartes')
      .select('statut')
      .eq('id', carteId)
      .single();
    expect((data as { statut: string }).statut).toBe('active');
  });

  it('accepte d’ouvrir une carte pendant qu’une carte pleine reste active', async () => {
    const clientId = await creerClient();
    const pleine = await ouvrirCarte(clientId, 500);
    await encaisser(pleine, 500, 31);

    const carteId = crypto.randomUUID();
    const { error } = await collecteur.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: 500 });

    expect(error).toBeNull();
  });

  it('refuse toujours une carte sur le client d’un autre collecteur', async () => {
    // `cartes_client_du_meme_collecteur` n'est pas l'index qu'on lève. Il tient.
    const autre = await creerCollecteur(`Autre ${MARQUE}`, `+225072${MARQUE}`);
    const clientId = await creerClient();

    const { error } = await autre.client.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: autre.id,
      client_id: clientId,
      mise: 1000,
    });

    expect(error).not.toBeNull();
  });
});

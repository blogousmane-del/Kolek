import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * Ce que ferme un abonnement suspendu, et ce qu'il laisse ouvert.
 *
 * `20260902110000` a resserré `clients_insert` et `cartes_insert` avec
 * `abonnement_ouvre_droit`. La règle a une asymétrie délibérée, écrite dans le
 * commentaire de la fonction : elle n'a **jamais son mot à dire sur
 * l'encaissement d'une carte déjà ouverte**. Un collecteur suspendu n'ouvre plus
 * rien, mais l'argent que ses clients ont déjà commencé à verser continue
 * d'entrer — le contraire prendrait les clients en otage d'un impayé qui n'est
 * pas le leur.
 *
 * Rien ne vérifiait cette asymétrie. Elle tient à l'absence d'une condition sur
 * `mises_insert`, c'est-à-dire à quelque chose qu'on ne voit pas en lisant le
 * fichier — exactement le genre de règle qui se perd au prochain resserrage.
 *
 * Le troisième contrôle porte sur le **texte** du refus, pas seulement sur son
 * code : `apps/collecteur/src/ecritures.ts` s'en sert pour distinguer un
 * abonnement suspendu d'un défaut de l'application, et lui répondre autre chose
 * que « Tu n'as pas le droit d'écrire cette ligne. »
 */

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

let collecteur: CollecteurTest;
let clientExistant: string;
let carteOuverte: string;

beforeAll(async () => {
  collecteur = await creerCollecteur('Abonne Suspendu', telephone());

  clientExistant = crypto.randomUUID();
  carteOuverte = crypto.randomUUID();

  // Le client et la carte naissent AVANT la suspension : ce qui est ouvert
  // reste ouvert, et c'est précisément ce que le dernier cas mesure.
  await admin
    .from('clients')
    .insert({ id: clientExistant, collecteur_id: collecteur.id, nom: 'Client d’avant' });
  await admin.from('cartes').insert({
    id: carteOuverte,
    collecteur_id: collecteur.id,
    client_id: clientExistant,
    mise: 1000,
  });

  await admin
    .from('collecteurs')
    .update({ abonnement_statut: 'suspendu' })
    .eq('id', collecteur.id);
});

describe('un abonnement suspendu', () => {
  it('ferme l’ajout d’un client', async () => {
    const { error } = await collecteur.client
      .from('clients')
      .insert({ id: crypto.randomUUID(), collecteur_id: collecteur.id, nom: 'Client d’après' });

    expect(error?.code).toBe('42501');
    // Le texte, et pas seulement le code : c'est lui qui permet à l'application
    // de nommer la cause. Un `42501` sans ce texte reste un défaut d'application.
    expect(error?.message).toContain('row-level security policy for table "clients"');
  });

  it('ferme l’ouverture d’une carte', async () => {
    const { error } = await collecteur.client.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      client_id: clientExistant,
      mise: 1000,
    });

    expect(error?.code).toBe('42501');
    expect(error?.message).toContain('row-level security policy for table "cartes"');
  });

  it('laisse encaisser sur une carte déjà ouverte', async () => {
    const { error } = await collecteur.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: carteOuverte,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });

    // La promesse faite au collecteur par le message de l'application : « tu
    // peux encaisser sur les cartes déjà ouvertes ». Si ce cas devient rouge,
    // c'est le message qui ment, et il faut le corriger avec la policy.
    expect(error).toBeNull();
  });
});

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

/**
 * La fonction ne répond que sur son appelant.
 *
 * Relevé par l'audit du 2026-09-03 : `abonnement_ouvre_droit` était la seule
 * fonction de lecture à prendre un identifiant sans le borner. `security
 * definer`, ouverte à `authenticated`, son corps était un `exists` sur
 * l'identifiant reçu — sans aucune comparaison à `auth.uid()`.
 *
 * Ce que ça donnait : tout collecteur connecté pouvait demander si un
 * identifiant arbitraire portait un abonnement actif. Il faut déjà connaître
 * l'UUID, et la réponse tient en un booléen — c'est pourquoi ça n'a jamais été
 * plus qu'un jaune. Mais c'est un oracle, et c'était le seul écart de motif avec
 * `equipe_clients`, qui borne le sien à la ligne d'à côté et rend un tableau
 * vide plutôt qu'une erreur, « pour ne rien dire de ce qu'on n'a pas le droit de
 * voir ».
 *
 * Le resserrage est sans risque pour les appelants légitimes, et c'est
 * vérifiable plutôt que supposé : les deux seuls sites d'appel sont les policies
 * `clients_insert` et `cartes_insert`, qui passent toutes deux
 * `(select auth.uid())` — mesuré sur `pg_policies`, pas lu dans un fichier de
 * migration qui pourrait avoir été remplacé depuis. Aucune Edge Function ne
 * l'appelle.
 */
describe('abonnement_ouvre_droit', () => {
  let actif: CollecteurTest;

  beforeAll(async () => {
    actif = await creerCollecteur('Abonne Actif', telephone());
  });

  it('ne renseigne pas sur un autre collecteur', async () => {
    const { data, error } = await collecteur.client.rpc('abonnement_ouvre_droit', {
      p_collecteur: actif.id,
    });

    // `false` et non une erreur : même choix que `equipe_clients`. Un refus
    // explicite distinguerait « cet identifiant existe mais ne te regarde pas »
    // de « cet identifiant n'existe pas », ce qui est encore un oracle.
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it('répond toujours vrai sur soi-même quand l’abonnement est actif', async () => {
    // Le garde-fou de l'autre côté : un resserrage qui rendrait `false` pour
    // tout le monde fermerait l'ouverture de client à des collecteurs à jour,
    // et le test ci-dessus resterait vert.
    const { data, error } = await actif.client.rpc('abonnement_ouvre_droit', {
      p_collecteur: actif.id,
    });

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('laisse un collecteur à jour ouvrir un client', async () => {
    // La conséquence qui compte vraiment. Les deux policies appellent cette
    // fonction ; si le resserrage les casse, c'est le métier qui s'arrête, pas
    // un booléen.
    const { error } = await actif.client
      .from('clients')
      .insert({ id: crypto.randomUUID(), collecteur_id: actif.id, nom: 'Client d’un abonné' });

    expect(error).toBeNull();
  });
});

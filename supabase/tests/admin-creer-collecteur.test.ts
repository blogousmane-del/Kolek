import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * `admin-creer-collecteur` — les deux refus qu'une correction de saisie répare.
 *
 * Le reste de cette fonction est couvert ailleurs : `valider-collecteur` pour la
 * forme des champs, `hibp` pour le mot de passe divulgué, `cors` pour les
 * origines. Ce qui n'était couvert nulle part, c'est ce que l'administrateur
 * lit quand la création échoue — et c'est justement là qu'un message générique
 * envoie recommencer une manœuvre condamnée.
 *
 * Écrit le 2026-09-03, en même temps que le même défaut corrigé côté
 * `collecteur-creer-collaborateur`, où il a été constaté en production.
 */

const BASE = `${process.env.SUPABASE_URL}/functions/v1/admin-creer-collecteur`;

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

function saisie() {
  return {
    email: `collecteur-${crypto.randomUUID()}@kolek.test`,
    // Aléatoire : un mot de passe fixe finirait dans une fuite, et le contrôle
    // HIBP de la fonction ferait échouer la suite sans rapport avec son objet.
    motDePasse: `Kb7-${crypto.randomUUID()}`,
    nom: 'Yao Kouassi',
    telephone: telephone(),
    zone: 'Daloa',
    palier: 'standard',
  };
}

async function appeler(jeton: string, corps: unknown): Promise<Response> {
  return fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify(corps),
  });
}

async function jetonDe(collecteur: CollecteurTest): Promise<string> {
  const { data } = await collecteur.client.auth.getSession();
  return data.session!.access_token;
}

/** Un compte inscrit aux admins, seul habilité à franchir le portillon. */
async function administrateur(nom: string): Promise<CollecteurTest> {
  const compte = await creerCollecteur(nom, telephone());
  const { error } = await admin.from('admins').insert({ user_id: compte.id });
  expect(error).toBeNull();
  return compte;
}

describe('admin-creer-collecteur', () => {
  it('nomme le numéro déjà pris, au lieu d’un « réessaie » sans issue', async () => {
    // `collecteurs.telephone` est unique, donc le déclencheur
    // `creer_collecteur_apres_signup` échoue, donc l'insertion dans
    // `auth.users` échoue — et GoTrue n'en remonte qu'un « Database error
    // creating new user », qui ne nomme ni l'adresse ni le numéro.
    const gtcs = await administrateur('GTCS Doublon');
    const occupe = telephone();
    await creerCollecteur('Deja La', occupe);

    const reponse = await appeler(await jetonDe(gtcs), { ...saisie(), telephone: occupe });

    expect(reponse.status).toBe(409);
    expect((await reponse.json()).erreur).toBe('TELEPHONE_DEJA_PRIS');
  });

  it('nomme l’adresse déjà prise', async () => {
    // Celle-ci, GoTrue la nomme. Ce test tient la lecture de son message, qui
    // n'est pas un contrat et peut changer d'une version à l'autre.
    const gtcs = await administrateur('GTCS Adresse');
    const premier = saisie();

    const creation = await appeler(await jetonDe(gtcs), premier);
    expect(creation.status).toBe(201);
    const id = (await creation.json()).collecteurId;

    const doublon = await appeler(await jetonDe(gtcs), { ...saisie(), email: premier.email });
    expect(doublon.status).toBe(409);
    expect((await doublon.json()).erreur).toBe('EMAIL_DEJA_PRIS');

    await admin.auth.admin.deleteUser(id);
  });
});

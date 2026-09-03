import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * `abonnement-verifier` — le portillon.
 *
 * Cette route réconcilie des paiements et peut **créditer un abonnement**.
 * L'identité y vient du jeton, jamais du corps : un `collecteurId` reçu du
 * téléphone serait un contrôle d'accès délégué au client, et il suffirait de
 * poster l'identifiant d'un autre pour lui offrir un abonnement.
 *
 * ## Deux barrières, et une seule est à nous
 *
 * `verify_jwt` répond avant la fonction : un appel sans porteur, ou avec un
 * porteur mal signé, n'atteint jamais le code — la plateforme rend `401` et son
 * propre corps. Le `JETON_ABSENT` de la fonction reste donc écrit sans être
 * atteignable tant que le drapeau est levé ; il tient le jour où il ne le
 * serait plus, et ces tests ne prétendent pas le mesurer.
 *
 * Ce qui est à nous commence à la **clé publiable** : c'est un JWT valide, la
 * plateforme le laisse passer, et il ne désigne aucun compte. C'est le seul
 * jeton qu'un attaquant possède à coup sûr — il est servi dans le paquet
 * JavaScript des trois sites. Le `403` qu'il reçoit est le test qui compte ici.
 *
 * Le vol préalable `OPTIONS` n'est pas mesuré d'ici : la passerelle y répond
 * elle-même, et un test HTTP mesurerait Kong, pas notre liste d'origines.
 * Celle-ci est éprouvée sur pièce dans `cors.test.ts`, sur `entetesCors`.
 *
 * ## Ce que la base locale ne peut pas mesurer
 *
 * `CHARIOW_CLE_API` n'existe ni en local ni au CI — c'est un secret de
 * production. Un appelant reconnu obtient donc `CONFIGURATION`, et ce refus
 * n'arrive **qu'après** l'identité : un 500 prouve qu'on est passé. Le jour où
 * la clé existera dans l'environnement de test, ce 500 deviendra un 200 ; la
 * dernière assertion porte donc sur ce qui ne doit jamais arriver.
 */

const ROUTE = `${process.env.SUPABASE_URL}/functions/v1/abonnement-verifier`;
const CLE_PUBLIABLE = process.env.SUPABASE_ANON_KEY as string;

const SERIE = String(Date.now()).slice(-7);
let collecteur: CollecteurTest;

async function appeler(jeton: string | null, methode = 'POST'): Promise<Response> {
  return fetch(ROUTE, {
    method: methode,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    ...(methode === 'POST' ? { body: '{}' } : {}),
  });
}

beforeAll(async () => {
  collecteur = await creerCollecteur('Vérif Abonnement', `+225079${SERIE}`);
});

afterAll(nettoyer);

describe('le portillon de abonnement-verifier', () => {
  it('refuse une méthode qui n’est pas POST', async () => {
    // Une route qui crédite ne se déclenche pas sur un GET : un lien, une
    // préconnexion ou un aspirateur de pages y suffiraient.
    expect((await appeler(CLE_PUBLIABLE, 'GET')).status).toBe(405);
  });

  it('n’est pas atteignable sans porteur', async () => {
    // Refus de la plateforme, pas le nôtre — voir l'en-tête. On mesure qu'il a
    // bien lieu, pas quel corps il rend.
    expect((await appeler(null)).status).toBe(401);
  });

  it('n’est pas atteignable avec un porteur mal signé', async () => {
    expect((await appeler('eyJhbGciOiJIUzI1NiJ9.truque.truque')).status).toBe(401);
  });

  it('refuse la clé publiable, qui n’identifie personne', async () => {
    // Le test qui compte. Elle franchit `verify_jwt` — c'est un JWT valide — et
    // ne désigne aucun compte : `getUser` la refuse, et ce refus-là est le seul
    // qui tienne la route contre le jeton qu'un attaquant a déjà.
    const reponse = await appeler(CLE_PUBLIABLE);

    expect(reponse.status).toBe(403);
    expect(await reponse.json()).toMatchObject({ erreur: 'ACCES_RESERVE' });
  });

  it('laisse passer un collecteur connecté', async () => {
    const { data } = await collecteur.client.auth.getSession();

    const reponse = await appeler(data.session!.access_token);

    // Ni 401 ni 403 : le portillon s'est ouvert. Ce qui suit dépend de la
    // présence de `CHARIOW_CLE_API`, absente ici — voir l'en-tête.
    expect([401, 403]).not.toContain(reponse.status);
    expect(await reponse.json()).toMatchObject({ erreur: 'CONFIGURATION' });
  });
});

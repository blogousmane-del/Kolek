import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le drainage des avis : sa porte, et la réservation de son lot.
 *
 * Deux défauts ouverts par l'audit du 2026-08-25 et redits à l'identique le 28
 * août, le 2 puis le 3 septembre. Ils ne se corrigent pas séparément, et ce
 * fichier les mesure ensemble.
 *
 * **La porte.** `envoyer-avis` n'émet aucun en-tête CORS, ce qui dit une
 * intention et n'arrête personne. La seule barrière était `verify_jwt`, que la
 * clé publiable franchit — elle est servie dans le paquet JavaScript des trois
 * sites, par construction. Le test qui compte ici est celui de la clé
 * publiable : c'est exactement le jeton qu'un attaquant a déjà.
 *
 * **Ce que la porte compare, depuis le 2026-09-04.** Le premier correctif
 * comparait le porteur à `SUPABASE_SERVICE_ROLE_KEY`, en la tenant pour la
 * valeur que l'horloge sort de Vault. Ce sont deux choses différentes — la
 * plateforme injecte `SUPABASE_SERVICE_ROLE_KEY = eyJ…` à côté de
 * `SUPABASE_INTERNAL_SECRET_KEY = sb_secret_…`, et Vault porte la seconde forme
 * depuis le 2026-08-28. Le drainage s'est arrêté en production au déploiement.
 *
 * Ce fichier ne l'a pas vu, et c'est le vrai enseignement : son test d'acceptation
 * présentait `SUPABASE_SERVICE_ROLE_KEY` en porteur, c'est-à-dire la variable que
 * la fonction lisait elle-même. Il mesurait la fonction contre elle-même, jamais
 * contre ce que l'appelant réel envoie. `refuse la clé de service seule`
 * ci-dessous est le test qui manquait.
 *
 * **Le lot.** Sans réservation, deux drainages lisent les mêmes cinquante
 * lignes, envoient deux fois le même SMS à de vrais clients, et décomptent deux
 * fois le quota. Il n'en faut pas dix : un lot de cinquante SMS dépasse la
 * minute qui sépare deux réveils de l'horloge.
 *
 * ## Le balayage de `beforeEach`, et pourquoi il est global
 *
 * `avis_reserver_lot` sert la file entière — c'est son rôle : le drainage n'est
 * pas au service d'un collecteur. Une ligne laissée par un autre fichier de test
 * entrerait donc dans les lots mesurés ici. `fileParallelism: false` garantit
 * qu'aucun autre fichier ne tourne pendant celui-ci, et aucun ne compte sur des
 * lignes d'avis survivant à son propre `beforeEach`.
 */

const ROUTE = `${process.env.SUPABASE_URL}/functions/v1/envoyer-avis`;
const CLE_PUBLIABLE = process.env.SUPABASE_ANON_KEY as string;
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

/** Lu dans le fichier même que le runtime local charge au démarrage. Une
    constante recopiée ici passerait au vert avec un runtime qui n'a pas le
    secret — le test dirait « la porte s'ouvre » en mesurant sa propre chaîne. */
const ENV_FONCTIONS = readFileSync('supabase/functions/.env', 'utf8');
const SECRET_DRAINAGE = (ENV_FONCTIONS.match(/^DRAINAGE_SECRET=(.+)$/m)?.[1] ?? '').trim();

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;
let clientId: string;
let numero = 0;

interface LigneReservee {
  id: string;
  collecteur_id: string;
  destinataire: string;
  corps: string;
  segments: number;
  tentatives: number;
}

/** `secret` reproduit ce que `avis_declencher_drainage()` envoie : le porteur
    ne sert qu'à traverser `verify_jwt`, l'en-tête seul ouvre. */
async function appeler(jeton: string | null, secret: string | null = null): Promise<Response> {
  return fetch(ROUTE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      ...(secret ? { 'x-kolek-drainage': secret } : {}),
    },
    body: '{}',
  });
}

async function reserver(taille?: number): Promise<LigneReservee[]> {
  const { data, error } = await admin.rpc(
    'avis_reserver_lot',
    taille === undefined ? {} : { p_taille: taille },
  );
  expect(error).toBeNull();
  return (data ?? []) as LigneReservee[];
}

/** Une ligne d'avis prête à partir. `source_id` n'est pas une clé étrangère —
    seule l'unicité (source_table, source_id, canal) compte, d'où l'UUID. */
async function poser(champs: Record<string, unknown> = {}): Promise<string> {
  numero += 1;
  const { data, error } = await admin
    .from('avis_clients')
    .insert({
      collecteur_id: collecteur.id,
      client_id: clientId,
      source_table: 'mises',
      source_id: crypto.randomUUID(),
      destinataire: '+2250700000001',
      canal: 'sms',
      corps: `Avis ${numero}`,
      segments: 1,
      ...champs,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function lire(id: string): Promise<Record<string, unknown>> {
  const { data } = await admin.from('avis_clients').select('*').eq('id', id).single();
  return data as Record<string, unknown>;
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Drainage ${MARQUE}`, `+225078${MARQUE}`);

  const { data, error } = await collecteur.client
    .from('clients')
    .insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      nom: `Client ${MARQUE}`,
      telephone: '+2250700000001',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  clientId = (data as { id: string }).id;
});

beforeEach(async () => {
  // Voir l'en-tête : le balayage est global parce que la réservation l'est.
  await admin.from('avis_clients').delete().not('id', 'is', null);
});

afterAll(nettoyer);

describe('la porte de envoyer-avis', () => {
  it('refuse un appel sans jeton', async () => {
    expect((await appeler(null)).status).toBe(401);
  });

  it('refuse la clé publiable, celle que porte le paquet des trois sites', async () => {
    // Le test de ce fichier. Jusqu'au 2026-09-03 cet appel rendait 200 et
    // vidait la file : `verify_jwt` accepte la clé publiable, et rien d'autre
    // ne regardait l'appelant.
    const reponse = await appeler(CLE_PUBLIABLE);

    expect(reponse.status).toBe(403);
    expect(await reponse.json()).toEqual({ erreur: 'ACCES_RESERVE' });
  });

  it('refuse le jeton d’un collecteur connecté', async () => {
    const { data } = await collecteur.client.auth.getSession();
    const reponse = await appeler(data.session!.access_token);

    expect(reponse.status).toBe(403);
  });

  it('ne dit pas si la passerelle est configurée avant d’avoir reconnu l’appelant', async () => {
    // Deux refus indiscernables. Sans ça, la seule différence entre deux
    // réponses apprendrait à un inconnu si les identifiants SMS sont posés.
    const publiable = await appeler(CLE_PUBLIABLE);
    const { data } = await collecteur.client.auth.getSession();
    const collecteurJeton = await appeler(data.session!.access_token);

    // Les deux statuts font partie de l'assertion : sans eux, ce test passerait
    // aussi bien avec la porte grande ouverte — deux 200 identiques sont
    // identiques eux aussi.
    expect([publiable.status, collecteurJeton.status]).toEqual([403, 403]);
    expect(await publiable.json()).toEqual(await collecteurJeton.json());
  });

  it('refuse la clé de service seule — le défaut du 2026-09-04', async () => {
    // Le test qui manquait, et qui a coûté une panne silencieuse en production.
    //
    // Jusqu'ici, cet appel exact rendait 200 : la fonction comparait le porteur
    // à `SUPABASE_SERVICE_ROLE_KEY`, et le test présentait cette même variable.
    // L'appelant réel, lui, présente ce que Vault contient — `sb_secret_…`, une
    // autre valeur. La production a donc rendu 403 pendant que la suite était
    // verte.
    //
    // Le sens n'est plus « la clé de service ouvre » mais « rien n'ouvre sauf le
    // secret de drainage ». La clé de service est un jeton comme un autre.
    const reponse = await appeler(CLE_SERVICE);

    expect(reponse.status).toBe(403);
    expect(await reponse.json()).toEqual({ erreur: 'ACCES_RESERVE' });
  });

  it('refuse un secret de drainage faux', async () => {
    // Même longueur, même forme, un caractère de moins au bout : ce qu'une
    // troncature au collage produit. Sans ce test, une comparaison sur un
    // préfixe passerait.
    const reponse = await appeler(CLE_SERVICE, SECRET_DRAINAGE.slice(0, -1));

    expect(reponse.status).toBe(403);
    expect(await reponse.json()).toEqual({ erreur: 'ACCES_RESERVE' });
  });

  it('accepte le secret de drainage, et laisse la file intacte sans passerelle', async () => {
    const id = await poser();

    const reponse = await appeler(CLE_SERVICE, SECRET_DRAINAGE);

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ etat: 'PASSERELLE_NON_CONFIGUREE' });
    // Aucun envoi simulé, aucune ligne marquée : la file repartira telle quelle
    // le jour où les identifiants arriveront.
    expect(await lire(id)).toMatchObject({ statut: 'a_envoyer', tentatives: 0 });
  });

  it('n’exige plus rien du porteur — c’est voulu, et c’est le correctif', async () => {
    // La clé publiable ouvre, dès lors que l'en-tête est bon. Ça se lit mal et
    // c'est pourtant le point : la porte ne dépend plus d'une clé dont la
    // rotation ne nous appartient pas. Ce qu'elle protège tient entièrement au
    // secret de drainage, qui n'est publié nulle part — contrairement à la clé
    // publiable, servie dans le paquet JavaScript des trois sites.
    const reponse = await appeler(CLE_PUBLIABLE, SECRET_DRAINAGE);

    expect(reponse.status).toBe(200);
  });
});

describe('le secret de drainage, des deux côtés', () => {
  it('n’est pas un vrai secret dans le fichier versionné', () => {
    // `supabase/functions/.env` est commité — voir `.gitignore` — parce que le
    // runtime local le lit au démarrage et qu'une machine neuve serait rouge
    // sans lui. Le prix de cette exception est ce contrôle : le jour où
    // quelqu'un y colle le secret de production, la suite le dit avant que git
    // ne le publie.
    expect(SECRET_DRAINAGE).toMatch(/^test_local_/);
    // Assez long pour que `avis_declencher_drainage()` l'accepte : sinon le
    // fichier passerait ce test et la fonction SQL le rejetterait en
    // `SECRET_DRAINAGE_COURT`, hors de portée de toute mesure d'ici.
    expect(SECRET_DRAINAGE.length).toBeGreaterThanOrEqual(32);
  });

  it('est présenté par l’horloge dans l’en-tête, et lu dans Vault', () => {
    // Lecture du source : `avis_declencher_drainage()` est révoquée pour
    // `service_role` (test suivant), donc le harnais ne peut pas l'exécuter, et
    // aucune mesure d'ici ne peut voir ce qu'elle envoie. Ça ne vaut pas une
    // mesure ; c'est écrit pour qu'on ne le prenne pas pour une.
    //
    // Ce qu'il couvre est précis : un retour au couplage d'avant, où l'horloge
    // ne présentait que la clé de service, laisserait tout le reste au vert
    // puisque la porte, elle, accepte n'importe quel porteur.
    const source = readFileSync(
      'supabase/migrations/20260904090000_avis_secret_dedie.sql',
      'utf8',
    );

    expect(source).toContain("name = 'kolek_secret_drainage'");
    expect(source).toContain("'x-kolek-drainage', secret");
  });

  it('n’est pas atteignable par le porteur de la clé de service', async () => {
    // L'horloge tourne en `postgres`. Si `service_role` pouvait l'appeler,
    // n'importe quel détenteur de la clé de service déclencherait un drainage —
    // et surtout ferait sortir de Vault, en clair dans un en-tête HTTP, un
    // secret que rien d'autre ne lui donnerait.
    const { error } = await admin.rpc('avis_declencher_drainage');

    expect(error).not.toBeNull();
  });
});

describe('la réservation du lot', () => {
  it('est fermée au porteur de la clé publiable', async () => {
    // Elle sort les numéros de téléphone et le corps des messages de toute la
    // plateforme. Le garde-fou de la migration le vérifie aussi ; ici on le
    // mesure par le chemin qu'emprunterait un attaquant.
    const { error } = await anonyme.rpc('avis_reserver_lot', { p_taille: 10 });

    expect(error).not.toBeNull();
  });

  it('marque « en_cours », compte la tentative, et rend ce qu’elle a marqué', async () => {
    const id = await poser();

    const lot = await reserver();

    expect(lot.map((l) => l.id)).toEqual([id]);
    expect(lot[0]).toMatchObject({
      collecteur_id: collecteur.id,
      destinataire: '+2250700000001',
      segments: 1,
      tentatives: 1,
    });
    expect(await lire(id)).toMatchObject({ statut: 'en_cours', tentatives: 1 });
  });

  it('ne rend jamais deux fois la même ligne', async () => {
    await poser();
    await poser();
    await poser();

    const premier = await reserver();
    const second = await reserver();

    expect(premier).toHaveLength(3);
    expect(second).toEqual([]);
  });

  it('porte la clause qui empêche deux drainages de se voler le lot', async () => {
    // Ce que ce fichier ne peut pas mesurer, et pourquoi il le dit.
    //
    // La propriété visée est un entrelacement : deux transactions dans la même
    // fenêtre de quelques millisecondes. Le harnais passe par PostgREST, en
    // HTTP ; deux appels lancés ensemble finissent l'un après l'autre, et un
    // `Promise.all` sur deux réservations passe aussi bien **sans**
    // `skip locked` que avec — mesuré le 2026-09-03, clause retirée, test vert.
    // Un test qui ne peut pas échouer pour la bonne raison n'est pas un test.
    //
    // Reste ce qui est vérifiable d'ici : la clause est là. C'est un garde-fou
    // de forme, il ne prouve pas la sémantique, et il tombe le jour où
    // quelqu'un l'enlève — ce qui est exactement le risque à couvrir.
    const { data, error } = await admin.rpc('avis_reservation_verrouillee');

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('libère une réservation abandonnée depuis plus de cinq minutes, et la reprend', async () => {
    // Le prix de la réservation : un état où l'on peut rester coincé. Sans
    // cette libération, une fonction qui meurt entre la réservation et l'envoi
    // enterre la ligne, et rien ne le dit.
    const id = await poser();
    await reserver();
    await admin
      .from('avis_clients')
      .update({ reserve_le: new Date(Date.now() - 6 * 60_000).toISOString() })
      .eq('id', id);

    const repris = await reserver();

    expect(repris.map((l) => l.id)).toEqual([id]);
    // La libération et la reprise tiennent dans le même appel : une reprise
    // n'attend pas le tour suivant de l'horloge.
    expect(repris[0]?.tentatives).toBe(2);
    expect(await lire(id)).toMatchObject({ derniere_erreur: 'DRAINAGE_INTERROMPU' });
  });

  it('ne touche pas une réservation encore fraîche', async () => {
    const id = await poser();
    await reserver();
    await admin
      .from('avis_clients')
      .update({ reserve_le: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', id);

    expect(await reserver()).toEqual([]);
  });

  it('abandonne la ligne au troisième essai plutôt que de tourner sans fin', async () => {
    await poser({ statut: 'echoue', tentatives: 3 });
    const presque = await poser({ statut: 'echoue', tentatives: 2 });

    const lot = await reserver();

    expect(lot.map((l) => l.id)).toEqual([presque]);
    expect(lot[0]?.tentatives).toBe(3);
  });

  it('borne la taille du lot des deux côtés', async () => {
    for (let i = 0; i < 3; i += 1) await poser();

    expect(await reserver(1)).toHaveLength(1);
    // Une demande vide ou absurde ne réserve rien, plutôt que de faire lever la
    // base sur un `limit` négatif.
    expect(await reserver(0)).toEqual([]);
    expect(await reserver(-5)).toEqual([]);
  });
});

describe('le drainage passe bien par la réservation', () => {
  it('ne lit plus la file par un select', () => {
    // Le seul trou que les tests ci-dessus laissent. Sans passerelle SMS
    // configurée, `envoyer-avis` répond `PASSERELLE_NON_CONFIGUREE` avant
    // d'atteindre la file : la base locale ne peut donc pas voir par quel
    // chemin la fonction obtient son lot. Un retour au `select` d'avant le
    // 2026-09-03 laisserait toute cette suite au vert.
    //
    // Lecture du source, donc, comme `scripts/verifier-bundles.mjs` le fait
    // pour les clés. Ça ne vaut pas une mesure, et c'est écrit ici pour qu'on
    // ne le prenne pas pour une.
    const source = readFileSync('supabase/functions/envoyer-avis/index.ts', 'utf8');

    expect(source).toContain("client.rpc('avis_reserver_lot'");
    // Motif tolérant aux retours à la ligne : le dépôt est en CRLF, et un `\n`
    // dans la chaîne cherchée ferait un contrôle qui ne peut pas trouver — donc
    // qui ne peut pas échouer.
    expect(source).not.toMatch(/\.from\('avis_clients'\)\s*\.select\(/);
  });
});

describe('la console d’administration', () => {
  it('compte une ligne réservée comme « en attente »', async () => {
    // Sinon le compteur tombe à zéro pendant qu'un lot est en vol, et GTCS lit
    // « la file est vide » au moment précis où elle ne l'est pas.
    await poser();
    await reserver();

    const { data } = await admin.rpc('admin_avis');
    const etat = data as { collecteurs: Array<{ id: string; en_attente: number }> };
    const moi = etat.collecteurs.find((c) => c.id === collecteur.id);

    expect(moi?.en_attente).toBe(1);
  });
});

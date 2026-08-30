import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Les deux routes du Super Admin.
 *
 * ## Le portillon n'est pas celui du Dashboard
 *
 * `est_admin()` ouvre le Dashboard métier. Ces deux routes demandent
 * `est_super_admin()`, et le test qui compte est celui-là : un administrateur
 * parfaitement légitime, qui encaisse et suit les tournées tous les jours, doit
 * se voir refuser l'entrée. Sans ce test, la séparation des deux niveaux ne
 * serait qu'une intention.
 *
 * Comme les sept fonctions d'administration existantes, le contrôle se fait
 * **avec le jeton de l'appelant**, jamais avec la clé de service, et toute
 * réponse autre qu'un `true` franc referme la porte.
 *
 * ## L'appelant est déclaré à la base
 *
 * Passé le portillon, la clé de service sort — et elle porte l'en-tête
 * `x-kolek-acteur`. C'est ce qui permet aux déclencheurs de journal d'écrire
 * qui a agi plutôt que sur qui. Sans lui, `super_admin_definir_niveau()`
 * refuserait : un changement de privilège sans auteur enregistré n'a pas lieu
 * d'aboutir.
 *
 * ## Un refus métier n'est pas un succès
 *
 * « Tu ne peux pas te rétrograder toi-même » rend 409, pas 200. Un refus servi
 * en 200 finit lu comme une réussite par le premier appelant qui ne regarde que
 * le statut — et celui-là existe toujours.
 */

const MARQUE = crypto.randomUUID().slice(0, 6).toUpperCase();
const BASE = `${process.env.SUPABASE_URL}/functions/v1`;

let patron: CollecteurTest; // super admin
let metier: CollecteurTest; // administrateur ordinaire
let simple: CollecteurTest; // aucun droit
let cible: CollecteurTest; // sujet des actions

let jetonPatron: string;
let jetonMetier: string;
let jetonSimple: string;

const CODE = `ROUTE${MARQUE}`;

function exigerSucces(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

async function jetonDe(c: CollecteurTest): Promise<string> {
  const { data } = await c.client.auth.getSession();
  return data.session!.access_token;
}

function etat(jeton?: string) {
  return fetch(`${BASE}/super-admin-etat`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY!,
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
  });
}

function agir(jeton: string, corps: unknown) {
  return fetch(`${BASE}/super-admin-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${jeton}`,
    },
    body: JSON.stringify(corps),
  });
}

beforeAll(async () => {
  patron = await creerCollecteur(`Patron ${MARQUE}`, `+22521${Date.now() % 1000000}`);
  metier = await creerCollecteur(`Metier ${MARQUE}`, `+22522${Date.now() % 1000000}`);
  simple = await creerCollecteur(`Simple ${MARQUE}`, `+22523${Date.now() % 1000000}`);
  cible = await creerCollecteur(`Cible ${MARQUE}`, `+22524${Date.now() % 1000000}`);

  exigerSucces(
    'privilèges',
    (
      await admin.from('admins').insert([
        { user_id: patron.id, niveau: 'super' },
        { user_id: metier.id, niveau: 'admin' },
      ])
    ).error,
  );

  jetonPatron = await jetonDe(patron);
  jetonMetier = await jetonDe(metier);
  jetonSimple = await jetonDe(simple);
});

afterAll(async () => {
  await admin
    .from('collecteurs')
    .update({ promo_code: null, remise_pct: null, remise_fin: null })
    .eq('id', cible.id);
  await admin.from('admins').delete().in('user_id', [patron.id, metier.id, cible.id]);
  await admin.from('codes_promo').delete().eq('code', CODE);
  await nettoyer();
});

describe('le portillon de l’état', () => {
  it('refuse sans jeton', async () => {
    expect((await etat()).status).toBe(401);
  });

  it('refuse un collecteur sans droit', async () => {
    expect((await etat(jetonSimple)).status).toBe(403);
  });

  it('refuse un administrateur métier', async () => {
    // Le test qui donne son sens aux deux niveaux. Ce compte ouvre le
    // Dashboard tous les jours et n'a rien à faire ici.
    const reponse = await etat(jetonMetier);
    expect(reponse.status).toBe(403);
    expect((await reponse.json()).erreur).toBe('ACCES_RESERVE');
  });
});

describe('l’état', () => {
  it('rend les trois listes et les volumes de la base', async () => {
    const reponse = await etat(jetonPatron);
    expect(reponse.status).toBe(200);
    const corps = await reponse.json();

    expect(Array.isArray(corps.administrateurs)).toBe(true);
    expect(Array.isArray(corps.codes_promo)).toBe(true);
    expect(Array.isArray(corps.remises)).toBe(true);
    expect(typeof corps.volumes?.collecteurs).toBe('number');
  });

  it('nomme l’appelant, pour que l’écran sache marquer « c’est toi »', async () => {
    const corps = await (await etat(jetonPatron)).json();
    expect(corps.appelant).toBe(patron.id);
  });
});

describe('les actions', () => {
  it('refuse un administrateur métier', async () => {
    const reponse = await agir(jetonMetier, { action: 'definir_niveau', cible: cible.id, niveau: 'admin' });
    expect(reponse.status).toBe(403);
  });

  it('refuse une action qu’elle ne connaît pas', async () => {
    const reponse = await agir(jetonPatron, { action: 'tout_effacer' });
    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('ACTION_INCONNUE');
  });

  it('inscrit un administrateur, et le journal nomme l’appelant', async () => {
    const reponse = await agir(jetonPatron, {
      action: 'definir_niveau',
      cible: cible.id,
      niveau: 'admin',
    });
    expect(reponse.status).toBe(200);
    expect((await reponse.json()).fait).toBe(true);

    const { data } = await admin
      .from('audit_log')
      .select('acteur_id')
      .eq('table_cible', 'admins')
      .eq('ligne_id', cible.id)
      .eq('action', 'insert')
      .order('survenu_le', { ascending: false })
      .limit(1);
    expect((data?.[0] as { acteur_id: string }).acteur_id).toBe(patron.id);
  });

  it('rend 409 sur un refus métier, jamais 200', async () => {
    // Un refus servi en 200 finit lu comme une réussite par le premier
    // appelant qui ne regarde que le statut.
    const reponse = await agir(jetonPatron, {
      action: 'definir_niveau',
      cible: patron.id,
      niveau: 'admin',
    });
    expect(reponse.status).toBe(409);
    expect((await reponse.json()).raison).toBe('action_sur_soi');
  });

  it('rend 400 sur une date malformée, et non 500', async () => {
    // Constat d'audit de kolek-00. Une date invalide lève 22007, que ni la
    // branche 23505 ni la 23514 n'attrapent : elle sortait en 500, alors que
    // l'en-tête du fichier promet 400 pour une requête mal formée. Une faute
    // de frappe n'est pas une panne du serveur.
    const reponse = await agir(jetonPatron, {
      action: 'creer_code',
      code: `DATE${MARQUE}`,
      remise_pct: 10,
      valide_du: 'pas-une-date',
      valide_au: '2099-12-31',
    });
    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('CHAMPS_INVALIDES');
  });

  it('crée un code promo', async () => {
    const reponse = await agir(jetonPatron, {
      action: 'creer_code',
      code: CODE,
      remise_pct: 30,
      valide_du: '2026-01-01',
      valide_au: '2099-12-31',
      quota: 5,
    });
    expect(reponse.status).toBe(200);

    const corps = await (await etat(jetonPatron)).json();
    expect(corps.codes_promo.find((c: { code: string }) => c.code === CODE)?.statut).toBe('en_cours');
  });

  it('applique un code à un collecteur', async () => {
    const reponse = await agir(jetonPatron, {
      action: 'appliquer_code',
      collecteur: cible.id,
      code: CODE,
    });
    expect(reponse.status).toBe(200);
    expect((await reponse.json()).remise_pct).toBe(30);

    const corps = await (await etat(jetonPatron)).json();
    const ligne = corps.remises.find((r: { collecteur_id: string }) => r.collecteur_id === cible.id);
    expect(ligne?.remise_pct).toBe(30);
  });

  it('révoque un administrateur', async () => {
    const reponse = await agir(jetonPatron, { action: 'revoquer', cible: cible.id });
    expect(reponse.status).toBe(200);

    const corps = await (await etat(jetonPatron)).json();
    expect(corps.administrateurs.some((a: { user_id: string }) => a.user_id === cible.id)).toBe(false);
  });
});

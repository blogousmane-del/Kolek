import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * La route qui sert le journal d'audit.
 *
 * `super_admin_journal()` était écrite, testée et fermée depuis le matin — mais
 * aucune route ne la servait. Une fonction SQL que personne ne peut appeler est
 * une promesse, pas une fonctionnalité.
 *
 * ## Ce qui est vérifié ici et pas en SQL
 *
 * Les tests de `journal-consultation.test.ts` portent sur la fonction : la
 * pagination, le rang calculé après la fenêtre, la borne à 200. Ceux-ci portent
 * sur la porte et sur ce qui traverse : qui entre, ce qui ressort, et le fait
 * que la lecture laisse elle-même une trace.
 *
 * ## Lire le journal est une action
 *
 * C'est l'action qui révèle tout le reste, et ce serait la seule à ne rien
 * laisser. La consultation s'écrit donc **après** une lecture réussie : si la
 * base refuse, rien n'a été révélé, et une trace de consultation dirait le
 * contraire.
 */

const MARQUE = crypto.randomUUID().slice(0, 6).toUpperCase();
const BASE = `${process.env.SUPABASE_URL}/functions/v1`;

let patron: CollecteurTest;
let metier: CollecteurTest;

let jetonPatron: string;
let jetonMetier: string;

function exigerSucces(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

async function jetonDe(c: CollecteurTest): Promise<string> {
  const { data } = await c.client.auth.getSession();
  return data.session!.access_token;
}

function journal(jeton?: string, requete = '') {
  return fetch(`${BASE}/super-admin-journal${requete}`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY!,
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
  });
}

beforeAll(async () => {
  patron = await creerCollecteur(`JPatron ${MARQUE}`, `+22531${Date.now() % 1000000}`);
  metier = await creerCollecteur(`JMetier ${MARQUE}`, `+22532${Date.now() % 1000000}`);

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
});

afterAll(async () => {
  await admin.from('admins').delete().in('user_id', [patron.id, metier.id]);
  await nettoyer();
});

describe('le portillon du journal', () => {
  it('refuse sans jeton', async () => {
    expect((await journal()).status).toBe(401);
  });

  it('refuse un administrateur métier', async () => {
    // Le journal nomme qui a fait quoi sur toute la plateforme. Un
    // administrateur métier a un compte légitime et n'a pas à le lire.
    const reponse = await journal(jetonMetier);
    expect(reponse.status).toBe(403);
    expect((await reponse.json()).erreur).toBe('ACCES_RESERVE');
  });
});

describe('le journal', () => {
  it('rend une page de lignes et dit s’il en reste', async () => {
    const reponse = await journal(jetonPatron, '?taille=5');
    expect(reponse.status).toBe(200);

    const corps = await reponse.json();
    expect(Array.isArray(corps.lignes)).toBe(true);
    expect(corps.lignes.length).toBeLessThanOrEqual(5);
    expect(typeof corps.a_suivre).toBe('boolean');
    // La page et la taille reviennent : l'écran ne doit pas deviner ce que le
    // serveur a réellement appliqué après ses propres bornes.
    expect(corps.page).toBe(1);
    expect(corps.taille).toBe(5);
  });

  it('borne la taille demandée au lieu de la croire', async () => {
    const corps = await (await journal(jetonPatron, '?taille=9999')).json();
    expect(corps.taille).toBe(200);
  });

  it('refuse une page qui n’est pas un nombre', async () => {
    // Passée telle quelle, elle ferait lever une conversion et sortirait en
    // 500 — ce qui se lit comme une panne alors que c'est une faute de frappe.
    const reponse = await journal(jetonPatron, '?page=deux');
    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('CHAMPS_INVALIDES');
  });

  it('enregistre la consultation, au nom de qui a lu', async () => {
    await journal(jetonPatron, '?taille=3');

    const { data } = await admin
      .from('audit_log')
      .select('acteur_id, action, table_cible')
      .eq('table_cible', 'audit_log')
      .eq('acteur_id', patron.id)
      .order('survenu_le', { ascending: false })
      .limit(1);

    expect(data?.length).toBe(1);
    expect((data?.[0] as { action: string }).action).toBe('select');
  });

  it('accepte les mêmes paramètres dans le corps d’un POST', async () => {
    // C'est la forme que prend `functions.invoke` depuis l'écran : il pose un
    // corps JSON et ne sait pas construire de chaîne de requête. Sans cette
    // lecture, l'écran demanderait toujours la page 1.
    const reponse = await fetch(`${BASE}/super-admin-journal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${jetonPatron}`,
      },
      body: JSON.stringify({ page: 2, taille: 3 }),
    });

    expect(reponse.status).toBe(200);
    const corps = await reponse.json();
    expect(corps.page).toBe(2);
    expect(corps.taille).toBe(3);
  });

  it('masque les consultations par défaut, et les montre à la demande', async () => {
    // Sans ce masquage, chaque lecture ajoute une ligne que la lecture suivante
    // affiche : en une semaine le journal ne parlerait plus que de lui-même.
    const parDefaut = await (await journal(jetonPatron, '?taille=50')).json();
    expect(
      parDefaut.lignes.some((l: { table_cible: string }) => l.table_cible === 'audit_log'),
    ).toBe(false);

    const avec = await (await journal(jetonPatron, '?taille=50&consultations=1')).json();
    expect(avec.lignes.some((l: { table_cible: string }) => l.table_cible === 'audit_log')).toBe(
      true,
    );
  });
});

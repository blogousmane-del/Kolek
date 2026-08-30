import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le journal disait sur qui, jamais par qui.
 *
 * ## Le constat
 *
 * `audit_log.collecteur_id` est le **sujet** de la ligne, pas son auteur.
 * `journaliser()` y écrit `ligne->>'collecteur_id'` — le collecteur qui possède
 * le client, la carte ou la caisse. `journaliser_admin()` y écrit `user_id` :
 * la trace d'une promotion nomme le promu, jamais le promoteur.
 *
 * Le défaut n'est pas l'absence d'information, c'est qu'elle **se lit pour ce
 * qu'elle n'est pas**. Quand un administrateur supprime le client d'un
 * collecteur par la clé de service, le journal enregistre le collecteur. Qui
 * relit accuse celui qui n'a rien fait — et précisément dans le seul cas où le
 * journal sert à quelque chose.
 *
 * ## Ce que `acteur_id` ajoute
 *
 * Une colonne, et une règle : l'identité vient du jeton de l'appelant, sauf
 * pour `service_role`, qui est le seul rôle autorisé à déclarer un acteur —
 * parce qu'il est le seul à agir pour le compte de quelqu'un d'autre.
 *
 * Un collecteur qui envoie l'en-tête lui-même est ignoré : sans cette règle,
 * la colonne serait une case à remplir par celui qu'elle désigne, ce qui est
 * pire qu'une colonne vide. Le dernier test de ce fichier est celui-là.
 *
 * Une écriture `service_role` sans en-tête laisse `acteur_id` à `null`. C'est
 * voulu : « non attribué » est une réponse, retomber sur le sujet n'en est pas
 * une — c'est le défaut qu'on répare.
 */

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sansSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Client à clé de service qui déclare agir pour le compte de `acteurId`. */
function adminPour(acteurId: string): SupabaseClient {
  return createClient(url, serviceKey, {
    ...sansSession,
    global: { headers: { 'x-kolek-acteur': acteurId } },
  });
}

const MARQUE = crypto.randomUUID().slice(0, 8);
let sujet: CollecteurTest;
let agissant: CollecteurTest;

beforeAll(async () => {
  sujet = await creerCollecteur(`Sujet ${MARQUE}`, `+225071${MARQUE}`);
  agissant = await creerCollecteur(`Acteur ${MARQUE}`, `+225072${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

/** La trace d'une ligne sur une table nommée. Le filtre par table est
    indispensable : `admins.user_id` et `collecteurs.id` sont le même
    identifiant, et sans lui un test verrait vert la trace de l'autre table. */
async function traceDe(
  ligneId: string,
  table: string,
  action: string,
): Promise<{ acteur_id: string | null; collecteur_id: string | null } | null> {
  const { data } = await admin
    .from('audit_log')
    .select('acteur_id, collecteur_id')
    .eq('ligne_id', ligneId)
    .eq('table_cible', table)
    .eq('action', action)
    .order('survenu_le', { ascending: false })
    .limit(1);
  return (data?.[0] as { acteur_id: string | null; collecteur_id: string | null }) ?? null;
}

describe('le journal nomme qui agit', () => {
  it('nomme le collecteur qui écrit sous son propre jeton', async () => {
    const clientId = crypto.randomUUID();
    const { error } = await sujet.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: sujet.id, nom: `Direct ${MARQUE}` });
    expect(error).toBeNull();

    expect((await traceDe(clientId, 'clients', 'insert'))?.acteur_id).toBe(sujet.id);
  });

  it('ne nomme personne quand la clé de service n’a rien déclaré', async () => {
    // `null` est une réponse honnête. Retomber sur le sujet ferait dire au
    // journal que le collecteur a fait ce qu'un administrateur a fait.
    const clientId = crypto.randomUUID();
    await admin
      .from('clients')
      .insert({ id: clientId, collecteur_id: sujet.id, nom: `Anonyme ${MARQUE}` });

    const trace = await traceDe(clientId, 'clients', 'insert');
    expect(trace?.acteur_id).toBeNull();
    expect(trace?.collecteur_id).toBe(sujet.id);
  });

  it('distingue l’acteur du sujet quand la clé de service le déclare', async () => {
    const clientId = crypto.randomUUID();
    await adminPour(agissant.id)
      .from('clients')
      .insert({ id: clientId, collecteur_id: sujet.id, nom: `Pour autrui ${MARQUE}` });

    const trace = await traceDe(clientId, 'clients', 'insert');
    expect(trace?.acteur_id).toBe(agissant.id);
    expect(trace?.collecteur_id).toBe(sujet.id);
  });

  it('nomme le promoteur, pas le promu, quand un droit est accordé', async () => {
    // Le cas qui justifie la colonne. Sans elle, la trace d'une promotion ne
    // porte que le promu — donc rien sur qui a ouvert la porte.
    await adminPour(agissant.id).from('admins').insert({ user_id: sujet.id });

    const trace = await traceDe(sujet.id, 'admins', 'insert');
    expect(trace?.acteur_id).toBe(agissant.id);
    expect(trace?.acteur_id).not.toBe(sujet.id);

    await admin.from('admins').delete().eq('user_id', sujet.id);
  });

  it('ignore l’en-tête envoyé par un collecteur authentifié', async () => {
    // Une colonne d'imputation que le sujet peut remplir lui-même ne vaut rien.
    // Seul `service_role` agit pour le compte d'autrui ; les autres sont
    // identifiés par leur jeton, quoi qu'ils envoient.
    const menteur = createClient(url, anonKey, {
      ...sansSession,
      global: { headers: { 'x-kolek-acteur': agissant.id } },
    });
    const { error: erreurConnexion } = await menteur.auth.signInWithPassword({
      email: sujet.email,
      password: 'kolek-test-2026',
    });
    expect(erreurConnexion).toBeNull();

    const clientId = crypto.randomUUID();
    const { error } = await menteur
      .from('clients')
      .insert({ id: clientId, collecteur_id: sujet.id, nom: `Usurpé ${MARQUE}` });
    expect(error).toBeNull();

    expect((await traceDe(clientId, 'clients', 'insert'))?.acteur_id).toBe(sujet.id);
  });
});

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Accorder et reprendre le droit d'administrer.
 *
 * ## Une seule règle, et la seconde en découle
 *
 * La maquette en annonçait deux : « un super admin ne peut pas se rétrograder
 * lui-même » et « il ne peut pas révoquer le dernier super admin ». La seconde
 * est superflue, et la démonstration tient en une ligne : seul un super admin
 * appelle ces fonctions, et il ne peut pas s'y désigner. Toute révocation qui
 * réussit laisse donc au moins l'acteur. On ne peut pas atteindre zéro.
 *
 * Un compteur « reste-t-il un super admin ? » aurait été du code en plus, une
 * lecture en plus, et une deuxième vérité à tenir d'accord avec la première.
 *
 * ## Mais la course, elle, est réelle
 *
 * Deux supers, A et B, qui se révoquent l'un l'autre en même temps : chacun
 * vérifie qu'il est super — les deux le sont encore — puis chacun supprime
 * l'autre. Zéro super admin, et plus personne pour réparer autrement qu'en SQL.
 *
 * D'où le verrou en tête de fonction : les lignes `super` sont prises en
 * `for update` avant toute vérification. La seconde transaction attend, relit,
 * et découvre que son propre droit a disparu.
 *
 * ## L'acteur doit être nommé
 *
 * Un changement de privilège dont on ne sait pas qui l'a fait est exactement ce
 * que `audit_log.acteur_id` existe pour empêcher. Sans en-tête, la fonction
 * refuse — l'amorçage du premier super admin se fait en SQL, à la main, et il
 * est le seul geste qui échappe à cette règle.
 */

const MARQUE = crypto.randomUUID().slice(0, 6);
const sansSession = { auth: { persistSession: false, autoRefreshToken: false } };

let alpha: CollecteurTest; // super admin, l'acteur
let beta: CollecteurTest; // super admin, la cible
let gamma: CollecteurTest; // administrateur ordinaire
let delta: CollecteurTest; // aucun droit

function adminPour(acteurId: string): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    ...sansSession,
    global: { headers: { 'x-kolek-acteur': acteurId } },
  });
}

function exigerSucces(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

beforeAll(async () => {
  alpha = await creerCollecteur(`Alpha ${MARQUE}`, `+22501${Date.now() % 1000000}`);
  beta = await creerCollecteur(`Beta ${MARQUE}`, `+22502${Date.now() % 1000000}`);
  gamma = await creerCollecteur(`Gamma ${MARQUE}`, `+22503${Date.now() % 1000000}`);
  delta = await creerCollecteur(`Delta ${MARQUE}`, `+22504${Date.now() % 1000000}`);

  exigerSucces(
    'privilèges de départ',
    (
      await admin.from('admins').insert([
        { user_id: alpha.id, niveau: 'super' },
        { user_id: beta.id, niveau: 'super' },
        { user_id: gamma.id, niveau: 'admin' },
      ])
    ).error,
  );
});

afterAll(async () => {
  await admin.from('admins').delete().in('user_id', [alpha.id, beta.id, gamma.id, delta.id]);
  await nettoyer();
});

async function niveauDe(userId: string): Promise<string | null> {
  const { data } = await admin.from('admins').select('niveau').eq('user_id', userId).maybeSingle();
  return (data as { niveau: string } | null)?.niveau ?? null;
}

interface Verdict {
  fait: boolean;
  raison?: string;
}

function definir(acteurId: string | null, cible: string, niveau: string) {
  const client = acteurId ? adminPour(acteurId) : admin;
  return client
    .rpc('super_admin_definir_niveau', { p_cible: cible, p_niveau: niveau })
    .then(({ data, error }) => ({ data: data as Verdict, error }));
}

function revoquer(acteurId: string | null, cible: string) {
  const client = acteurId ? adminPour(acteurId) : admin;
  return client
    .rpc('super_admin_revoquer', { p_cible: cible })
    .then(({ data, error }) => ({ data: data as Verdict, error }));
}

describe('accorder un droit', () => {
  it('inscrit un compte qui n’administrait pas', async () => {
    const { data, error } = await definir(alpha.id, delta.id, 'admin');
    expect(error).toBeNull();
    expect(data.fait).toBe(true);
    expect(await niveauDe(delta.id)).toBe('admin');
  });

  it('promeut un administrateur ordinaire', async () => {
    const { data } = await definir(alpha.id, gamma.id, 'super');
    expect(data.fait).toBe(true);
    expect(await niveauDe(gamma.id)).toBe('super');
  });

  it('rétrograde un autre super admin', async () => {
    const { data } = await definir(alpha.id, gamma.id, 'admin');
    expect(data.fait).toBe(true);
    expect(await niveauDe(gamma.id)).toBe('admin');
  });

  it('refuse un niveau qui n’existe pas', async () => {
    const { data } = await definir(alpha.id, gamma.id, 'archi-super');
    expect(data.fait).toBe(false);
    expect(data.raison).toBe('niveau_inconnu');
    expect(await niveauDe(gamma.id)).toBe('admin');
  });
});

describe('les refus qui tiennent le produit debout', () => {
  it('refuse qu’un super admin se rétrograde lui-même', async () => {
    // La règle, et la seule. Tout le reste en découle.
    const { data } = await definir(alpha.id, alpha.id, 'admin');
    expect(data.fait).toBe(false);
    expect(data.raison).toBe('action_sur_soi');
    expect(await niveauDe(alpha.id)).toBe('super');
  });

  it('refuse qu’un super admin se révoque lui-même', async () => {
    const { data } = await revoquer(alpha.id, alpha.id);
    expect(data.fait).toBe(false);
    expect(data.raison).toBe('action_sur_soi');
    expect(await niveauDe(alpha.id)).toBe('super');
  });

  it('refuse un acteur qui n’est pas super admin', async () => {
    // Le portillon vit aussi ici, pas seulement dans l'Edge Function : c'est
    // ce qui rend l'invariant démontrable sans lire le TypeScript.
    const { data } = await definir(gamma.id, delta.id, 'super');
    expect(data.fait).toBe(false);
    expect(data.raison).toBe('acteur_non_autorise');
    expect(await niveauDe(delta.id)).toBe('admin');
  });

  it('refuse un acteur que rien ne nomme', async () => {
    // Un changement de privilège sans auteur enregistré est précisément ce que
    // acteur_id existe pour empêcher.
    const { data } = await definir(null, delta.id, 'super');
    expect(data.fait).toBe(false);
    expect(data.raison).toBe('acteur_inconnu');
    expect(await niveauDe(delta.id)).toBe('admin');
  });
});

describe('la conséquence', () => {
  it('laisse toujours au moins l’acteur comme super admin', async () => {
    // Le second verrou de la maquette, obtenu sans être écrit : beta est
    // révoqué par alpha, et alpha est encore là par construction.
    const { data } = await revoquer(alpha.id, beta.id);
    expect(data.fait).toBe(true);
    expect(await niveauDe(beta.id)).toBeNull();
    expect(await niveauDe(alpha.id)).toBe('super');
  });

  it('journalise la révocation avec son auteur', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('acteur_id, action')
      .eq('table_cible', 'admins')
      .eq('ligne_id', beta.id)
      .eq('action', 'delete')
      .order('survenu_le', { ascending: false })
      .limit(1);
    expect((data?.[0] as { acteur_id: string }).acteur_id).toBe(alpha.id);
  });
});

describe('la fermeture', () => {
  it('refuse les deux fonctions à un compte authentifié', async () => {
    const parNiveau = await alpha.client.rpc('super_admin_definir_niveau', {
      p_cible: delta.id,
      p_niveau: 'super',
    });
    expect(parNiveau.error).not.toBeNull();

    const parRevocation = await alpha.client.rpc('super_admin_revoquer', { p_cible: delta.id });
    expect(parRevocation.error).not.toBeNull();
  });
});

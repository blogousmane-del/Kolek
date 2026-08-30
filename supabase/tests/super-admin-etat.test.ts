import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * L'état que lit l'écran Super Admin.
 *
 * ## « Ajouté par » ne se stocke pas
 *
 * La maquette portait une colonne « Par » dans la liste des administrateurs, et
 * la première idée était une colonne `admins.ajoute_par`. Elle est retirée :
 * depuis `acteur_id`, le journal porte déjà qui a inscrit qui, et
 * `interdire_modification` rend cette ligne indestructible. Une seconde copie
 * du même fait finit par le contredire.
 *
 * L'état la relit donc dans `audit_log` — la première trace `insert` sur
 * `admins` pour ce compte. Un administrateur posé avant cette migration, ou par
 * une écriture qui n'a rien déclaré, rend `null` : « non attribué » est une
 * réponse, et deviner serait reproduire le défaut qu'on vient de corriger.
 *
 * ## Le statut d'un code se calcule ici
 *
 * Programmé, en cours, expiré, quota épuisé : quatre états, une seule
 * définition. Les recopier dans l'écran donnerait un jour un code « en cours »
 * à l'écran que la base refuse d'appliquer.
 */

const MARQUE = crypto.randomUUID().slice(0, 6).toUpperCase();
const sansSession = { auth: { persistSession: false, autoRefreshToken: false } };

let patron: CollecteurTest;
let inscrit: CollecteurTest;
let orphelin: CollecteurTest;
let remise: CollecteurTest;

function adminPour(acteurId: string): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    ...sansSession,
    global: { headers: { 'x-kolek-acteur': acteurId } },
  });
}

function exigerSucces(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

const CODE_COURS = `COURS${MARQUE}`;
const CODE_PROG = `PROG${MARQUE}`;
const CODE_FINI = `FINI${MARQUE}`;
const CODE_PLEIN = `PLEIN${MARQUE}`;

beforeAll(async () => {
  patron = await creerCollecteur(`Patron ${MARQUE}`, `+22511${Date.now() % 1000000}`);
  inscrit = await creerCollecteur(`Inscrit ${MARQUE}`, `+22512${Date.now() % 1000000}`);
  orphelin = await creerCollecteur(`Orphelin ${MARQUE}`, `+22513${Date.now() % 1000000}`);
  remise = await creerCollecteur(`Remise ${MARQUE}`, `+22514${Date.now() % 1000000}`);

  exigerSucces(
    'super admin',
    (await admin.from('admins').insert({ user_id: patron.id, niveau: 'super' })).error,
  );

  // Inscrit par le patron, donc imputable. Orphelin posé sans acteur déclaré :
  // c'est l'état de toutes les lignes antérieures à la migration.
  exigerSucces(
    'inscription imputée',
    (
      await adminPour(patron.id).rpc('super_admin_definir_niveau', {
        p_cible: inscrit.id,
        p_niveau: 'admin',
      })
    ).error,
  );
  exigerSucces(
    'inscription anonyme',
    (await admin.from('admins').insert({ user_id: orphelin.id, niveau: 'admin' })).error,
  );

  const q = (quota: number | null, utilisations = 0) => ({ quota, utilisations });
  exigerSucces(
    'codes',
    (
      await admin.from('codes_promo').insert([
        { code: CODE_COURS, remise_pct: 20, valide_du: '2026-01-01', valide_au: '2099-12-31', ...q(50) },
        { code: CODE_PROG, remise_pct: 10, valide_du: '2099-01-01', valide_au: '2099-12-31', ...q(null) },
        { code: CODE_FINI, remise_pct: 25, valide_du: '2026-01-01', valide_au: '2026-02-01', ...q(null) },
        { code: CODE_PLEIN, remise_pct: 50, valide_du: '2026-01-01', valide_au: '2099-12-31', ...q(2, 2) },
      ])
    ).error,
  );

  exigerSucces(
    'remise posée',
    (
      await admin.rpc('appliquer_code_promo', { p_collecteur: remise.id, p_code: CODE_COURS })
    ).error,
  );
});

afterAll(async () => {
  await admin
    .from('collecteurs')
    .update({ promo_code: null, remise_pct: null, remise_fin: null })
    .eq('id', remise.id);
  await admin.from('admins').delete().in('user_id', [patron.id, inscrit.id, orphelin.id]);
  await admin.from('codes_promo').delete().in('code', [CODE_COURS, CODE_PROG, CODE_FINI, CODE_PLEIN]);
  await nettoyer();
});

interface Administrateur {
  user_id: string;
  niveau: string;
  nom: string;
  ajoute_le: string;
  ajoute_par: string | null;
}
interface Code {
  code: string;
  remise_pct: number;
  utilisations: number;
  statut: string;
}
interface Remise {
  collecteur_id: string;
  nom: string;
  promo_code: string | null;
  remise_pct: number;
  remise_fin: string;
}
interface Etat {
  administrateurs: Administrateur[];
  codes_promo: Code[];
  remises: Remise[];
}

async function etat(): Promise<Etat> {
  const { data, error } = await admin.rpc('super_admin_etat');
  if (error) throw new Error(error.message);
  return data as Etat;
}

describe('la liste des administrateurs', () => {
  it('porte le niveau de chacun', async () => {
    const { administrateurs } = await etat();
    expect(administrateurs.find((a) => a.user_id === patron.id)?.niveau).toBe('super');
    expect(administrateurs.find((a) => a.user_id === inscrit.id)?.niveau).toBe('admin');
  });

  it('nomme qui a inscrit, en relisant le journal', async () => {
    const { administrateurs } = await etat();
    expect(administrateurs.find((a) => a.user_id === inscrit.id)?.ajoute_par).toBe(patron.id);
  });

  it('rend null quand rien ne l’a déclaré, plutôt que de deviner', async () => {
    // L'état de toutes les lignes antérieures à `acteur_id`. Retomber sur le
    // sujet reproduirait exactement le défaut que cette colonne corrige.
    const { administrateurs } = await etat();
    expect(administrateurs.find((a) => a.user_id === orphelin.id)?.ajoute_par).toBeNull();
  });

  it('met un nom lisible sur l’identifiant', async () => {
    const { administrateurs } = await etat();
    expect(administrateurs.find((a) => a.user_id === patron.id)?.nom).toContain(MARQUE);
  });
});

describe('les codes promo', () => {
  it('classe chaque code selon sa période et son quota', async () => {
    // Une seule définition des quatre états. Les recopier dans l'écran
    // donnerait un jour un code « en cours » que la base refuse d'appliquer.
    const { codes_promo } = await etat();
    const statut = (c: string) => codes_promo.find((x) => x.code === c)?.statut;
    expect(statut(CODE_COURS)).toBe('en_cours');
    expect(statut(CODE_PROG)).toBe('programme');
    expect(statut(CODE_FINI)).toBe('expire');
    expect(statut(CODE_PLEIN)).toBe('quota_epuise');
  });
});

describe('les remises en cours', () => {
  it('liste le collecteur, son taux figé et sa fin', async () => {
    const { remises } = await etat();
    const ligne = remises.find((r) => r.collecteur_id === remise.id);
    expect(ligne?.remise_pct).toBe(20);
    expect(ligne?.promo_code).toBe(CODE_COURS);
    expect(ligne?.nom).toContain(MARQUE);
  });

  it('n’y laisse pas une remise échue', async () => {
    exigerSucces(
      'remise échue',
      (
        await admin.from('collecteurs').update({ remise_fin: '2026-01-31' }).eq('id', remise.id)
      ).error,
    );
    const { remises } = await etat();
    expect(remises.some((r) => r.collecteur_id === remise.id)).toBe(false);
  });
});

describe('la fermeture', () => {
  it('refuse l’état à un compte authentifié, même super admin', async () => {
    // Le portillon est dans l'Edge Function, sous l'identité de l'appelant.
    // La fonction SQL, elle, ne s'ouvre qu'à service_role.
    const { error } = await patron.client.rpc('super_admin_etat');
    expect(error).not.toBeNull();
  });
});

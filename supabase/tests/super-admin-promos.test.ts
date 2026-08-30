import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le niveau super admin, et les remises qu'il consent.
 *
 * ## Deux niveaux, pas deux tables
 *
 * `admins` portait un droit binaire : y figurer, c'était tout pouvoir. Un
 * administrateur métier — celui qui suit les tournées et les impayés — avait
 * donc aussi de quoi lire la liste de ses pairs et toucher aux réglages de la
 * plateforme.
 *
 * Une colonne `niveau` plutôt qu'une table `super_admins` : deux tables de
 * privilèges, c'est deux endroits à fermer, deux à journaliser, et un jour
 * l'une des deux qui contredit l'autre. `est_admin()` ne bouge pas — un super
 * admin reste un administrateur, et le Dashboard continue de s'ouvrir pour lui.
 *
 * ## La remise est figée à l'application
 *
 * Le collecteur garde le taux qu'on lui a promis. Modifier le code plus tard,
 * ou le supprimer, ne reprend rien : `collecteurs.remise_pct` est une copie
 * datée, pas une jointure. C'est la seule façon de tenir une promesse
 * commerciale sans geler la grille.
 *
 * ## Le quota se consomme en une écriture
 *
 * Lire `utilisations` puis l'écrire laisserait deux applications simultanées
 * franchir le même quota — le défaut exact que `avis_quota_atomique` a corrigé
 * le 2026-08-23. Un seul `UPDATE` conditionnel, et `not found` vaut refus.
 */

const MARQUE = crypto.randomUUID().slice(0, 6).toUpperCase();
const CODE_VALIDE = `VALIDE${MARQUE}`;
const CODE_EXPIRE = `EXPIRE${MARQUE}`;
const CODE_EPUISE = `EPUISE${MARQUE}`;
const CODE_AUTRE = `AUTRE${MARQUE}`;

let patron: CollecteurTest;
let adjoint: CollecteurTest;
let simple: CollecteurTest;

beforeAll(async () => {
  patron = await creerCollecteur(`Patron ${MARQUE}`, `+225081${MARQUE}`);
  adjoint = await creerCollecteur(`Adjoint ${MARQUE}`, `+225082${MARQUE}`);
  simple = await creerCollecteur(`Simple ${MARQUE}`, `+225083${MARQUE}`);

  // Les échecs de préparation se disent ici. Sans ces deux `throw`, un refus
  // d'insertion laisse les tests échouer plus loin sur des symptômes — et on
  // cherche le défaut dans la migration au lieu du jeu d'essai.
  // Les deux niveaux sont écrits en toutes lettres : PostgREST unifie les clés
  // d'un tableau, et une ligne qui omettrait `niveau` recevrait un `null`
  // explicite au lieu du défaut. Le défaut a son propre test plus bas.
  const { error: erreurAdmins } = await admin.from('admins').insert([
    { user_id: patron.id, niveau: 'super' },
    { user_id: adjoint.id, niveau: 'admin' },
  ]);
  if (erreurAdmins) throw new Error(`admins: ${erreurAdmins.message}`);

  // Même raison que pour `admins` : dans un tableau, toute clé absente d'une
  // ligne mais présente d'une autre part en `null` explicite. `quota: null`
  // est ici la valeur voulue — sans limite — et non un oubli.
  const q = (quota: number | null, utilisations = 0) => ({ quota, utilisations });
  const { error: erreurCodes } = await admin.from('codes_promo').insert([
    { code: CODE_VALIDE, remise_pct: 20, valide_du: '2026-01-01', valide_au: '2099-12-31', ...q(50) },
    { code: CODE_AUTRE, remise_pct: 10, valide_du: '2026-01-01', valide_au: '2099-12-31', ...q(null) },
    { code: CODE_EXPIRE, remise_pct: 25, valide_du: '2026-01-01', valide_au: '2026-02-01', ...q(null) },
    { code: CODE_EPUISE, remise_pct: 50, valide_du: '2026-01-01', valide_au: '2099-12-31', ...q(1, 1) },
  ]);
  if (erreurCodes) throw new Error(`codes_promo: ${erreurCodes.message}`);
});

afterAll(async () => {
  await admin.from('admins').delete().in('user_id', [patron.id, adjoint.id]);
  await admin
    .from('codes_promo')
    .delete()
    .in('code', [CODE_VALIDE, CODE_AUTRE, CODE_EXPIRE, CODE_EPUISE]);
  await nettoyer();
});

async function utilisationsDe(code: string): Promise<number> {
  const { data } = await admin.from('codes_promo').select('utilisations').eq('code', code).single();
  return (data as { utilisations: number }).utilisations;
}

async function remiseDe(collecteurId: string) {
  const { data } = await admin
    .from('collecteurs')
    .select('promo_code, remise_pct, remise_fin')
    .eq('id', collecteurId)
    .single();
  return data as { promo_code: string | null; remise_pct: number | null; remise_fin: string | null };
}

describe('le portillon du super admin', () => {
  it('s’ouvre pour un administrateur de niveau super', async () => {
    const { data } = await patron.client.rpc('est_super_admin');
    expect(data).toBe(true);
  });

  it('reste fermé pour un administrateur ordinaire', async () => {
    // Le cœur du sujet : un admin métier garde le Dashboard et rien de plus.
    const { data } = await adjoint.client.rpc('est_super_admin');
    expect(data).toBe(false);
  });

  it('reste fermé pour un collecteur sans droit', async () => {
    const { data } = await simple.client.rpc('est_super_admin');
    expect(data).toBe(false);
  });

  it('n’enlève rien à est_admin : un super admin reste administrateur', async () => {
    expect((await patron.client.rpc('est_admin')).data).toBe(true);
    expect((await adjoint.client.rpc('est_admin')).data).toBe(true);
  });

  it('range au niveau ordinaire un administrateur inséré sans niveau', async () => {
    // Ce que reçoivent les lignes déjà en production le jour de la migration :
    // le droit qu'elles avaient, et pas celui du dessus.
    await admin.from('admins').insert({ user_id: simple.id });
    try {
      const { data } = await admin
        .from('admins')
        .select('niveau')
        .eq('user_id', simple.id)
        .single();
      expect((data as { niveau: string }).niveau).toBe('admin');
      expect((await simple.client.rpc('est_super_admin')).data).toBe(false);
    } finally {
      await admin.from('admins').delete().eq('user_id', simple.id);
    }
  });
});

describe('la table des codes promo', () => {
  it('reste hors de portée d’un compte authentifié, même administrateur', async () => {
    // Même fermeture qu'`admins` : RLS active, aucune politique, aucun
    // privilège pour `authenticated`. Elle ne s'atteint que par Edge Function.
    const { error } = await patron.client.from('codes_promo').select('code');
    expect(error).not.toBeNull();
  });
});

describe('l’application d’un code', () => {
  it('pose la remise et consomme une unité de quota', async () => {
    const avant = await utilisationsDe(CODE_VALIDE);

    const { data, error } = await admin.rpc('appliquer_code_promo', {
      p_collecteur: simple.id,
      p_code: CODE_VALIDE,
    });
    expect(error).toBeNull();
    expect((data as { applique: boolean }).applique).toBe(true);

    const remise = await remiseDe(simple.id);
    expect(remise.promo_code).toBe(CODE_VALIDE);
    expect(remise.remise_pct).toBe(20);
    expect(remise.remise_fin).toBe('2099-12-31');
    expect(await utilisationsDe(CODE_VALIDE)).toBe(avant + 1);
  });

  it('refuse un second code tant qu’une remise court', async () => {
    // Sans ce refus, deux campagnes se superposeraient sur le même
    // abonnement et consommeraient deux quotas pour une seule remise visible.
    const avant = await utilisationsDe(CODE_AUTRE);

    const { data } = await admin.rpc('appliquer_code_promo', {
      p_collecteur: simple.id,
      p_code: CODE_AUTRE,
    });

    expect((data as { applique: boolean; raison: string }).applique).toBe(false);
    expect((data as { raison: string }).raison).toBe('remise_deja_active');
    expect(await utilisationsDe(CODE_AUTRE)).toBe(avant);
  });

  it('refuse un code hors de sa période, sans rien consommer', async () => {
    const avant = await utilisationsDe(CODE_EXPIRE);

    const { data } = await admin.rpc('appliquer_code_promo', {
      p_collecteur: adjoint.id,
      p_code: CODE_EXPIRE,
    });

    expect((data as { applique: boolean; raison: string }).applique).toBe(false);
    expect((data as { raison: string }).raison).toBe('code_indisponible');
    expect(await utilisationsDe(CODE_EXPIRE)).toBe(avant);
    expect((await remiseDe(adjoint.id)).remise_pct).toBeNull();
  });

  it('refuse un code dont le quota est atteint, sans le dépasser', async () => {
    const { data } = await admin.rpc('appliquer_code_promo', {
      p_collecteur: adjoint.id,
      p_code: CODE_EPUISE,
    });

    expect((data as { applique: boolean }).applique).toBe(false);
    expect(await utilisationsDe(CODE_EPUISE)).toBe(1);
  });

  it('ne brûle qu’une unité de quota quand deux codes arrivent ensemble', async () => {
    // Constat d'audit de kolek-00, le 2026-08-30. La lecture de `remise_fin`
    // se faisait avant tout verrou : deux applications simultanées la
    // trouvaient nulle toutes les deux, passaient toutes les deux, et
    // consommaient deux quotas pour une seule remise — la dernière écrite.
    const solo = await creerCollecteur(`Course ${MARQUE}`, `+225085${Date.now() % 100000}`);
    const codeA = `COURSEA${MARQUE}`;
    const codeB = `COURSEB${MARQUE}`;
    const base = { valide_du: '2026-01-01', valide_au: '2099-12-31', quota: 5, utilisations: 0 };
    await admin.from('codes_promo').insert([
      { code: codeA, remise_pct: 10, ...base },
      { code: codeB, remise_pct: 15, ...base },
    ]);

    try {
      const [premier, second] = await Promise.all([
        admin.rpc('appliquer_code_promo', { p_collecteur: solo.id, p_code: codeA }),
        admin.rpc('appliquer_code_promo', { p_collecteur: solo.id, p_code: codeB }),
      ]);
      const verdicts = [premier.data, second.data] as Array<{ applique: boolean }>;

      expect(verdicts.filter((v) => v.applique).length).toBe(1);
      expect((await utilisationsDe(codeA)) + (await utilisationsDe(codeB))).toBe(1);
    } finally {
      await admin
        .from('collecteurs')
        .update({ promo_code: null, remise_pct: null, remise_fin: null })
        .eq('id', solo.id);
      await admin.from('codes_promo').delete().in('code', [codeA, codeB]);
    }
  });

  it('laisse la remise en place quand le code est supprimé', async () => {
    // Le taux est une copie datée, pas une jointure : retirer la campagne ne
    // reprend pas ce qui a été promis.
    const jetable = `JETABLE${MARQUE}`;
    await admin
      .from('codes_promo')
      .insert({ code: jetable, remise_pct: 15, valide_du: '2026-01-01', valide_au: '2099-12-31' });
    await admin.rpc('appliquer_code_promo', { p_collecteur: patron.id, p_code: jetable });

    await admin.from('codes_promo').delete().eq('code', jetable);

    const remise = await remiseDe(patron.id);
    expect(remise.promo_code).toBeNull();
    expect(remise.remise_pct).toBe(15);
  });
});

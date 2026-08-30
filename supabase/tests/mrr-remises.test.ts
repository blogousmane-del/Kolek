import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le MRR déduit des remises, sans qu'un prix descende en base.
 *
 * ## Le problème
 *
 * `admin_vue_globale()` rend des **comptages** par palier ; l'Edge Function les
 * multiplie par la grille tarifaire. C'est l'invariant posé le 2026-08-20 :
 * « c'est ici, et nulle part ailleurs, que les deux se rencontrent ». Une
 * remise par collecteur le casse — trente-huit Standard dont un à −20 % ne se
 * décrivent plus par un entier.
 *
 * ## La sortie
 *
 * Le SQL rend, à côté de `actifs`, la somme des remises exprimée en **fraction
 * d'abonnement** : `offerts`. Un collecteur à −20 % vaut 0,2 offert. L'Edge
 * Function calcule alors `(actifs − offerts) × prix`, et aucun montant n'a
 * traversé la base.
 *
 * ## Ce qui ne compte pas
 *
 * Une remise échue, et une remise sur un abonnement qui n'est pas `actif` — par
 * symétrie exacte avec `actifs`, qui ignore déjà les suspendus et les expirés.
 * Un abonnement suspendu n'encaisse rien ; lui accorder une remise ne coûte
 * rien non plus, et l'inscrire au manque à gagner serait compter deux fois.
 *
 * Les assertions sont **relatives** : `npm run test:db` ne réinitialise pas la
 * base, et cette vue agrège tous les collecteurs. Un test qui ne passe qu'une
 * fois n'est pas un test.
 */

const MARQUE = crypto.randomUUID().slice(0, 6).toUpperCase();
const CODE = `MRR${MARQUE}`;
const URL_FONCTION = `${process.env.SUPABASE_URL}/functions/v1/admin-vue-globale`;

let payant: CollecteurTest;
let patron: CollecteurTest;
let jeton: string;

function exigerSucces(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

beforeAll(async () => {
  payant = await creerCollecteur(`Payant ${MARQUE}`, `+225091${MARQUE}`);
  patron = await creerCollecteur(`Patron MRR ${MARQUE}`, `+225092${MARQUE}`);

  exigerSucces(
    'palier du payant',
    (
      await admin
        .from('collecteurs')
        .update({ palier: 'standard', abonnement_statut: 'actif' })
        .eq('id', payant.id)
    ).error,
  );

  exigerSucces('admin', (await admin.from('admins').insert({ user_id: patron.id })).error);
  exigerSucces(
    'code promo',
    (
      await admin.from('codes_promo').insert({
        code: CODE,
        remise_pct: 20,
        valide_du: '2026-01-01',
        valide_au: '2099-12-31',
      })
    ).error,
  );

  const { data } = await patron.client.auth.getSession();
  jeton = data.session!.access_token;
});

afterAll(async () => {
  await admin
    .from('collecteurs')
    .update({ promo_code: null, remise_pct: null, remise_fin: null })
    .eq('id', payant.id);
  await admin.from('admins').delete().eq('user_id', patron.id);
  await admin.from('codes_promo').delete().eq('code', CODE);
  await nettoyer();
});

interface LignePalier {
  palier: string;
  total: number;
  actifs: number;
  offerts: number;
}

async function standard(): Promise<LignePalier> {
  const { data, error } = await admin.rpc('admin_vue_globale');
  if (error) throw new Error(error.message);
  const lignes = (data as { par_palier: LignePalier[] }).par_palier;
  const ligne = lignes.find((l) => l.palier === 'standard');
  if (!ligne) throw new Error('Aucune ligne « standard » : le jeu d’essai n’est pas en place.');
  return ligne;
}

async function mrrStandardParLaFonction(): Promise<number> {
  const reponse = await fetch(URL_FONCTION, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${jeton}`,
    },
  });
  expect(reponse.status).toBe(200);
  const corps = (await reponse.json()) as {
    abonnements: { parPalier: Array<{ palier: string; mrr: number }> };
  };
  return corps.abonnements.parPalier.find((p) => p.palier === 'standard')!.mrr;
}

describe('la remise entre dans la vue globale', () => {
  it('rend une fraction offerte par palier, nulle sans remise', async () => {
    const ligne = await standard();
    expect(typeof ligne.offerts).toBe('number');
    expect(ligne.offerts).toBeGreaterThanOrEqual(0);
  });

  it('compte une remise de 20 % pour 0,2 abonnement offert', async () => {
    const avant = await standard();

    const { data } = await admin.rpc('appliquer_code_promo', {
      p_collecteur: payant.id,
      p_code: CODE,
    });
    expect((data as { applique: boolean }).applique).toBe(true);

    const apres = await standard();
    expect(apres.actifs).toBe(avant.actifs);
    expect(Number(apres.offerts) - Number(avant.offerts)).toBeCloseTo(0.2, 6);
  });

  it('cesse de compter une remise échue', async () => {
    const avec = await standard();

    exigerSucces(
      'remise échue',
      (
        await admin
          .from('collecteurs')
          .update({ remise_fin: '2026-01-31' })
          .eq('id', payant.id)
      ).error,
    );

    const apres = await standard();
    expect(Number(avec.offerts) - Number(apres.offerts)).toBeCloseTo(0.2, 6);
  });

  it('ignore la remise d’un abonnement suspendu, comme actifs l’ignore', async () => {
    // Symétrie avec `actifs` : un abonnement suspendu n'encaisse rien, donc la
    // remise qu'il porte ne coûte rien. L'inscrire au manque à gagner
    // compterait deux fois la même absence de recette.
    exigerSucces(
      'remise rendue et abonnement suspendu',
      (
        await admin
          .from('collecteurs')
          .update({ remise_fin: '2099-12-31', abonnement_statut: 'suspendu' })
          .eq('id', payant.id)
      ).error,
    );
    const suspendu = await standard();

    exigerSucces(
      'abonnement réactivé',
      (
        await admin
          .from('collecteurs')
          .update({ abonnement_statut: 'actif' })
          .eq('id', payant.id)
      ).error,
    );
    const actif = await standard();

    expect(Number(actif.offerts) - Number(suspendu.offerts)).toBeCloseTo(0.2, 6);
  });
});

describe('la fonction d’administration déduit la remise du MRR', () => {
  it('retire un cinquième d’un abonnement Standard du chiffre annoncé', async () => {
    // La remise du test précédent court toujours : 2 500 × 0,2 = 500 FCFA.
    const avecRemise = await mrrStandardParLaFonction();

    exigerSucces(
      'remise retirée',
      (
        await admin
          .from('collecteurs')
          .update({ promo_code: null, remise_pct: null, remise_fin: null })
          .eq('id', payant.id)
      ).error,
    );
    const sansRemise = await mrrStandardParLaFonction();

    expect(sansRemise - avecRemise).toBe(500);
  });
});

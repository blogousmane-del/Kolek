import { afterAll, describe, expect, it } from 'vitest';

import { admin, anonyme } from './harnais';

/**
 * Le compteur des fonctions publiques.
 *
 * Deux choses à prouver, et elles ne se recouvrent pas : que personne ne peut
 * remettre le compteur à zéro depuis un navigateur, et qu'il compte juste.
 */

const CLE = `test-debit-${crypto.randomUUID()}`;

afterAll(async () => {
  await admin.from('debit_public').delete().like('empreinte', 'test-debit-%');
});

describe('le verrou', () => {
  it('refuse la lecture anonyme de la table', async () => {
    const { error } = await anonyme.from('debit_public').select('*');
    expect(error).not.toBeNull();
  });

  it('refuse consommer_debit à un anonyme', async () => {
    // Le point qui compte : un appelant qui peut appeler la fonction lui-même
    // peut épuiser le quota d'un tiers, ou remettre le sien à neuf.
    const { error } = await anonyme.rpc('consommer_debit', {
      cle: CLE,
      plafond: 1,
      fenetre_secondes: 60,
    });
    expect(error).not.toBeNull();
  });
});

describe('le comptage', () => {
  it('accepte jusqu’au plafond, refuse au-delà', async () => {
    const cle = `${CLE}-plafond`;
    const appel = () => admin.rpc('consommer_debit', { cle, plafond: 2, fenetre_secondes: 60 });

    expect((await appel()).data).toBe(true);
    expect((await appel()).data).toBe(true);
    expect((await appel()).data).toBe(false);
    expect((await appel()).data).toBe(false);
  });

  it('repart à neuf une fois la fenêtre passée', async () => {
    // Sans ce comportement, la borne serait définitive : le premier visiteur
    // d'une adresse partagée — un cybercafé d'Adjamé — fermerait le formulaire
    // pour tous les suivants, à jamais.
    const cle = `${CLE}-fenetre`;
    await admin.rpc('consommer_debit', { cle, plafond: 1, fenetre_secondes: 60 });
    expect(
      (await admin.rpc('consommer_debit', { cle, plafond: 1, fenetre_secondes: 60 })).data,
    ).toBe(false);

    // On vieillit la fenêtre plutôt que d'attendre : le test doit mesurer la
    // règle, pas la patience de celui qui le lance.
    await admin
      .from('debit_public')
      .update({ fenetre: new Date(Date.now() - 120_000).toISOString() })
      .eq('empreinte', cle);

    const { data } = await admin.rpc('consommer_debit', { cle, plafond: 1, fenetre_secondes: 60 });
    expect(data).toBe(true);

    const { data: ligne } = await admin
      .from('debit_public')
      .select('compte')
      .eq('empreinte', cle)
      .single();
    expect(ligne?.compte).toBe(1);
  });

  it('compte séparément deux empreintes', async () => {
    const a = `${CLE}-a`;
    const b = `${CLE}-b`;
    await admin.rpc('consommer_debit', { cle: a, plafond: 1, fenetre_secondes: 60 });

    const { data } = await admin.rpc('consommer_debit', {
      cle: b,
      plafond: 1,
      fenetre_secondes: 60,
    });
    expect(data).toBe(true);
  });
});

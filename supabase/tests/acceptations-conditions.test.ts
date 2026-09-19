import { afterAll, describe, expect, it } from 'vitest';

import { admin, anonyme } from './harnais';

/**
 * La trace de l'acceptation des conditions.
 *
 * Spec : `Docs/specs/2026-09-18-trace-acceptation-conditions-design.md` §4.
 *
 * Deux propriétés, et elles ne se voient pas dans le schéma :
 *
 * 1. **Un événement par acceptation, jamais écrasé.** Le jour où les conditions
 *    changeront, une nouvelle acceptation ne doit pas effacer la précédente :
 *    un litige portant sur une période antérieure se retrouverait sans preuve.
 * 2. **Aucun navigateur n'écrit ici.** Ni `anon` ni `authenticated` : seules les
 *    Edge Functions, qui valident la version avant d'écrire.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
const posees: string[] = [];

afterAll(async () => {
  if (posees.length > 0) {
    await admin.from('acceptations_conditions').delete().in('id', posees);
  }
});

describe('acceptations_conditions', () => {
  it('garde deux acceptations du même compte, sans écraser la première', async () => {
    const { data: compte } = await admin
      .from('collecteurs')
      .select('id')
      .limit(1)
      .maybeSingle();
    // Témoin : sans collecteur en base, l'épreuve ne mesurerait rien.
    expect(compte?.id, 'aucun collecteur en base : la sonde ne mesure rien').toBeTruthy();

    const premiere = await admin
      .from('acceptations_conditions')
      .insert({ collecteur_id: compte!.id, version: `v1-${MARQUE}` })
      .select('id, acceptee_le')
      .single();
    expect(premiere.error).toBeNull();
    posees.push(premiere.data!.id);

    const seconde = await admin
      .from('acceptations_conditions')
      .insert({ collecteur_id: compte!.id, version: `v2-${MARQUE}` })
      .select('id')
      .single();
    expect(seconde.error).toBeNull();
    posees.push(seconde.data!.id);

    const { data: toutes } = await admin
      .from('acceptations_conditions')
      .select('version')
      .eq('collecteur_id', compte!.id)
      .like('version', `%${MARQUE}`);
    expect(toutes?.map((l) => l.version).sort()).toEqual([`v1-${MARQUE}`, `v2-${MARQUE}`]);
  });

  it('pose la date elle-même, sans croire le client', async () => {
    const { data: compte } = await admin.from('collecteurs').select('id').limit(1).maybeSingle();
    expect(compte?.id).toBeTruthy();

    const avant = new Date(Date.now() - 60_000);
    const { data, error } = await admin
      .from('acceptations_conditions')
      // Une date envoyée par le navigateur est une date que le navigateur
      // choisit : on n'en envoie pas, et le défaut serveur doit s'appliquer.
      .insert({ collecteur_id: compte!.id, version: `date-${MARQUE}` })
      .select('id, acceptee_le')
      .single();
    expect(error).toBeNull();
    posees.push(data!.id);
    expect(new Date(data!.acceptee_le).getTime()).toBeGreaterThan(avant.getTime());
  });

  it('refuse la lecture et l’écriture à un navigateur anonyme', async () => {
    const lecture = await anonyme.from('acceptations_conditions').select('id').limit(1);
    expect(lecture.error, 'anon ne doit pas pouvoir lire').not.toBeNull();

    const ecriture = await anonyme
      .from('acceptations_conditions')
      .insert({ version: `intrus-${MARQUE}` });
    expect(ecriture.error, 'anon ne doit pas pouvoir écrire').not.toBeNull();
  });

  it('refuse deux fois la même version pour le même compte, au renouvellement', async () => {
    // `abonnement-payer` écrit l'acceptation **avant** d'appeler la boutique :
    // un collecteur dont la vente échoue et qui réappuie repasse par ici. Sans
    // cet index, chaque tentative ajoutait une ligne pour la même version, et
    // rien ne bornait une écriture que cette route — non soumise à
    // `consommer_debit` — laisse déclencher en boucle.
    const { data: compte } = await admin.from('collecteurs').select('id').limit(1).maybeSingle();
    expect(compte?.id, 'aucun collecteur en base : la sonde ne mesure rien').toBeTruthy();

    const version = `rejeu-${MARQUE}`;
    const premiere = await admin
      .from('acceptations_conditions')
      .insert({ collecteur_id: compte!.id, version })
      .select('id')
      .single();
    expect(premiere.error, 'la première doit passer').toBeNull();
    posees.push(premiere.data!.id);

    const rejeu = await admin
      .from('acceptations_conditions')
      .insert({ collecteur_id: compte!.id, version });
    expect(rejeu.error?.code, 'la seconde doit heurter l’index unique').toBe('23505');
  });

  it('laisse passer une version différente pour le même compte', async () => {
    // Le témoin de l'épreuve précédente : un index posé sur le seul
    // `collecteur_id` la passerait aussi, en interdisant du même coup toute
    // acceptation d'une version suivante — c'est-à-dire en perdant exactement
    // ce que la table existe pour garder.
    const { data: compte } = await admin.from('collecteurs').select('id').limit(1).maybeSingle();
    expect(compte?.id).toBeTruthy();

    const suivante = await admin
      .from('acceptations_conditions')
      .insert({ collecteur_id: compte!.id, version: `suite-${MARQUE}` })
      .select('id')
      .single();
    expect(suivante.error, 'une version nouvelle doit toujours pouvoir s’écrire').toBeNull();
    posees.push(suivante.data!.id);
  });
});

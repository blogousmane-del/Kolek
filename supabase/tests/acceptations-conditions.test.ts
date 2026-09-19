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
});

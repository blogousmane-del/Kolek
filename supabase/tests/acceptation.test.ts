import { describe, expect, it } from 'vitest';

import { enregistrerAcceptation } from '../functions/_shared/acceptation.ts';

/**
 * L'écriture d'un événement d'acceptation, mesurée sans base.
 *
 * Ce module est partagé par les deux voies qui recueillent un accord — le
 * formulaire public et le renouvellement — et c'était le seul du chantier que
 * rien n'éprouvait directement. Ce qui s'y décide tient en trois points, et
 * aucun ne se voit en lisant les appelants :
 *
 * 1. **Ce qui part, exactement.** Trois colonnes, et `acceptee_le` n'en fait
 *    pas partie : le défaut de la colonne est `now()`, du serveur. Une date
 *    envoyée par le navigateur est une date que le navigateur choisit.
 * 2. **`23505` est un succès.** Les deux index uniques de la table disent « ce
 *    fait est déjà enregistré ». Un renouvellement rejoué après un échec en
 *    aval retombe dessus, et la preuve ne s'améliore pas en double.
 * 3. **Tout autre échec se rapporte.** Aucun appelant ne fait échouer sa
 *    requête pour autant, mais tous tracent — une acceptation manquante est une
 *    preuve manquante, et elle doit se voir.
 */

/** Le client réduit à ce que la fonction lui demande : une table, une
    insertion, et une réponse. Le verdict est posé par l'épreuve. */
function clientFactice(reponse: { error: { message: string; code?: string } | null }) {
  const ecrites: { table: string; rangee: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      return {
        insert: async (rangee: Record<string, unknown>) => {
          ecrites.push({ table, rangee });
          return reponse;
        },
      };
    },
  };
  return { client: client as never, ecrites };
}

describe('enregistrerAcceptation', () => {
  it('écrit les trois colonnes, et pas la date', async () => {
    const { client, ecrites } = clientFactice({ error: null });

    const verdict = await enregistrerAcceptation(client, {
      collecteurId: 'compte-1',
      version: 'abc123',
    });

    expect(verdict).toEqual({ ok: true });
    expect(ecrites).toHaveLength(1);
    expect(ecrites[0].table).toBe('acceptations_conditions');
    // Liste exhaustive, et non `objectContaining` : c'est elle qui garde la
    // propriété — `acceptee_le` ne doit jamais partir d'ici.
    expect(Object.keys(ecrites[0].rangee).sort()).toEqual([
      'collecteur_id',
      'demande_id',
      'version',
    ]);
    expect(ecrites[0].rangee.collecteur_id).toBe('compte-1');
    expect(ecrites[0].rangee.demande_id, 'aucune demande sur la voie authentifiée').toBeNull();
  });

  it('pose null plutôt qu’undefined pour la clé absente', async () => {
    // PostgREST omettrait une colonne `undefined` au lieu de l'écrire nulle, et
    // le défaut de la colonne prendrait sa place. Ici les deux sont nulles par
    // défaut, donc l'écart ne se verrait pas — jusqu'au jour où l'une d'elles
    // recevrait un défaut.
    const { client, ecrites } = clientFactice({ error: null });

    await enregistrerAcceptation(client, { demandeId: 'demande-1', version: 'abc123' });

    expect(ecrites[0].rangee.collecteur_id).toBeNull();
    expect(ecrites[0].rangee.demande_id).toBe('demande-1');
  });

  it('lit une violation d’unicité comme un succès', async () => {
    // Le cas concret : un collecteur appuie sur payer, l'acceptation s'écrit,
    // la vente échoue, il réappuie. La deuxième écriture heurte
    // `acceptations_conditions_collecteur_version_unique` — et c'est bien :
    // il a déjà accepté cette version-là, à cette heure-là.
    const { client } = clientFactice({
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    });

    expect(
      await enregistrerAcceptation(client, { collecteurId: 'compte-1', version: 'abc123' }),
    ).toEqual({ ok: true });
  });

  it('rapporte tout autre échec, avec son message', async () => {
    // Témoin de l'épreuve précédente : sans lui, une fonction qui rendrait
    // toujours `ok` la passerait sans rien garder du tout.
    const { client } = clientFactice({
      error: { message: 'permission denied for table acceptations_conditions', code: '42501' },
    });

    expect(
      await enregistrerAcceptation(client, { collecteurId: 'compte-1', version: 'abc123' }),
    ).toEqual({ ok: false, message: 'permission denied for table acceptations_conditions' });
  });

  it('rapporte un échec sans code plutôt que de le prendre pour un doublon', async () => {
    const { client } = clientFactice({ error: { message: 'réseau' } });

    expect(
      await enregistrerAcceptation(client, { collecteurId: 'compte-1', version: 'abc123' }),
    ).toEqual({ ok: false, message: 'réseau' });
  });
});

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * L'écriture d'un événement d'acceptation.
 *
 * Spec : `Docs/specs/2026-09-18-trace-acceptation-conditions-design.md` §4.
 *
 * Partagée par les deux chemins qui la recueillent — le formulaire public et le
 * renouvellement dans l'application — parce qu'une deuxième copie de ces dix
 * lignes finirait par écrire une colonne de moins que l'autre, et que
 * l'asymétrie ne se verrait qu'au tribunal.
 *
 * `acceptee_le` n'est jamais envoyé : le défaut de la colonne est `now()`, du
 * serveur. Une date envoyée par le navigateur est une date que le navigateur
 * choisit.
 */
export async function enregistrerAcceptation(
  client: SupabaseClient,
  acte: { demandeId?: string | null; collecteurId?: string | null; version: string },
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await client.from('acceptations_conditions').insert({
    demande_id: acte.demandeId ?? null,
    collecteur_id: acte.collecteurId ?? null,
    version: acte.version,
  });

  // `23505` — violation d'unicité — **est** un succès ici, et il faut le dire
  // plutôt que de le laisser deviner : les deux index uniques de la table
  // signifient « ce fait est déjà enregistré », une fois par demande sur la
  // voie publique, une fois par version sur la voie authentifiée. Un
  // renouvellement rejoué après un échec en aval retombe dessus, et la preuve
  // ne s'améliore pas en double.
  //
  // Le contrôle porte sur `on conflict do nothing` sans y recourir : PostgREST
  // ne transmet que des colonnes en cible de conflit, jamais le prédicat d'un
  // index partiel, donc un `upsert` ne saurait pas désigner ces index-là. Lire
  // le code d'erreur fait le même travail, et dit pourquoi.
  if (error) {
    if (error.code === '23505') return { ok: true };
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

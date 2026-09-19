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
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

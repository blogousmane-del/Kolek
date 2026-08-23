import { supabase } from './supabase';

/**
 * Les demandes d'ouverture, côté administration.
 *
 * Tout passe par l'Edge Function `admin-demandes` : la table n'accorde aucun
 * droit aux rôles du navigateur, pas même en lecture, pas même à un
 * administrateur. C'est délibéré — le portillon `est_admin()` vit dans la
 * fonction, où il est vérifié sous l'identité de l'appelant, plutôt que dans
 * une politique RLS que `create policy` pourrait un jour redéfinir de travers.
 */

export type StatutDemande = 'nouvelle' | 'contactee' | 'ouverte' | 'refusee';

export interface Demande {
  id: string;
  nom: string;
  telephone: string;
  zone: string | null;
  palier: string;
  message: string | null;
  statut: StatutDemande;
  cree_le: string;
  traite_le: string | null;
}

const MESSAGES: Record<string, string> = {
  ACCES_RESERVE: "Ce compte n'est pas un compte d'administration GTCS.",
  VERIFICATION_IMPOSSIBLE: "Impossible de vérifier les droits d'accès.",
  LECTURE_IMPOSSIBLE: 'La base n’a pas pu rendre les demandes.',
  MISE_A_JOUR_IMPOSSIBLE: 'La demande n’a pas pu être mise à jour.',
  DEMANDE_INTROUVABLE: 'Cette demande n’existe plus — elle a peut-être été traitée ailleurs.',
  STATUT_INVALIDE: 'Ce statut n’est pas reconnu.',
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
  CONFIGURATION: 'Le serveur est mal configuré.',
};

/** Extrait le code d'erreur du corps, quand `functions.invoke` a signalé un
    non-2xx. Le corps n'est pas toujours du JSON — d'où le `try`. */
async function codeDe(erreur: unknown): Promise<string | undefined> {
  try {
    const contexte = (erreur as { context?: Response }).context;
    if (contexte && typeof contexte.json === 'function') {
      return ((await contexte.json()) as { erreur?: string }).erreur;
    }
  } catch {
    // Corps illisible : l'appelant retombe sur son message générique.
  }
  return undefined;
}

export async function chargerDemandes(): Promise<Demande[]> {
  const { data, error } = await supabase.functions.invoke('admin-demandes', { method: 'GET' });

  if (error) {
    const code = await codeDe(error);
    throw new Error(code ? (MESSAGES[code] ?? code) : error.message);
  }

  return ((data as { demandes?: Demande[] })?.demandes ?? []) as Demande[];
}

export async function traiterDemande(
  id: string,
  statut: Exclude<StatutDemande, 'nouvelle'>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await supabase.functions.invoke('admin-demandes', {
    method: 'POST',
    body: { id, statut },
  });

  if (error) {
    const code = await codeDe(error);
    return { ok: false, message: code ? (MESSAGES[code] ?? code) : error.message };
  }

  // `functions.invoke` ne peuple `error` que pour un non-2xx. Un corps portant
  // `erreur` doit donc être relu ici — c'est le défaut du 2026-08-20, où un 207
  // « clôture partielle » était lu comme un succès.
  const corps = data as { erreur?: string; statut?: string };
  if (corps?.erreur) {
    return { ok: false, message: MESSAGES[corps.erreur] ?? corps.erreur };
  }

  return { ok: true };
}

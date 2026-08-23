import { supabase } from './supabase';

/**
 * Les avis aux clients, côté administration.
 *
 * Tout passe par l'Edge Function `admin-avis` : `avis_reglages` n'accorde que
 * le `select` à `authenticated`, et seulement sur sa propre ligne. Aucun
 * navigateur — pas même celui d'un administrateur — n'écrit directement dans
 * une table dont une colonne fixe un budget mensuel.
 */

export type Canal = 'aucun' | 'sms' | 'whatsapp';

export interface LigneAvis {
  id: string;
  nom: string;
  palier: string;
  canal: Canal;
  sur_mise: boolean;
  sur_retrait: boolean;
  sur_ouverture: boolean;
  quota_mensuel: number;
  segments_consommes: number;
  periode_quota: string | null;
  /** Faux tant que GTCS n'a rien décidé : la ligne de réglages n'existe pas. */
  regle: boolean;
  clients: number;
  clients_consentants: number;
  en_attente: number;
  envoyes_mois: number;
  bloques: number;
  abandonnes: number;
}

export interface EtatAvis {
  genere_le: string;
  collecteurs: LigneAvis[];
  derniere_erreur: { raison: string; quand: string } | null;
}

export interface Politique {
  canal: Canal;
  sur_mise: boolean;
  sur_retrait: boolean;
  sur_ouverture: boolean;
  quota_mensuel: number;
}

const MESSAGES: Record<string, string> = {
  ACCES_RESERVE: "Ce compte n'est pas un compte d'administration GTCS.",
  VERIFICATION_IMPOSSIBLE: "Impossible de vérifier les droits d'accès.",
  LECTURE_IMPOSSIBLE: 'La base n’a pas pu rendre l’état des avis.',
  MISE_A_JOUR_IMPOSSIBLE: 'La politique n’a pas pu être enregistrée.',
  COLLECTEUR_INTROUVABLE: 'Ce collecteur n’existe plus.',
  CANAL_INVALIDE: 'Ce canal n’est pas reconnu.',
  QUOTA_INVALIDE: 'Le quota doit être un entier entre 0 et 50 000 segments.',
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
  CONFIGURATION: 'Le serveur est mal configuré.',
};

/** Voir `demandes.ts` : `functions.invoke` ne rend le corps d'un non-2xx que
    par `error.context`, et ce corps n'est pas toujours du JSON. */
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

export async function chargerAvis(): Promise<EtatAvis> {
  const { data, error } = await supabase.functions.invoke('admin-avis', { method: 'GET' });

  if (error) {
    const code = await codeDe(error);
    throw new Error(code ? (MESSAGES[code] ?? code) : error.message);
  }

  const corps = (data ?? {}) as Partial<EtatAvis>;
  return {
    genere_le: corps.genere_le ?? new Date().toISOString(),
    collecteurs: corps.collecteurs ?? [],
    derniere_erreur: corps.derniere_erreur ?? null,
  };
}

export async function definirPolitique(
  collecteur: string,
  politique: Politique,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await supabase.functions.invoke('admin-avis', {
    method: 'POST',
    body: { collecteur, ...politique },
  });

  if (error) {
    const code = await codeDe(error);
    return { ok: false, message: code ? (MESSAGES[code] ?? code) : error.message };
  }

  // Un 2xx portant `erreur` dans le corps existe : c'est le défaut du
  // 2026-08-20, où un 207 « clôture partielle » était lu comme un succès.
  const corps = data as { erreur?: string } | null;
  if (corps?.erreur) return { ok: false, message: MESSAGES[corps.erreur] ?? corps.erreur };

  return { ok: true };
}

/** Le tarif A2P retenu pour l'estimation, en FCFA par segment. */
export const PRIX_SEGMENT = 20;

/**
 * Ce que coûterait un mois au rythme actuel.
 *
 * Une estimation, pas une facture : elle suppose que chaque client consentant
 * verse tous les jours ouvrés, ce qu'aucun portefeuille ne fait exactement.
 * Elle sert à répondre à la seule question qui compte avant d'ouvrir un canal —
 * « est-ce que ça tient dans l'abonnement ? » — dont la réponse est presque
 * toujours non.
 */
export function estimationMensuelle(ligne: LigneAvis): number {
  const parMois = ligne.sur_mise ? 26 : 0;
  const cloture = ligne.sur_retrait ? 1 : 0;
  const ouverture = ligne.sur_ouverture ? 1 : 0;
  return ligne.clients_consentants * (parMois + cloture + ouverture) * PRIX_SEGMENT;
}

import { supabase } from './supabase';

/**
 * Les deux appels du paiement d'abonnement.
 *
 * Le montant n'apparaît nulle part ici, et c'est une propriété : le prix vit
 * dans la boutique du fournisseur, jamais dans une requête partie du téléphone.
 * Ce module n'envoie qu'un palier et un numéro.
 *
 * ## Pourquoi une table de phrases plutôt qu'un message serveur
 *
 * `supabase-js` ne rend pas le corps d'une réponse non-2xx dans `error.message`
 * — il y met « Edge Function returned a non-2xx status code ». Un refus
 * parfaitement légitime, « ce numéro n'est pas utilisable », s'afficherait donc
 * comme une panne, et personne au marché ne saurait quoi corriger. Le corps se
 * lit à part, par `codeDErreur`, et le code court qu'il porte se traduit ici.
 *
 * La table est tenue **complète** par un test qui lit les sources des deux Edge
 * Functions : tout code qu'un serveur peut rendre a sa phrase. Sans ce filet,
 * chaque refus ajouté côté serveur s'afficherait « Paiement impossible.
 * Réessaie. » — un message qui ne dit ni ce qui s'est passé ni quoi faire.
 */

const MESSAGES: Record<string, string> = {
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
  ACCES_RESERVE: 'Session invalide. Reconnecte-toi.',
  COMPTE_SANS_ADRESSE: 'Ton compte n’a pas d’adresse électronique. Contacte GTCS.',
  PALIER_INCONNU: 'Choisis une formule avant de payer.',
  PALIER_NON_PAYANT: 'La formule d’essai est gratuite : il n’y a rien à régler.',
  TELEPHONE_INVALIDE: 'Ce numéro n’est pas utilisable. Vérifie le pays et le numéro.',
  SAISIE_REFUSEE: 'Le service de paiement a refusé ces informations. Vérifie ton numéro.',
  FICHE_INTROUVABLE: 'Ta fiche est introuvable. Contacte GTCS.',
  ABONNEMENT_DU_TITULAIRE: 'Ton abonnement est payé par ton titulaire. Tu n’as rien à régler.',
  CHECKOUT_IMPOSSIBLE: 'Le service de paiement ne répond pas. Réessaie dans un moment.',
  // Deux refus que « réessaie » ne corrigerait jamais. Ils ne nomment pas la
  // cause à l'écran — un inconnu n'a pas à apprendre l'état de notre boutique —
  // mais ils envoient chercher la bonne personne.
  CLE_CHARIOW_REFUSEE: 'Le paiement n’est pas configuré. Préviens GTCS.',
  PRODUIT_INTROUVABLE: 'Cette formule n’est pas en vente pour l’instant. Préviens GTCS.',
  CHECKOUT_INCOMPLET: 'Le service de paiement a répondu incomplètement. Réessaie.',
  ENREGISTREMENT_IMPOSSIBLE:
    'Le paiement n’a pas pu être enregistré chez nous. N’envoie pas d’argent — préviens GTCS.',
  CONFIGURATION: 'Le paiement n’est pas configuré. Préviens GTCS.',
  RECONCILIATION_IMPOSSIBLE: 'Impossible de vérifier le paiement pour l’instant.',
  CORPS_ILLISIBLE: 'Requête mal formée.',
  // Inatteignable depuis l'application, qui poste toujours. Présent parce que le
  // serveur peut le rendre, et qu'une table tenue « complète sauf les cas qui
  // n'arrivent pas » n'est pas une table complète : c'est une table dont
  // personne ne sait plus quelle est la règle.
  METHODE_NON_AUTORISEE: 'Requête mal formée.',
};

export function messagePour(code: string): string {
  return MESSAGES[code] ?? 'Paiement impossible. Réessaie.';
}

/** Lit le code d'erreur dans le corps d'une réponse non-2xx. */
async function codeDErreur(erreur: unknown): Promise<string | undefined> {
  try {
    const contexte = (erreur as { context?: Response }).context;
    if (contexte && typeof contexte.json === 'function') {
      return ((await contexte.json()) as { erreur?: string }).erreur;
    }
  } catch {
    // Corps illisible : on retombe sur le message générique.
  }
  return undefined;
}

export interface SaisiePaiement {
  palier: string;
  telephone: string;
  paysTelephone: string;
  telephoneLocal: string;
}

export type ResultatPaiement = { ok: true; checkoutUrl: string } | { ok: false; message: string };

export async function demarrerPaiement(saisie: SaisiePaiement): Promise<ResultatPaiement> {
  const { data, error } = await supabase.functions.invoke('abonnement-payer', { body: saisie });

  if (error) {
    const code = await codeDErreur(error);
    return { ok: false, message: code ? messagePour(code) : messagePour('') };
  }

  const url = (data as { checkoutUrl?: unknown } | null)?.checkoutUrl;
  // Jamais de départ sur une réponse incomplète : mieux vaut un message qu'une
  // navigation vers rien.
  if (typeof url !== 'string' || !url) {
    return { ok: false, message: messagePour('CHECKOUT_INCOMPLET') };
  }
  return { ok: true, checkoutUrl: url };
}

export interface Verification {
  credites: number;
  enAttente: number;
  echeance: string | null;
}

/**
 * Appelée par l'écran de retour **et** à chaque ouverture de l'application.
 *
 * Ne jette jamais : à l'ouverture, une panne de réseau ne doit pas empêcher le
 * carnet de s'afficher. Un décompte nul se lit « rien de nouveau », ce qui est
 * exactement ce qu'on sait dans ce cas.
 */
export async function verifierPaiements(): Promise<Verification> {
  const { data, error } = await supabase.functions.invoke('abonnement-verifier', { body: {} });

  if (error || !data) return { credites: 0, enAttente: 0, echeance: null };

  const lu = data as Partial<Verification>;
  return {
    credites: Number(lu.credites ?? 0),
    enAttente: Number(lu.enAttente ?? 0),
    echeance: lu.echeance ?? null,
  };
}

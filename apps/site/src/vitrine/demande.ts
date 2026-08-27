import { PALIERS, type Palier } from '@kolek/core';

/**
 * L'envoi d'une demande d'ouverture de compte.
 *
 * ## Pourquoi `fetch` et non `supabase-js`
 *
 * Le site n'a pas de session, n'en aura jamais, et n'a besoin que d'un seul
 * appel. Charger le client Supabase entier pour cela ajouterait une trentaine
 * de kilo-octets à une page déjà lourde de son animation — sur la connexion
 * d'un marché d'Abidjan, c'est une seconde de plus avant que le visiteur puisse
 * agir. Un `fetch` de dix lignes fait le même travail.
 *
 * La clé anonyme voyage dans l'en-tête `Authorization` : les Edge Functions
 * vérifient le jeton avant d'exécuter quoi que ce soit, et sans elle la
 * fonction rend 401. Cette clé est publique par construction — elle n'ouvre
 * rien par elle-même, les neuf tables lui répondant « permission refusée ».
 */

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string;
const CLE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface Demande {
  nom: string;
  telephone: string;
  /** Obligatoire depuis le 2026-08-27 : c'est par elle que l'accès arrive une
      fois la demande accordée. Sans elle, la demande n'a pas de suite possible
      autre qu'un appel. */
  email: string;
  zone: string;
  palier: Palier;
  message: string;
}

export type Envoi = { ok: true } | { ok: false; message: string; champ?: string };

/**
 * Les refus, traduits une fois.
 *
 * Les codes sont en majuscules sans accents parce qu'ils voyagent entre du
 * TypeScript et du Deno ; les phrases sont ici, parce que c'est le seul endroit
 * qui sait à qui il parle.
 */
const MESSAGES: Record<string, string> = {
  NOM_TROP_COURT: 'Indique ton nom complet.',
  NOM_TROP_LONG: 'Ce nom est trop long.',
  TELEPHONE_TROP_COURT: 'Ce numéro semble incomplet.',
  TELEPHONE_TROP_LONG: 'Ce numéro est trop long.',
  EMAIL_MANQUANT: 'Indique ton adresse e-mail — c’est par là que ton accès arrivera.',
  EMAIL_INVALIDE: 'Cette adresse n’a pas la bonne forme. Vérifie l’arobase et le domaine.',
  EMAIL_TROP_LONG: 'Cette adresse est trop longue.',
  ZONE_TROP_LONGUE: 'Le nom de la zone est trop long.',
  MESSAGE_TROP_LONG: 'Ton message dépasse 500 caractères.',
  PALIER_INCONNU: 'Cette offre n’existe pas. Choisis-en une dans la liste.',
  DEMANDE_DEJA_EN_ATTENTE:
    'Une demande est déjà enregistrée pour ce numéro. GTCS te rappelle très vite — inutile de renvoyer.',
  TROP_DE_DEMANDES:
    'Une demande vient de partir depuis cette connexion. Patiente une minute avant de réessayer.',
  CORPS_ILLISIBLE: 'La demande n’a pas pu être lue. Réessaie.',
  SAISIE_REFUSEE: 'Une des informations n’a pas été acceptée. Vérifie ta saisie.',
  ENREGISTREMENT_IMPOSSIBLE: 'Enregistrement impossible pour le moment. Réessaie dans un instant.',
  CONFIGURATION: 'Le service est mal configuré. Préviens GTCS.',
};

export async function envoyerDemande(demande: Demande): Promise<Envoi> {
  if (!URL_SUPABASE || !CLE_ANON) {
    return { ok: false, message: 'Le formulaire n’est pas configuré sur cette version du site.' };
  }

  let reponse: Response;
  try {
    reponse = await fetch(`${URL_SUPABASE}/functions/v1/demander-ouverture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CLE_ANON,
        Authorization: `Bearer ${CLE_ANON}`,
      },
      body: JSON.stringify(demande),
    });
  } catch {
    // Coupure réseau : le message dit quoi faire, pas ce qui s'est passé.
    return { ok: false, message: 'Pas de connexion. Vérifie ton réseau et réessaie.' };
  }

  if (reponse.ok) return { ok: true };

  let corps: { erreur?: string; champ?: string } = {};
  try {
    corps = (await reponse.json()) as typeof corps;
  } catch {
    // Corps illisible : le message générique reste juste.
  }

  const code = corps.erreur ?? '';
  return {
    ok: false,
    message: MESSAGES[code] ?? 'Envoi impossible. Réessaie dans un instant.',
    champ: corps.champ,
  };
}

/* ---------------------------- Le palier demandé --------------------------- */

/**
 * Lit le palier choisi dans l'adresse.
 *
 * La grille tarifaire y mène par `/inscription?palier=pro`. Un palier absent ou
 * inconnu retombe sur l'essai plutôt que de vider le formulaire : c'est une
 * préférence d'affichage, pas une donnée à valider — le serveur, lui, refuse un
 * palier inconnu, et c'est là que le refus compte.
 */
export function palierDepuisAdresse(recherche: string): Palier {
  const demande = new URLSearchParams(recherche).get('palier');
  return PALIERS.some((p) => p.cle === demande) ? (demande as Palier) : 'essai';
}

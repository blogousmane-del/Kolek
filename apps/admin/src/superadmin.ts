import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

/**
 * Les données de l'écran Super Admin.
 *
 * Deux routes, et la séparation est volontaire : `super-admin-etat` se rappelle
 * à chaque ouverture d'écran, `super-admin-action` seulement après un clic.
 *
 * ## Aucune règle d'autorisation ici
 *
 * Ni ici ni dans les écrans. « Pas d'action sur soi-même », le quota d'un code,
 * l'unicité du dernier super admin : tout cela vit en SQL, sous verrou. Ce
 * module envoie des demandes et traduit des verdicts. Une règle recopiée dans
 * l'interface donnerait deux vérités, et la seconde finirait par diverger.
 *
 * ## Deux façons de dire non
 *
 * Un **code d'erreur** (`erreur`) dit que la porte est fermée, la requête mal
 * formée ou le serveur en panne. Une **raison** (`raison`, servie en 409) dit
 * que la demande a été comprise et refusée. Les deux voyagent dans le corps
 * d'une réponse non-2xx, donc dans `error.context` — `error.message` ne dit que
 * « non-2xx status code », ce que personne ne peut corriger.
 */

export interface AdministrateurSuper {
  user_id: string;
  niveau: 'admin' | 'super';
  /** « Compte sans fiche » quand l'administrateur n'est pas un collecteur. */
  nom: string;
  telephone: string | null;
  ajoute_le: string;
  /** Relu dans le journal, jamais stocké ; nul pour les comptes antérieurs. */
  ajoute_par: string | null;
}

export interface CodePromo {
  code: string;
  remise_pct: number;
  valide_du: string;
  valide_au: string;
  quota: number | null;
  utilisations: number;
  cree_le: string;
  statut: 'en_cours' | 'programme' | 'expire' | 'quota_epuise';
}

export interface RemiseEnCours {
  collecteur_id: string;
  nom: string;
  palier: string;
  promo_code: string;
  remise_pct: number;
  remise_fin: string;
}

/**
 * L'état du paiement d'abonnement, tel que le serveur le décrit.
 *
 * Aucune valeur secrète ici, et ce n'est pas une convention de nommage : la
 * fonction qui compose cet objet est pure et testée pour ça. `cleIndice` est
 * volontairement le seul reste de la clé — quatre caractères, assez pour
 * distinguer deux clés au téléphone, pas assez pour en fabriquer une.
 */
export interface EtatPaiement {
  cleConfiguree: boolean;
  cleIndice: string | null;
  webhookConfigure: boolean;
  produits: Array<{ palier: string; configure: boolean }>;
  /** L'état vivant : la clé posée est-elle **acceptée** par la boutique ? */
  boutique: 'joignable' | 'refusee' | 'injoignable' | 'non_configuree';
}

export interface EtatSuperAdmin {
  genere_le: string;
  /** Qui regarde, pour marquer « c'est toi » sans redemander la session. */
  appelant: string;
  administrateurs: AdministrateurSuper[];
  codes_promo: CodePromo[];
  /** Seules les remises qui courent encore : une remise échue n'est plus une
      dépense, elle appartient au journal. */
  remises: RemiseEnCours[];
  volumes: Record<string, number>;
  journal: { derniere_ecriture: string | null; tables: string[] };
  postgres: string;
  /** Absent tant que la fonction `super-admin-etat` déployée est antérieure à
      cet écran — d'où le `| null`, et le message que la section affiche alors. */
  paiement?: EtatPaiement | null;
}

const MESSAGES: Record<string, string> = {
  ACCES_RESERVE: 'Cet écran est réservé aux super administrateurs.',
  VERIFICATION_IMPOSSIBLE: 'Impossible de vérifier les droits d’accès.',
  APPELANT_INCONNU: 'Ta session ne porte pas de compte identifiable. Reconnecte-toi.',
  AGREGATION_IMPOSSIBLE: 'La base n’a pas pu produire l’état de la plateforme.',
  ECRITURE_IMPOSSIBLE: 'L’écriture a échoué côté serveur. Réessaie.',
  CHAMPS_INVALIDES: 'Un champ du formulaire est mal rempli.',
  ACTION_INCONNUE: 'Cette action n’existe pas côté serveur.',
  LECTURE_IMPOSSIBLE: 'La base n’a pas pu produire cette page du journal.',
  CORPS_ILLISIBLE: 'Requête mal formée.',
  METHODE_NON_AUTORISEE: 'Requête mal formée.',
  CONFIGURATION: 'Le serveur est mal configuré.',
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
};

/**
 * Les refus métier, en clair.
 *
 * `action_sur_soi` couvre les deux gestes — se rétrograder et se révoquer — et
 * porte sa raison d'être : c'est cette règle, et elle seule, qui garantit qu'il
 * restera toujours un super admin. Un message qui dirait juste « interdit »
 * ferait passer pour un caprice ce qui est la seule protection du dernier accès.
 */
const RAISONS: Record<string, string> = {
  acteur_inconnu:
    'Ton identité n’a pas été transmise au serveur. Un changement de privilège sans auteur enregistré n’aboutit pas.',
  acteur_non_autorise: 'Ton compte n’est plus super administrateur.',
  action_sur_soi:
    'Tu ne peux pas modifier ton propre accès. C’est ce qui garantit qu’il reste toujours un super administrateur.',
  niveau_inconnu: 'Ce niveau n’existe pas.',
  cible_non_administrateur: 'Ce compte n’est déjà plus administrateur.',
  code_existant: 'Ce code existe déjà.',
  code_hors_bornes:
    'Le code est hors des bornes admises : lettres majuscules et chiffres, remise entre 1 et 100 %, période cohérente.',
  collecteur_introuvable: 'Ce collecteur n’existe plus.',
  remise_deja_active:
    'Ce collecteur a déjà une remise en cours. Attends qu’elle s’achève avant d’en poser une autre.',
  code_indisponible: 'Ce code est inconnu, hors période, ou son quota est épuisé.',
  refus: 'Le serveur a refusé cette demande.',
};

/** Lit `erreur` et `raison` dans le corps d'une réponse non-2xx. Les deux clés
    sont cherchées ensemble : la route sert l'une ou l'autre selon le statut, et
    l'appelant n'a pas à savoir laquelle avant d'avoir lu. */
async function decoder(erreur: unknown): Promise<{ erreur?: string; raison?: string } | undefined> {
  try {
    const contexte = (erreur as { context?: Response }).context;
    if (!contexte || typeof contexte.json !== 'function') return undefined;
    return (await contexte.json()) as { erreur?: string; raison?: string };
  } catch {
    return undefined;
  }
}

/** Un code absent des dictionnaires ressort brut : une route qui gagne une
    raison sans que l'écran suive doit rester lisible. */
function enClair(corps: { erreur?: string; raison?: string } | undefined): string | undefined {
  if (corps?.raison) return RAISONS[corps.raison] ?? corps.raison;
  if (corps?.erreur) return MESSAGES[corps.erreur] ?? corps.erreur;
  return undefined;
}

export async function chargerEtatSuperAdmin(): Promise<EtatSuperAdmin> {
  const { data, error } = await supabase.functions.invoke('super-admin-etat', { method: 'GET' });

  if (error) {
    throw new Error(enClair(await decoder(error)) ?? error.message);
  }

  return data as EtatSuperAdmin;
}

export type EtatSuper =
  | { statut: 'chargement' }
  | { statut: 'ok'; etat: EtatSuperAdmin }
  | { statut: 'erreur'; message: string };

export function useEtatSuperAdmin(): EtatSuper & { recharger: () => void } {
  const [etat, setEtat] = useState<EtatSuper>({ statut: 'chargement' });

  const recharger = useCallback(() => {
    let abandonne = false;
    setEtat({ statut: 'chargement' });

    chargerEtatSuperAdmin()
      .then((charge) => {
        if (!abandonne) setEtat({ statut: 'ok', etat: charge });
      })
      .catch((cause: unknown) => {
        if (abandonne) return;
        setEtat({
          statut: 'erreur',
          message: cause instanceof Error ? cause.message : 'Erreur inconnue.',
        });
      });

    return () => {
      abandonne = true;
    };
  }, []);

  useEffect(() => recharger(), [recharger]);

  return { ...etat, recharger };
}

/* -------------------------------- Journal -------------------------------- */

export interface LigneJournal {
  id: string;
  survenu_le: string;
  table_cible: string;
  action: string;
  ligne_id: string | null;
  /** Qui a agi. Nul pour les lignes écrites avant la migration du 2026-08-30. */
  acteur_id: string | null;
  /** Sur qui. Ce n'est pas le même que `acteur_id`, et confondre les deux
      était exactement le défaut que cette colonne a corrigé. */
  collecteur_id: string | null;
  donnees: Record<string, unknown> | null;
}

export interface PageJournal {
  lignes: LigneJournal[];
  /** Vrai s'il reste une page après celle-ci. Le serveur lit une ligne de plus
      que demandé plutôt que de compter une table qui ne rétrécit jamais. */
  a_suivre: boolean;
  /** Ce que le serveur a réellement appliqué après ses propres bornes. */
  page: number;
  taille: number;
}

/**
 * Lit une page du journal.
 *
 * Les paramètres voyagent dans le corps : `functions.invoke` ne sait pas
 * construire de chaîne de requête, et la route lit les deux formes.
 *
 * Cette lecture s'enregistre côté serveur. Ce n'est pas un appel à faire à
 * l'ouverture d'un écran : le journal se remplirait de la preuve qu'on le
 * regarde, et ce qu'il protège finirait enterré dessous.
 */
export async function chargerJournal({
  page,
  taille,
  consultations = false,
}: {
  page: number;
  taille: number;
  consultations?: boolean;
}): Promise<PageJournal> {
  const { data, error } = await supabase.functions.invoke('super-admin-journal', {
    body: { page, taille, consultations },
  });

  if (error) {
    throw new Error(enClair(await decoder(error)) ?? error.message);
  }

  return data as PageJournal;
}

export type ActionSuperAdmin =
  | { action: 'definir_niveau'; cible: string; niveau: 'admin' | 'super' }
  | { action: 'revoquer'; cible: string }
  | {
      action: 'creer_code';
      code: string;
      remise_pct: number;
      valide_du: string;
      valide_au: string;
      quota: number | null;
    }
  | { action: 'appliquer_code'; collecteur: string; code: string };

export type ResultatAction =
  | { ok: true; corps: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * Envoie une demande d'écriture et rend un verdict lisible.
 *
 * Le corps part tel quel : les bornes réelles — format du code, remise entre 1
 * et 100, période cohérente — sont des contraintes de table, et les redire ici
 * en ferait une seconde copie qui finirait par diverger de celle qui décide.
 *
 * Un 200 dont le corps ne dit pas `fait: true` n'est pas compté comme une
 * réussite. La route promet 409 sur un refus métier ; si elle changeait d'avis,
 * c'est cette ligne qui empêcherait l'écran d'annoncer un succès muet.
 */
export async function agirSuperAdmin(demande: ActionSuperAdmin): Promise<ResultatAction> {
  const { data, error } = await supabase.functions.invoke('super-admin-action', { body: demande });

  if (error) {
    return { ok: false, message: enClair(await decoder(error)) ?? error.message };
  }

  const corps = (data ?? {}) as Record<string, unknown>;
  if (corps.fait !== true) {
    const raison = typeof corps.raison === 'string' ? corps.raison : 'refus';
    return { ok: false, message: RAISONS[raison] ?? raison };
  }

  return { ok: true, corps };
}

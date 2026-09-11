import type { FluxPeriode } from '@kolek/core';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

/**
 * Accès aux chiffres de la plateforme.
 *
 * Un seul appel, partagé par les six écrans. C'est délibéré : les données
 * viennent d'une seule requête SQL agrégée, et les découper en six appels
 * multiplierait les allers-retours pour afficher les mêmes totaux — en plus de
 * laisser deux écrans s'ouvrir sur des instantanés différents, ce qu'un
 * administrateur lirait comme une incohérence de la base.
 *
 * Aucun `select` direct ici, et il n'y en aura pas : la RLS n'accorde à personne
 * la lecture des données d'un autre collecteur, administrateur compris. La seule
 * porte est l'Edge Function, qui vérifie `est_admin()` côté serveur avant de
 * sortir la clé de service.
 */

export interface LigneCollecteur {
  id: string;
  nom: string;
  telephone: string;
  zone: string | null;
  // Le rattachement à un titulaire. Nul pour la très grande majorité des
  // collecteurs — seul le forfait Illimité ouvre droit à une équipe.
  titulaire_id: string | null;
  titulaire_nom: string | null;
  palier: string;
  abonnement_statut: 'actif' | 'suspendu' | 'expire';
  abonnement_echeance: string;
  cree_le: string;
  clients: number;
  cartes_actives: number;
  encaisse: number;
  commissions: number;
  restitutions: number;
  encours: number;
}

export interface LigneZone {
  zone: string;
  collecteurs: number;
  clients: number;
  encaisse: number;
}

export interface Mouvement {
  type: 'mise' | 'commission' | 'restitution';
  client: string;
  collecteur_id: string;
  collecteur: string;
  /** Négatif pour une restitution — le signe vient du serveur, pas de l'écran. */
  montant: number;
  survenu_le: string;
}

export interface LignePalier {
  palier: string;
  nom: string;
  prix: number;
  limiteClients: number | null;
  total: number;
  actifs: number;
  mrr: number;
}

export interface LigneCarte {
  id: string;
  client: string;
  collecteur_id: string;
  collecteur: string;
  mise: number;
  mises_encaissees: number;
  statut: 'active' | 'cloturee';
  ouverte_le: string;
  /** `(mises_encaissees - 1) × mise` : la première mise est la commission. */
  solde_restituable: number;
  restitue: number;
  /** Ce qui reste dû sur cette carte ; nul une fois la restitution faite. */
  encours: number;
}

/** Les trois seules fenêtres proposées. Le serveur refuse toute autre valeur. */
export type Periode = 1 | 7 | 30;

export interface PointSerieJour {
  jour: string;
  encaisse: number;
  commissions: number;
  restitutions: number;
  mises: number;
}

export interface ZonePeriode {
  zone: string;
  encaisse: number;
  mises: number;
  collecteurs: number;
}

export interface CollecteurSansMise {
  id: string;
  nom: string;
  zone: string | null;
  /** `null` quand ce collecteur n'a jamais encaissé. */
  derniere_mise: string | null;
  jours_sans: number;
}

/** Ce que `admin_tendances(p_jours)` rend, tel quel. */
export interface Tendances {
  periode: { jours: Periode; debut: string; fin: string };
  /** Jour de la première mise en base. `null` si la base n'en a aucune. */
  depuis: string | null;
  flux: FluxPeriode;
  flux_precedent: FluxPeriode;
  serie: PointSerieJour[];
  zones: ZonePeriode[];
  mouvements: Mouvement[];
  mouvements_total: number;
  collecteurs_sans_mise: CollecteurSansMise[];
}

export interface VueGlobale {
  genereLe: string;
  abonnements: {
    collecteurs_total: number;
    collecteurs_actifs: number;
    suspendus: number;
    expires: number;
    expirations_ce_mois: number;
    expirations_a_venir_30j: number;
    mrr: number;
    parPalier: LignePalier[];
  };
  totaux: {
    clients: number;
    cartes_actives: number;
    cartes_total: number;
    mises: number;
    total_encaisse: number;
    commissions: number;
    restitutions: number;
    encours_clients: number;
  };
  zones: LigneZone[];
  collecteurs: LigneCollecteur[];
  mouvements: Mouvement[];
  /** Bornée à 500 lignes côté serveur ; voir `cartes_total_lignes`. */
  cartes: LigneCarte[];
  cartes_total_lignes: number;
  /** Ajouté en J5. `null` si l'agrégation des paiements a échoué — l'écran le
      dit alors, plutôt que d'afficher un tiret qui se lirait « jamais payé ». */
  paiements: {
    total_30j: number;
    nombre_30j: number;
    par_collecteur: Array<{
      collecteur_id: string;
      dernier_le: string;
      dernier_montant: number;
      derniere_devise: string;
    }>;
  } | null;
  /** `null` quand `admin_tendances` a échoué : l'écran le dit et garde le
      reste. Facultatif, parce qu'une réponse d'avant le 2026-09-11 n'en a
      pas. */
  tendances?: Tendances | null;
}

export type EtatVue =
  | { statut: 'chargement' }
  | { statut: 'ok'; vue: VueGlobale }
  | { statut: 'erreur'; message: string };

const MESSAGES: Record<string, string> = {
  ACCES_RESERVE: "Ce compte n'est pas un compte d'administration GTCS.",
  VERIFICATION_IMPOSSIBLE: "Impossible de vérifier les droits d'accès.",
  AGREGATION_IMPOSSIBLE: 'La base n’a pas pu produire les chiffres.',
  PALIER_INCONNU: 'Un collecteur porte un palier absent de la grille tarifaire.',
  CONFIGURATION: 'Le serveur est mal configuré.',
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
  PERIODE_INVALIDE: 'Cette période n’est pas proposée.',
};

/**
 * Le code d'erreur que l'Edge Function a posé dans le corps de sa réponse.
 *
 * Le corps d'une réponse non-2xx voyage dans `error.context`. Sans cette
 * lecture, un refus légitime — « ce compte n'est pas administrateur » —
 * s'afficherait comme un « Edge Function returned a non-2xx status code », et
 * personne ne saurait quoi en faire.
 *
 * Extraite le 2026-09-11 : deux fonctions appellent maintenant la même route,
 * et recopier cette lecture en ferait deux versions à corriger le jour où la
 * forme change.
 */
async function codeErreur(error: unknown): Promise<string | undefined> {
  try {
    const contexte = (error as { context?: Response }).context;
    if (contexte && typeof contexte.json === 'function') {
      return ((await contexte.json()) as { erreur?: string }).erreur;
    }
  } catch {
    // Corps illisible : l'appelant garde son message générique.
  }
  return undefined;
}

export async function chargerVueGlobale(): Promise<VueGlobale> {
  // `functions.invoke` joint le jeton de la session en cours. C'est ce jeton que
  // l'Edge Function utilise pour demander `est_admin()` — donc la question posée
  // au serveur porte bien sur l'utilisateur assis devant l'écran.
  const { data, error } = await supabase.functions.invoke('admin-vue-globale', { method: 'GET' });

  if (error) {
    const code = await codeErreur(error);
    throw new Error(code ? (MESSAGES[code] ?? code) : error.message);
  }

  return data as VueGlobale;
}

/**
 * Les seules tendances, pour un changement de période.
 *
 * `partie=tendances` évite de retélécharger cinq cents cartes et toute la liste
 * des collecteurs pour recalculer un total. Le corps plutôt que la chaîne de
 * requête : `functions.invoke` ne sait pas construire la seconde, et la route
 * lit les deux.
 */
export async function chargerTendances(jours: Periode): Promise<Tendances> {
  const { data, error } = await supabase.functions.invoke('admin-vue-globale', {
    body: { jours, partie: 'tendances' },
  });

  if (error) {
    const code = await codeErreur(error);
    throw new Error(code ? (MESSAGES[code] ?? code) : error.message);
  }

  const tendances = (data as { tendances: Tendances | null }).tendances;
  if (!tendances) throw new Error('La base n’a pas rendu les tendances.');
  return tendances;
}

/**
 * La vue globale, ou celle qu'on lui impose.
 *
 * `vueFournie` est le seul chemin par lequel des chiffres qui ne viennent pas du
 * serveur peuvent entrer dans la console — et il vient d'en haut, jamais du
 * navigateur. Le mode démonstration passe par là : `App` charge le module de
 * démonstration au clic et le descend en propriété.
 *
 * **Ce que ce crochet ne fait plus, et pourquoi.** Il a lu `localStorage` du
 * 2026-09-05 au 2026-09-06. Un drapeau posé dans un onglet valait pour tous les
 * autres : une console réelle, ouverte et authentifiée, remplaçait ses totaux
 * par ceux de la démonstration au premier rechargement, sans bandeau puisque son
 * `App` avait démarré hors démonstration. Un tableau de bord qui affiche
 * 24 650 000 FCFA fictifs à un administrateur qui se croit devant sa caisse est
 * pire qu'un tableau de bord en panne.
 *
 * Il ne retombe pas non plus sur des chiffres inventés quand l'appel échoue. Une
 * erreur se montre : `EcranErreur` porte déjà le bouton qui rappelle `recharger`.
 */
export function useVueGlobale(
  vueFournie?: VueGlobale,
): EtatVue & { recharger: () => void } {
  const [etat, setEtat] = useState<EtatVue>({ statut: 'chargement' });

  const recharger = useCallback(() => {
    if (vueFournie) {
      setEtat({ statut: 'ok', vue: vueFournie });
      return () => {};
    }

    let abandonne = false;
    setEtat({ statut: 'chargement' });

    chargerVueGlobale()
      .then((vue) => {
        if (!abandonne) setEtat({ statut: 'ok', vue });
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
  }, [vueFournie]);

  useEffect(() => recharger(), [recharger]);

  return { ...etat, recharger };
}

// --- Création d'un collecteur ---

export interface SaisieCollecteur {
  email: string;
  motDePasse: string;
  nom: string;
  telephone: string;
  zone?: string;
  palier?: string;
}

const MESSAGES_CREATION: Record<string, string> = {
  EMAIL_INVALIDE: 'Adresse électronique invalide.',
  EMAIL_DEJA_PRIS: 'Un compte existe déjà avec cette adresse.',
  TELEPHONE_DEJA_PRIS: 'Un autre collecteur porte déjà ce numéro.',
  MOT_DE_PASSE_COURT: 'Le mot de passe doit faire au moins 10 caractères.',
  NOM_REQUIS: 'Le nom du collecteur est obligatoire.',
  TELEPHONE_REQUIS: 'Le téléphone est obligatoire — il identifie le collecteur.',
  NOM_TROP_LONG: 'Le nom dépasse 120 caractères.',
  TELEPHONE_TROP_LONG: 'Le téléphone dépasse 64 caractères.',
  ZONE_TROP_LONGUE: 'La zone dépasse 80 caractères.',
  PALIER_INCONNU: 'Ce palier ne figure pas dans la grille tarifaire.',
  ACCES_RESERVE: "Ce compte n'est pas un compte d'administration GTCS.",
  VERIFICATION_IMPOSSIBLE: "Impossible de vérifier les droits d'accès.",
  COMPLEMENT_INCOMPLET:
    'Le compte est créé et fonctionne, mais la zone et le palier n’ont pas été enregistrés. Corrige-les depuis sa fiche — ne recrée pas le compte.',
  MOT_DE_PASSE_COMPROMIS:
    'Ce mot de passe figure dans des fuites de données publiques. Choisis-en un autre — ou reprends celui que le formulaire propose.',
  CREATION_IMPOSSIBLE: 'Création impossible. Réessaie.',
  CORPS_ILLISIBLE: 'Requête mal formée.',
};

/**
 * Le compte est créé, mais quelque chose mérite d'être dit.
 *
 * Un seul cas aujourd'hui : le service Have I Been Pwned était injoignable au
 * moment de la création, donc le mot de passe n'a pas pu être confronté aux
 * fuites connues. La fonction laisse passer plutôt que de bloquer l'exploitation
 * sur une panne extérieure — mais le taire reviendrait à faire croire à une
 * vérification qui n'a pas eu lieu.
 */
const AVERTISSEMENTS: Record<string, string> = {
  FUITES_NON_VERIFIEES:
    'Le compte est créé. Le service de vérification des fuites était injoignable : ce mot de passe n’a pas pu être confronté aux fuites connues.',
};

/** Rend le message du code, en y glissant le nombre d'occurrences s'il est là. */
function messageCreation(code: string, occurrences?: number): string {
  const base = MESSAGES_CREATION[code] ?? code;
  if (code !== 'MOT_DE_PASSE_COMPROMIS' || !occurrences) return base;
  // « vu 2 266 543 fois » fait comprendre qu'il ne s'agit pas d'un caprice de
  // complexité, mais d'un mot de passe que n'importe qui peut rejouer.
  return `${base} Il a été vu ${occurrences.toLocaleString('fr-FR')} fois.`;
}

/**
 * Crée un compte collecteur.
 *
 * L'inscription publique est fermée, et créer un utilisateur exige la clé de
 * service : ce geste ne peut donc vivre que sur le serveur. L'écran ne fait
 * qu'appeler l'Edge Function, qui vérifie `est_admin()` sous l'identité de
 * l'appelant avant de sortir la clé.
 */
export async function creerCollecteur(
  saisie: SaisieCollecteur,
): Promise<
  | { ok: true; collecteurId: string; avertissement?: string }
  | { ok: false; message: string }
> {
  const { data, error } = await supabase.functions.invoke('admin-creer-collecteur', {
    body: saisie,
  });

  if (error) {
    let code: string | undefined;
    let occurrences: number | undefined;
    try {
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        const corps = (await contexte.json()) as { erreur?: string; occurrences?: number };
        code = corps.erreur;
        occurrences = corps.occurrences;
      }
    } catch {
      // Corps illisible : on garde le message générique.
    }
    return { ok: false, message: code ? messageCreation(code, occurrences) : error.message };
  }

  // `invoke` ne remplit `error` que pour un statut hors 2xx. `COMPLEMENT_INCOMPLET`
  // arrive en **207** — un succès pour le transport, un demi-échec pour le métier :
  // le compte existe et fonctionne, seuls la zone et le palier manquent. Sans cet
  // examen du corps, l'écran annoncerait une création parfaite et personne
  // n'irait corriger la fiche.
  const corps = data as { collecteurId: string; avertissement?: string; erreur?: string };
  const codeAvertissement = corps.erreur ?? corps.avertissement;

  return {
    ok: true,
    collecteurId: corps.collecteurId,
    avertissement: codeAvertissement
      ? (AVERTISSEMENTS[codeAvertissement] ?? MESSAGES_CREATION[codeAvertissement])
      : undefined,
  };
}

// --- Suppression d'un collecteur ---

const MESSAGES_SUPPRESSION: Record<string, string> = {
  ACCES_RESERVE: "Ce compte n'est pas un compte d'administration GTCS.",
  VERIFICATION_IMPOSSIBLE: "Impossible de v\u00e9rifier les droits d'acc\u00e8s.",
  COLLECTEUR_INTROUVABLE: 'Ce collecteur n\u2019existe plus.',
  SUPPRESSION_DE_SOI: 'Tu ne peux pas supprimer ton propre compte depuis cet \u00e9cran.',
  // Le retrait se faisait dans Supabase faute d'\u00e9cran pour le porter. L'\u00e9cran
  // Super Admin le fait maintenant, et garder l'ancien message enverrait
  // l'administrateur dans une console \u00e0 laquelle il n'a pas forc\u00e9ment acc\u00e8s.
  CIBLE_ADMINISTRATEUR:
    'Ce compte est un compte d\u2019administration. Retire-lui ce droit depuis l\u2019\u00e9cran Super Admin, puis reviens le supprimer.',
  COMPTE_A_PAYE:
    'Ce collecteur a r\u00e9gl\u00e9 au moins un abonnement. Son compte porte une \u00e9criture comptable et ne peut pas \u00eatre supprim\u00e9 \u2014 suspends son abonnement \u00e0 la place.',
  SUPPRESSION_IMPOSSIBLE: 'Suppression impossible. R\u00e9essaie.',
  CORPS_ILLISIBLE: 'Requ\u00eate mal form\u00e9e.',
};

/**
 * Supprime un compte collecteur, et refuse de le faire s'il a mani\u00e9 de l'argent.
 *
 * La base refuserait de toute fa\u00e7on : `mises` et `retraits` r\u00e9f\u00e9rencent le
 * collecteur en `on delete restrict`, parce qu'on ne fait pas dispara\u00eetre de
 * l'argent encaiss\u00e9 en supprimant un compte. Ce que la fonction ajoute, c'est de
 * dire *pourquoi* avec un nombre, au lieu de laisser remonter une violation de
 * cl\u00e9 \u00e9trang\u00e8re que personne ne sait lire.
 */
export async function supprimerCollecteur(
  collecteurId: string,
): Promise<{ ok: true; nom: string; clientsSupprimes: number } | { ok: false; message: string }> {
  const { data, error } = await supabase.functions.invoke('admin-supprimer-collecteur', {
    body: { collecteurId },
  });

  if (error) {
    let code: string | undefined;
    let mises = 0;
    let retraits = 0;
    try {
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        const corps = (await contexte.json()) as {
          erreur?: string;
          mises?: number;
          retraits?: number;
        };
        code = corps.erreur;
        mises = corps.mises ?? 0;
        retraits = corps.retraits ?? 0;
      }
    } catch {
      // Corps illisible : le message générique reste juste.
    }

    if (code === 'COMPTE_A_ENCAISSE') {
      // Le refus le plus important de cet écran, donc celui qui mérite un
      // chiffre : « 2 mises » se vérifie, « ce compte a de l'activité » ne se
      // vérifie pas.
      const parts: string[] = [];
      if (mises > 0) parts.push(`${mises} mise${mises > 1 ? 's' : ''}`);
      if (retraits > 0) parts.push(`${retraits} retrait${retraits > 1 ? 's' : ''}`);
      return {
        ok: false,
        message: `Ce collecteur a ${parts.join(' et ')} \u00e0 son nom. Un compte qui a mani\u00e9 de l\u2019argent ne se supprime pas : le journal doit rester lisible. Suspends son abonnement \u00e0 la place.`,
      };
    }

    return {
      ok: false,
      message: code ? (MESSAGES_SUPPRESSION[code] ?? code) : error.message,
    };
  }

  const corps = data as { nom: string; clientsSupprimes: number };
  return { ok: true, nom: corps.nom, clientsSupprimes: corps.clientsSupprimes };
}

// --- Modification d'un collecteur ---

export interface ModificationCollecteur {
  nom?: string;
  telephone?: string;
  zone?: string;
  palier?: string;
  abonnementStatut?: string;
}

const MESSAGES_MODIFICATION: Record<string, string> = {
  NOM_REQUIS: 'Le nom du collecteur est obligatoire.',
  NOM_TROP_LONG: 'Le nom dépasse 120 caractères.',
  TELEPHONE_REQUIS: 'Le téléphone est obligatoire.',
  TELEPHONE_TROP_LONG: 'Le téléphone dépasse 64 caractères.',
  TELEPHONE_DEJA_PRIS: 'Un autre collecteur porte déjà ce numéro.',
  ZONE_TROP_LONGUE: 'La zone dépasse 80 caractères.',
  PALIER_INCONNU: 'Ce palier ne figure pas dans la grille tarifaire.',
  STATUT_INCONNU: 'Statut d\u2019abonnement inconnu.',
  RIEN_A_MODIFIER: 'Aucun changement à enregistrer.',
  COLLECTEUR_INTROUVABLE: 'Ce collecteur n\u2019existe plus.',
  ACCES_RESERVE: "Ce compte n'est pas un compte d'administration GTCS.",
  VERIFICATION_IMPOSSIBLE: "Impossible de vérifier les droits d'accès.",
  BORNE: 'Une des valeurs saisies dépasse la limite autorisée.',
  MODIFICATION_IMPOSSIBLE: 'Modification impossible. Réessaie.',
  CORPS_ILLISIBLE: 'Requête mal formée.',
};

/**
 * Modifie la fiche d'un collecteur.
 *
 * Seuls les champs présents dans `changements` sont envoyes, et la fonction ne
 * touche qu'à ceux-là : un `update` complet effacerait la zone d'un collecteur
 * parce que le formulaire ne l'a pas rechargée.
 */
export async function modifierCollecteur(
  collecteurId: string,
  changements: ModificationCollecteur,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.functions.invoke('admin-modifier-collecteur', {
    body: { collecteurId, ...changements },
  });

  if (error) {
    let code: string | undefined;
    try {
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        code = ((await contexte.json()) as { erreur?: string }).erreur;
      }
    } catch {
      // Corps illisible : le message générique reste juste.
    }
    return { ok: false, message: code ? (MESSAGES_MODIFICATION[code] ?? code) : error.message };
  }

  return { ok: true };
}

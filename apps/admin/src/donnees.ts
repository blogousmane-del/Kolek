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
};

export async function chargerVueGlobale(): Promise<VueGlobale> {
  // `functions.invoke` joint le jeton de la session en cours. C'est ce jeton que
  // l'Edge Function utilise pour demander `est_admin()` — donc la question posée
  // au serveur porte bien sur l'utilisateur assis devant l'écran.
  const { data, error } = await supabase.functions.invoke('admin-vue-globale', { method: 'GET' });

  if (error) {
    // Le corps d'une réponse non-2xx voyage dans `error.context`. Sans cette
    // lecture, un refus légitime — « ce compte n'est pas administrateur » —
    // s'afficherait comme un « Edge Function returned a non-2xx status code »,
    // et personne ne saurait quoi en faire.
    let code: string | undefined;
    try {
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        code = ((await contexte.json()) as { erreur?: string }).erreur;
      }
    } catch {
      // Corps illisible : on garde le message générique ci-dessous.
    }
    throw new Error(code ? (MESSAGES[code] ?? code) : error.message);
  }

  return data as VueGlobale;
}

export const VUE_DEMO: VueGlobale = {
  genereLe: new Date().toISOString(),
  abonnements: {
    collecteurs_total: 18,
    collecteurs_actifs: 16,
    suspendus: 1,
    expires: 1,
    expirations_ce_mois: 3,
    expirations_a_venir_30j: 4,
    mrr: 270000,
    parPalier: [
      {
        palier: 'standard',
        nom: 'Standard (15 000 FCFA/mois)',
        prix: 15000,
        limiteClients: 100,
        total: 10,
        actifs: 9,
        mrr: 135000,
      },
      {
        palier: 'pro',
        nom: 'Professionnel (25 000 FCFA/mois)',
        prix: 25000,
        limiteClients: 300,
        total: 5,
        actifs: 5,
        mrr: 125000,
      },
      {
        palier: 'illimite',
        nom: 'Équipe Illimitée (50 000 FCFA/mois)',
        prix: 50000,
        limiteClients: null,
        total: 3,
        actifs: 2,
        mrr: 100000,
      },
    ],
  },
  totaux: {
    clients: 1420,
    cartes_actives: 1280,
    cartes_total: 1650,
    mises: 8450,
    total_encaisse: 24650000,
    commissions: 1845000,
    restitutions: 16200000,
    encours_clients: 6605000,
  },
  zones: [
    { zone: 'Cocody & Riviera', collecteurs: 5, clients: 480, encaisse: 9850000 },
    { zone: 'Yopougon Selmer & Sicogi', collecteurs: 4, clients: 390, encaisse: 6420000 },
    { zone: 'Treichville & Marcory', collecteurs: 4, clients: 310, encaisse: 5180000 },
    { zone: 'Bouaké Commerce & Air France', collecteurs: 3, clients: 240, encaisse: 3200000 },
  ],
  collecteurs: [
    {
      id: 'col-1',
      nom: 'Kouassi Jean-Baptiste',
      telephone: '+225 07 08 12 34 56',
      zone: 'Cocody & Riviera',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'pro',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-09-30T00:00:00Z',
      cree_le: '2025-02-15T00:00:00Z',
      clients: 145,
      cartes_actives: 130,
      encaisse: 3850000,
      commissions: 285000,
      restitutions: 2400000,
      encours: 1165000,
    },
    {
      id: 'col-2',
      nom: 'Yao Adjoua Marie',
      telephone: '+225 05 04 56 78 90',
      zone: 'Yopougon Selmer & Sicogi',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'standard',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-09-25T00:00:00Z',
      cree_le: '2025-03-10T00:00:00Z',
      clients: 92,
      cartes_actives: 85,
      encaisse: 2100000,
      commissions: 160000,
      restitutions: 1350000,
      encours: 590000,
    },
    {
      id: 'col-3',
      nom: 'Diallo Souleymane',
      telephone: '+225 01 02 99 88 77',
      zone: 'Treichville & Marcory',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'pro',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-09-28T00:00:00Z',
      cree_le: '2025-01-20T00:00:00Z',
      clients: 128,
      cartes_actives: 115,
      encaisse: 2950000,
      commissions: 220000,
      restitutions: 1900000,
      encours: 830000,
    },
    {
      id: 'col-4',
      nom: 'Kone Awa',
      telephone: '+225 07 55 44 33 22',
      zone: 'Bouaké Commerce & Air France',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'standard',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-09-20T00:00:00Z',
      cree_le: '2025-04-05T00:00:00Z',
      clients: 88,
      cartes_actives: 80,
      encaisse: 1750000,
      commissions: 130000,
      restitutions: 1100000,
      encours: 520000,
    },
    {
      id: 'col-5',
      nom: 'Bamba Balla',
      telephone: '+225 05 99 11 22 33',
      zone: 'Cocody & Riviera',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'illimite',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-10-15T00:00:00Z',
      cree_le: '2024-11-12T00:00:00Z',
      clients: 210,
      cartes_actives: 195,
      encaisse: 6000000,
      commissions: 450000,
      restitutions: 4100000,
      encours: 1450000,
    },
  ],
  mouvements: [
    {
      type: 'mise',
      client: 'Koffi Amenan Chantal',
      collecteur_id: 'col-1',
      collecteur: 'Kouassi Jean-Baptiste',
      montant: 5000,
      survenu_le: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      type: 'mise',
      client: 'Touré Bakary',
      collecteur_id: 'col-2',
      collecteur: 'Yao Adjoua Marie',
      montant: 2000,
      survenu_le: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    },
    {
      type: 'commission',
      client: 'Ouattara Fatou',
      collecteur_id: 'col-3',
      collecteur: 'Diallo Souleymane',
      montant: 1000,
      survenu_le: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    },
    {
      type: 'restitution',
      client: 'N’Dri Yao Pascal',
      collecteur_id: 'col-5',
      collecteur: 'Bamba Balla',
      montant: -150000,
      survenu_le: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    },
    {
      type: 'mise',
      client: 'Soro Gnenema',
      collecteur_id: 'col-4',
      collecteur: 'Kone Awa',
      montant: 10000,
      survenu_le: new Date(Date.now() - 210 * 60 * 1000).toISOString(),
    },
    {
      type: 'mise',
      client: 'Diomandé Massandjé',
      collecteur_id: 'col-1',
      collecteur: 'Kouassi Jean-Baptiste',
      montant: 5000,
      survenu_le: new Date(Date.now() - 300 * 60 * 1000).toISOString(),
    },
    {
      type: 'restitution',
      client: 'Coulibaly Ibrahim',
      collecteur_id: 'col-3',
      collecteur: 'Diallo Souleymane',
      montant: -90000,
      survenu_le: new Date(Date.now() - 450 * 60 * 1000).toISOString(),
    },
  ],
  cartes: [],
  cartes_total_lignes: 1280,
  paiements: {
    total_30j: 270000,
    nombre_30j: 18,
    par_collecteur: [
      {
        collecteur_id: 'col-1',
        dernier_le: '2026-08-30T10:00:00Z',
        dernier_montant: 25000,
        derniere_devise: 'XOF',
      },
    ],
  },
};

export function useVueGlobale(): EtatVue & { recharger: () => void } {
  const [etat, setEtat] = useState<EtatVue>({ statut: 'chargement' });

  const recharger = useCallback(() => {
    let abandonne = false;
    setEtat({ statut: 'chargement' });

    const estDemo = typeof localStorage !== 'undefined' && localStorage.getItem('kolek_admin_demo') === 'true';

    if (estDemo) {
      setTimeout(() => {
        if (!abandonne) setEtat({ statut: 'ok', vue: VUE_DEMO });
      }, 150);
      return () => {
        abandonne = true;
      };
    }

    chargerVueGlobale()
      .then((vue) => {
        if (!abandonne) setEtat({ statut: 'ok', vue });
      })
      .catch((cause: unknown) => {
        if (abandonne) return;
        // En mode local sans serveur Supabase, repli gracieux sur VUE_DEMO si nécessaire
        if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
          setEtat({ statut: 'ok', vue: VUE_DEMO });
        } else {
          setEtat({
            statut: 'erreur',
            message: cause instanceof Error ? cause.message : 'Erreur inconnue.',
          });
        }
      });

    return () => {
      abandonne = true;
    };
  }, []);

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

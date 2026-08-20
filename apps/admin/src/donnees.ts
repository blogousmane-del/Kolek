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

export function useVueGlobale(): EtatVue & { recharger: () => void } {
  const [etat, setEtat] = useState<EtatVue>({ statut: 'chargement' });

  const recharger = useCallback(() => {
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
  }, []);

  useEffect(() => recharger(), [recharger]);

  return { ...etat, recharger };
}

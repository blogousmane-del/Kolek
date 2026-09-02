import type { Palier } from './types';

/**
 * Grille tarifaire — source unique.
 *
 * Trois écrans l'affichent : la gestion des abonnements côté administration,
 * sa version mobile, et la page de tarifs publique. Les maquettes recopiaient
 * les quatre prix dans les trois. Un prix qui diverge entre la page de vente et
 * l'écran d'administration n'est pas un défaut d'affichage, c'est un litige
 * commercial : on annonce un montant au prospect et on en facture un autre.
 *
 * ---
 *
 * ARBITRAGE RENDU LE 2026-08-20 — **le modèle du cahier des charges §5 fait foi.**
 *
 * Ce fichier a porté jusqu'à cette date les montants des maquettes Banani, qui
 * décrivaient un autre modèle d'affaires : le client payant y était une
 * *organisation* employant plusieurs collecteurs, à 0 / 9 900 / 24 900 / 49 900
 * FCFA, avec des limites exprimées en nombre de collecteurs.
 *
 * Le modèle retenu est celui du cahier §5 : **le client payant est un
 * collecteur**, et les limites s'expriment en nombre de *clients*. Le
 * raisonnement de prix y est explicite — « un collecteur de 100 clients à
 * 1 000 FCFA de mise encaisse ~100 000 FCFA de commissions par cycle ».
 *
 * C'est aussi le seul modèle que la base sait représenter : `collecteurs` est en
 * correspondance 1 pour 1 avec `auth.users`, `palier` et `abonnement_*` sont
 * portés par la ligne du collecteur, et il n'existe aucune table
 * `organisations`. Retenir les maquettes aurait imposé une migration avant tout
 * calcul de chiffre d'affaires.
 *
 * Conséquence directe : le MRR se calcule en sommant `prix` sur les collecteurs
 * dont `abonnement_statut = 'actif'`. Appliquer les anciens montants à ce même
 * décompte aurait multiplié le chiffre annoncé par quatre à cinq — un prix par
 * organisation facturé à chaque collecteur.
 */
export interface DescriptionPalier {
  cle: Palier;
  nom: string;
  accroche: string;
  /** En FCFA par mois. `0` pour l'essai — la période, elle, est dans `periode`. */
  prix: number;
  periode: string;
  limite: string;
  /**
   * Le plafond de `limite`, en clients, sous une forme exploitable par le code.
   * `null` vaut « aucun plafond ».
   *
   * `limite` est une chaîne d'affichage ; l'utiliser pour décider d'un refus
   * obligerait à la relire, et un jour quelqu'un écrira « 150 clients max » et
   * cassera l'analyse sans casser l'écran. Le chiffre vit donc à part.
   */
  limiteClients: number | null;
  /**
   * Le nombre de collaborateurs inclus. `0` partout sauf sur Illimité.
   *
   * Dans le même fichier que le prix, et pour la même raison : la grille
   * tarifaire de la vitrine et le contrôle d'accès de la création d'un
   * collaborateur doivent lire le même chiffre, sinon on vend trois places et on
   * en accorde deux.
   */
  collaborateursInclus: number;
  /** Couleur d'accent du palier. Reprise du jeu data-viz du Design System. */
  teinte: string;
  fond: string;
  texte: string;
  /** `false` marque une fonction absente du palier, barrée à l'affichage. */
  fonctions: Array<{ libelle: string; incluse: boolean }>;
}

/**
 * Le nombre de collaborateurs qu'un titulaire Illimité peut activer.
 *
 * Le déclencheur `collecteurs_valider_rattachement` porte la même valeur en dur
 * — la base ne lit pas le TypeScript. Les deux se déplacent ensemble ou pas du
 * tout, et le commentaire du déclencheur nomme cette constante pour que le
 * second point de modification se trouve.
 */
export const COLLABORATEURS_MAX = 3;

export const PALIERS: readonly DescriptionPalier[] = [
  {
    cle: 'essai',
    nom: 'Essai',
    accroche: 'Testez Kolek sans engagement',
    prix: 0,
    periode: '30 jours',
    limite: '20 clients',
    limiteClients: 20,
    collaborateursInclus: 0,
    teinte: '#AEB7D6',
    fond: '#F0F1F8',
    texte: '#5A6380',
    fonctions: [
      { libelle: '20 clients', incluse: true },
      { libelle: 'Encaissement hors ligne', incluse: true },
      { libelle: 'Rapports basiques', incluse: true },
      { libelle: 'Exports CSV', incluse: false },
      { libelle: 'Support prioritaire', incluse: false },
      { libelle: '3 collaborateurs', incluse: false },
      { libelle: 'Manager dédié', incluse: false },
    ],
  },
  {
    cle: 'standard',
    nom: 'Standard',
    accroche: 'Pour le collecteur qui installe sa tournée',
    prix: 2500,
    periode: 'mois',
    limite: '50 clients',
    limiteClients: 50,
    collaborateursInclus: 0,
    teinte: '#7FB6A6',
    fond: '#EDF5F3',
    texte: '#2E6557',
    fonctions: [
      { libelle: '50 clients', incluse: true },
      { libelle: 'Encaissement hors ligne', incluse: true },
      { libelle: 'Rapports avancés', incluse: true },
      { libelle: 'Exports CSV', incluse: false },
      { libelle: 'Support prioritaire', incluse: true },
      { libelle: '3 collaborateurs', incluse: false },
      { libelle: 'Manager dédié', incluse: false },
    ],
  },
  {
    cle: 'pro',
    nom: 'Pro',
    accroche: 'La solution complète pour les pros',
    prix: 5000,
    periode: 'mois',
    limite: '150 clients',
    limiteClients: 150,
    collaborateursInclus: 0,
    teinte: '#1C7A4B',
    fond: '#E6F3EC',
    texte: '#1C7A4B',
    fonctions: [
      { libelle: '150 clients', incluse: true },
      { libelle: 'Encaissement hors ligne', incluse: true },
      { libelle: 'Rapports avancés', incluse: true },
      { libelle: 'Exports CSV', incluse: true },
      { libelle: 'Support prioritaire', incluse: true },
      { libelle: '3 collaborateurs', incluse: false },
      { libelle: 'Manager dédié', incluse: false },
    ],
  },
  {
    cle: 'illimite',
    nom: 'Illimité',
    accroche: 'Puissance maximale, zéro limite',
    prix: 10000,
    periode: 'mois',
    limite: 'Clients illimités',
    limiteClients: null,
    collaborateursInclus: COLLABORATEURS_MAX,
    teinte: '#14402C',
    fond: '#E8F0EA',
    texte: '#14402C',
    fonctions: [
      { libelle: 'Clients illimités', incluse: true },
      { libelle: 'Encaissement hors ligne', incluse: true },
      { libelle: 'Rapports avancés', incluse: true },
      { libelle: 'Exports CSV', incluse: true },
      { libelle: 'Support dédié 24/7', incluse: true },
      { libelle: '3 collaborateurs', incluse: true },
      { libelle: 'Manager dédié', incluse: true },
    ],
  },
];

/** Le palier mis en avant sur la page de tarifs et pré-sélectionné au récapitulatif. */
export const PALIER_RECOMMANDE: Palier = 'pro';

export function palierParCle(cle: Palier): DescriptionPalier {
  const trouve = PALIERS.find((p) => p.cle === cle);
  if (!trouve) throw new RangeError(`Palier inconnu : ${cle}`);
  return trouve;
}

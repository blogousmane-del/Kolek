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
 * ATTENTION — ces montants viennent des maquettes Banani et **contredisent le
 * cahier des charges §5**, qui donne 0 / 2 500 / 5 000 / 10 000 FCFA avec des
 * limites exprimées en *clients* (20 / 50 / 150 / illimité).
 *
 * Ce n'est pas un écart de chiffres, ce sont deux modèles :
 *
 * - Cahier §5 : le client payant est **un collecteur**. Le raisonnement de prix
 *   y est explicite — « un collecteur de 100 clients à 1 000 FCFA de mise
 *   encaisse ~100 000 FCFA de commissions par cycle ». La base de données suit
 *   ce modèle : `collecteurs.palier`, en correspondance 1 pour 1 avec
 *   `auth.users`, sans notion d'organisation.
 * - Maquettes : le client payant est **une organisation** qui emploie plusieurs
 *   collecteurs, à un tarif quatre à cinq fois supérieur.
 *
 * Les montants ci-dessous sont ceux des maquettes, parce que c'est ce qui a été
 * demandé à l'écran. L'arbitrage reste à faire, et il se fait ici.
 */
export interface DescriptionPalier {
  cle: Palier;
  nom: string;
  accroche: string;
  /** En FCFA par mois. `0` pour l'essai — la période, elle, est dans `periode`. */
  prix: number;
  periode: string;
  limite: string;
  /** Couleur d'accent du palier. Reprise du jeu data-viz du Design System. */
  teinte: string;
  fond: string;
  texte: string;
  /** `false` marque une fonction absente du palier, barrée à l'affichage. */
  fonctions: Array<{ libelle: string; incluse: boolean }>;
}

export const PALIERS: readonly DescriptionPalier[] = [
  {
    cle: 'essai',
    nom: 'Essai',
    accroche: 'Testez Kolek sans engagement',
    prix: 0,
    periode: '30 jours',
    limite: '3 collecteurs',
    teinte: '#AEB7D6',
    fond: '#F0F1F8',
    texte: '#5A6380',
    fonctions: [
      { libelle: '3 collecteurs', incluse: true },
      { libelle: '100 clients', incluse: true },
      { libelle: 'Rapports basiques', incluse: true },
      { libelle: 'Accès API', incluse: false },
      { libelle: 'Support prioritaire', incluse: false },
      { libelle: 'Manager dédié', incluse: false },
    ],
  },
  {
    cle: 'standard',
    nom: 'Standard',
    accroche: 'Pour les équipes qui grandissent',
    prix: 9900,
    periode: 'mois',
    limite: '10 collecteurs',
    teinte: '#7FB6A6',
    fond: '#EDF5F3',
    texte: '#2E6557',
    fonctions: [
      { libelle: '10 collecteurs', incluse: true },
      { libelle: '500 clients', incluse: true },
      { libelle: 'Rapports avancés', incluse: true },
      { libelle: 'Accès API', incluse: false },
      { libelle: 'Support prioritaire', incluse: true },
      { libelle: 'Manager dédié', incluse: false },
    ],
  },
  {
    cle: 'pro',
    nom: 'Pro',
    accroche: 'La solution complète pour les pros',
    prix: 24900,
    periode: 'mois',
    limite: '50 collecteurs',
    teinte: '#1C7A4B',
    fond: '#E6F3EC',
    texte: '#1C7A4B',
    fonctions: [
      { libelle: '50 collecteurs', incluse: true },
      { libelle: '2 000 clients', incluse: true },
      { libelle: 'Rapports avancés', incluse: true },
      { libelle: 'API & exports CSV', incluse: true },
      { libelle: 'Support prioritaire', incluse: true },
      { libelle: 'Manager dédié', incluse: false },
    ],
  },
  {
    cle: 'illimite',
    nom: 'Illimité',
    accroche: 'Puissance maximale, zéro limite',
    prix: 49900,
    periode: 'mois',
    limite: 'Illimité',
    teinte: '#14402C',
    fond: '#E8F0EA',
    texte: '#14402C',
    fonctions: [
      { libelle: 'Collecteurs illimités', incluse: true },
      { libelle: 'Clients illimités', incluse: true },
      { libelle: 'Rapports avancés', incluse: true },
      { libelle: 'API complète', incluse: true },
      { libelle: 'Support dédié 24/7', incluse: true },
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

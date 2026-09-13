/**
 * Les formes du hors-ligne : ce que le téléphone garde, et ce qu'il envoie.
 *
 * Spec : `Docs/specs/2026-09-13-j2b-hors-ligne-design.md`, §5.1 et §6.1.
 *
 * ## Pourquoi une union et non `type` + `charge` séparés
 *
 * La spec décrit `type` et `charge` comme deux champs. Les lier dans une union
 * discriminée rend impossible, à la compilation, une opération `mise` qui
 * porterait la charge d'une caisse — donc un envoi qui écrirait dans la
 * mauvaise table. La forme stockée est exactement celle de la spec.
 *
 * ## Pourquoi `version`
 *
 * Une opération peut dormir des semaines sur un téléphone. La version suivante
 * de l'application doit savoir la relire : on ne change jamais la forme d'une
 * version publiée, on en ajoute une.
 */

export const VERSION_OPERATION = 1 as const;

/** À la cinquième tentative sans réponse reconnue, l'opération est consignée (§6.2). */
export const TENTATIVES_MAX = 5;

/**
 * Délai ajouté à la fin d'un sursis avant l'envoi.
 *
 * « Annuler » retire l'opération tant que l'heure est avant `envoyableApres` ;
 * le synchroniseur ne l'envoie qu'une seconde après. Les deux décisions lisent
 * la même horloge dans deux transactions distinctes : la seconde de marge
 * couvre un léger recul de l'horloge du téléphone entre les deux.
 */
export const MARGE_SURSIS_MS = 1000;

/** Au-delà, l'accueil prévient : le serveur refuse à 90 jours (§4.7). */
export const JOURS_ALERTE_ATTENTE = 75;

/** Les écarts entre deux essais (§5.3). */
export const DELAIS_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const;

/** L'attente après le n-ième échec consécutif. Au-delà du cinquième : 10 minutes. */
export function delaiApres(echecs: number): number {
  const rang = Math.min(Math.max(echecs, 1), DELAIS_MS.length) - 1;
  return DELAIS_MS[rang]!;
}

export type TypeOperation = 'mise' | 'client_carte' | 'carte' | 'caisse';
export type EtatOperation = 'en_attente' | 'refusee_a_consigner';

/** Les charges portent exactement les colonnes que l'écriture d'aujourd'hui envoie. */
export interface ChargeMise {
  id: string;
  carteId: string;
  montant: number;
  encaisseLe: string;
}

export interface ChargeClientCarte {
  client: {
    id: string;
    nom: string;
    telephone: string | null;
    marche: string | null;
    activite: string | null;
    avisActifs: boolean;
  };
  carte: { id: string; mise: number };
}

export interface ChargeCarte {
  id: string;
  clientId: string;
  mise: number;
}

export interface ChargeCaisse {
  id: string;
  date: string;
  cashDeclare: number;
}

export interface OperationCommune {
  version: typeof VERSION_OPERATION;
  /** Identifiant de l'opération. Devient l'identifiant de la ligne de refus. */
  id: string;
  /** Ordre d'entrée dans la file, strictement croissant. */
  sequence: number;
  collecteurId: string;
  /** Heure du geste, horloge du téléphone. */
  faiteLe: string;
  /** Avant cette heure, l'opération ne part pas et peut être annulée. */
  envoyableApres: string;
  /** Opérations dont celle-ci dépend : la carte d'une mise, le client d'une carte. */
  dependDe: string[];
  etat: EtatOperation;
  tentatives: number;
  prochainEssai: string | null;
  /** Code du refus, une fois connu. */
  motif?: string;
}

export type OperationMise = OperationCommune & { type: 'mise'; charge: ChargeMise };
export type OperationClientCarte = OperationCommune & {
  type: 'client_carte';
  charge: ChargeClientCarte;
  /** Étapes déjà acceptées par le serveur : un rejeu reprend là où il s'était arrêté. */
  etapes: { client: boolean; carte: boolean };
};
export type OperationCarte = OperationCommune & { type: 'carte'; charge: ChargeCarte };
export type OperationCaisse = OperationCommune & { type: 'caisse'; charge: ChargeCaisse };
export type Operation = OperationMise | OperationClientCarte | OperationCarte | OperationCaisse;

export interface ClientLocal {
  id: string;
  nom: string;
  telephone: string | null;
  marche: string | null;
  activite: string | null;
  avisActifs: boolean;
}

export interface CarteLocale {
  id: string;
  clientId: string;
  mise: number;
  statut: 'active' | 'cloturee';
  misesEncaissees: number;
  ouverteLe: string;
  clotureeLe: string | null;
}

export interface MiseLocale {
  id: string;
  carteId: string;
  montant: number;
  encaisseLe: string;
  /** Posé par le serveur ; provisoire tant que la mise n'est pas relue. */
  estCommission: boolean;
}

export interface RetraitLocal {
  id: string;
  carteId: string;
  montantRestitue: number;
  effectueLe: string;
}

export interface CaisseLocale {
  id: string;
  date: string;
  /** `null` tant que le serveur n'a pas calculé cette ligne. */
  cashAttendu: number | null;
  cashDeclare: number;
  ecart: number | null;
}

/**
 * La tournée : ce que le collecteur doit pouvoir consulter sans réseau.
 *
 * Bornée par construction (§5.1) : les cartes, les mises des cartes actives et
 * celles du jour, les retraits et les caisses du jour.
 */
export interface Tournee {
  clients: ClientLocal[];
  cartes: CarteLocale[];
  mises: MiseLocale[];
  retraits: RetraitLocal[];
  caisses: CaisseLocale[];
  /** Heure du dernier rafraîchissement réussi. `null` : jamais chargée sur ce téléphone. */
  lueLe: string | null;
}

export function tourneeVide(): Tournee {
  return { clients: [], cartes: [], mises: [], retraits: [], caisses: [], lueLe: null };
}

export interface ProfilLocal {
  nom: string;
  telephone: string;
  zone: string | null;
  palier: string;
  abonnementStatut: string;
  abonnementEcheance: string | null;
  titulaireId: string | null;
  lueLe: string;
}

/** Ce qui part dans `synchro_rejets.charge_utile` (§6.5). */
export interface ChargeUtileRefus {
  version: typeof VERSION_OPERATION;
  type: TypeOperation;
  charge: Operation['charge'];
  faiteLe: string;
  sequence: number;
  dependDe: string[];
  etapes?: { client: boolean; carte: boolean };
}

/** La copie locale d'un refus consigné. Une vue : la vérité est `synchro_rejets`. */
export interface RefusLocal {
  id: string;
  motif: string;
  chargeUtile: ChargeUtileRefus;
  creeLe: string;
}

export function chargeUtileDe(op: Operation): ChargeUtileRefus {
  const charge: ChargeUtileRefus = {
    version: op.version,
    type: op.type,
    charge: op.charge,
    faiteLe: op.faiteLe,
    sequence: op.sequence,
    dependDe: op.dependDe,
  };
  // L'avancement d'une inscription dit au rattrapage si le client est déjà au
  // serveur sans sa carte. Le perdre obligerait à le déduire en fouillant.
  return op.type === 'client_carte' ? { ...charge, etapes: op.etapes } : charge;
}

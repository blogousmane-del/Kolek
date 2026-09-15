/**
 * Des opérations et des tournées de poche, pour les épreuves. Aucun module de
 * l'application ne l'importe — même statut que `postgrest-factice.ts`.
 *
 * Chaque fabrique rend une valeur complète et valide, qu'une épreuve modifie
 * sur le seul point qu'elle mesure.
 */

import {
  VERSION_OPERATION,
  tourneeVide,
  type CaisseLocale,
  type CarteLocale,
  type ChargeMise,
  type ClientLocal,
  type OperationCaisse,
  type OperationCarte,
  type OperationClientCarte,
  type OperationCommune,
  type OperationMise,
  type Tournee,
} from './modele';

export const COLLECTEUR = 'col-1';
export const INSTANT = '2026-09-13T09:00:00.000Z';

function commun(sequence: number): OperationCommune {
  return {
    version: VERSION_OPERATION,
    id: `op-${sequence}`,
    sequence,
    collecteurId: COLLECTEUR,
    faiteLe: INSTANT,
    envoyableApres: INSTANT,
    dependDe: [],
    etat: 'en_attente',
    tentatives: 0,
    prochainEssai: null,
  };
}

export function operationMise(
  sequence: number,
  charge: Partial<ChargeMise> & { carteId: string },
  reste: Partial<OperationCommune> = {},
): OperationMise {
  return {
    ...commun(sequence),
    ...reste,
    type: 'mise',
    charge: { id: `mise-${sequence}`, montant: 1000, encaisseLe: INSTANT, ...charge },
  };
}

export function operationClientCarte(
  sequence: number,
  saisie: { clientId: string; carteId: string; nom?: string; mise?: number },
  reste: Partial<OperationCommune> & { etapes?: OperationClientCarte['etapes'] } = {},
): OperationClientCarte {
  const { etapes = { client: false, carte: false }, ...autres } = reste;
  return {
    ...commun(sequence),
    ...autres,
    type: 'client_carte',
    charge: {
      client: {
        id: saisie.clientId,
        nom: saisie.nom ?? 'Awa',
        telephone: null,
        marche: null,
        activite: null,
        avisActifs: false,
      },
      carte: { id: saisie.carteId, mise: saisie.mise ?? 1000 },
    },
    etapes,
  };
}

export function operationCarte(
  sequence: number,
  saisie: { carteId: string; clientId: string; mise?: number },
  reste: Partial<OperationCommune> = {},
): OperationCarte {
  return {
    ...commun(sequence),
    ...reste,
    type: 'carte',
    charge: { id: saisie.carteId, clientId: saisie.clientId, mise: saisie.mise ?? 1000 },
  };
}

export function operationCaisse(
  sequence: number,
  saisie: { cashDeclare: number; id?: string; date?: string },
  reste: Partial<OperationCommune> = {},
): OperationCaisse {
  return {
    ...commun(sequence),
    ...reste,
    type: 'caisse',
    charge: {
      id: saisie.id ?? 'caisse-1',
      date: saisie.date ?? INSTANT.slice(0, 10),
      cashDeclare: saisie.cashDeclare,
    },
  };
}

export function client(id: string, nom = 'Awa'): ClientLocal {
  return { id, nom, telephone: null, marche: null, activite: null, avisActifs: false };
}

export function carte(id: string, clientId: string, reste: Partial<CarteLocale> = {}): CarteLocale {
  return {
    id,
    clientId,
    mise: 1000,
    statut: 'active',
    misesEncaissees: 0,
    ouverteLe: INSTANT,
    clotureeLe: null,
    ...reste,
  };
}

export function caisse(reste: Partial<CaisseLocale> & { cashDeclare: number }): CaisseLocale {
  return { id: 'caisse-serveur', date: INSTANT.slice(0, 10), cashAttendu: 0, ecart: 0, ...reste };
}

export function tournee(reste: Partial<Tournee> = {}): Tournee {
  return { ...tourneeVide(), lueLe: INSTANT, ...reste };
}

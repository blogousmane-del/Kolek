import { CAISSE_MAX, MISES_PAR_CYCLE, validerCaisse, validerMise } from '@kolek/core';

import { phraseEcriture, type EchecEcriture } from '../phrases';
import type { Construction } from './file';
import {
  VERSION_OPERATION,
  type Operation,
  type OperationCaisse,
  type OperationCarte,
  type OperationClientCarte,
  type OperationCommune,
  type OperationMise,
} from './modele';

/**
 * Ce que le téléphone vérifie avant d'accepter un geste, et l'opération qu'il en
 * tire (spec §7).
 *
 * Fonctions pures, appelées par `ajouter` dans la transaction qui écrit : elles
 * voient la tournée exactement telle que l'écran la montre, file comprise.
 *
 * Les vérifications reprennent celles du serveur qu'on peut tenir sans lui.
 * Chacune évite un refus qui tomberait plus tard, loin des yeux du collecteur,
 * sur une opération déjà montrée comme faite.
 */

/** `20260819010000_socle_bornes_texte.sql`, lignes 41 à 44. */
export const BORNES_CLIENT = { nom: 120, telephone: 32, marche: 80, activite: 80 } as const;

export interface ContexteGeste {
  collecteurId: string;
  maintenant: number;
  /** Le sursis de la fiche client : 6 000. Absent pour un envoi immédiat. */
  sursisMs?: number;
}

export interface ContexteInscription extends ContexteGeste {
  /** Le dernier `abonnement_statut` connu. `null` : jamais lu sur ce téléphone. */
  abonnementStatut: string | null;
}

export interface SaisieClient {
  nom: string;
  telephone?: string;
  marche?: string;
  activite?: string;
  mise: number;
  /** Faux par défaut : laisser un numéro n'est pas consentir à être notifié. */
  avisActifs?: boolean;
}

function refus(code: string): { ok: false; echec: EchecEcriture } {
  return { ok: false, echec: phraseEcriture(code) };
}

function commun(ctx: ContexteGeste, sequence: number, dependDe: string[]): OperationCommune {
  return {
    version: VERSION_OPERATION,
    id: crypto.randomUUID(),
    sequence,
    collecteurId: ctx.collecteurId,
    faiteLe: new Date(ctx.maintenant).toISOString(),
    envoyableApres: new Date(ctx.maintenant + (ctx.sursisMs ?? 0)).toISOString(),
    dependDe,
    etat: 'en_attente',
    tentatives: 0,
    prochainEssai: null,
  };
}

/** L'opération encore en file qui crée cette carte, s'il y en a une. */
function createurDeCarte(operations: readonly Operation[], carteId: string): string[] {
  const createur = operations.find(
    (o) =>
      o.etat === 'en_attente' &&
      ((o.type === 'client_carte' && o.charge.carte.id === carteId) ||
        (o.type === 'carte' && o.charge.id === carteId)),
  );
  return createur ? [createur.id] : [];
}

/** L'inscription encore en file qui crée ce client, s'il y en a une. */
function createurDeClient(operations: readonly Operation[], clientId: string): string[] {
  const createur = operations.find(
    (o) => o.etat === 'en_attente' && o.type === 'client_carte' && o.charge.client.id === clientId,
  );
  return createur ? [createur.id] : [];
}

/** L'abonnement ferme l'ajout de client et l'ouverture de carte, jamais l'encaissement (§7). */
function abonnementFerme(ctx: ContexteInscription): boolean {
  return ctx.abonnementStatut !== null && ctx.abonnementStatut !== 'actif';
}

export function construireMise(
  ctx: ContexteGeste,
  saisie: { carteId: string; montant: number; encaisseLe: Date },
): Construction<OperationMise> {
  return (tournee, operations, sequence) => {
    if (!validerMise(saisie.montant)) return refus('MISE_HORS_BORNES');
    const carte = tournee.cartes.find((c) => c.id === saisie.carteId);
    if (!carte) return refus('CARTE_ABSENTE');
    if (carte.statut !== 'active') return refus('CARTE_CLOTUREE');
    if (carte.misesEncaissees >= MISES_PAR_CYCLE) return refus('CYCLE_COMPLET');
    if (carte.mise !== saisie.montant) return refus('MONTANT_INVALIDE');

    return {
      ok: true,
      operation: {
        ...commun(ctx, sequence, createurDeCarte(operations, carte.id)),
        type: 'mise',
        charge: {
          id: crypto.randomUUID(),
          carteId: carte.id,
          montant: saisie.montant,
          encaisseLe: saisie.encaisseLe.toISOString(),
        },
      },
    };
  };
}

export function construireClientCarte(
  ctx: ContexteInscription,
  saisie: SaisieClient,
): Construction<OperationClientCarte> {
  return (_tournee, _operations, sequence) => {
    const nom = saisie.nom.trim();
    if (!nom) return refus('NOM_VIDE');
    if (!validerMise(saisie.mise)) return refus('MISE_HORS_BORNES');

    // `|| null` : le journal d'audit doit lire « le champ était vide ».
    const telephone = saisie.telephone?.trim() || null;
    const marche = saisie.marche?.trim() || null;
    const activite = saisie.activite?.trim() || null;

    // Les bornes du serveur, pour qu'aucun refus `BORNE` ne tombe sur un client
    // déjà montré dans la tournée (§7).
    if (
      nom.length > BORNES_CLIENT.nom ||
      (telephone?.length ?? 0) > BORNES_CLIENT.telephone ||
      (marche?.length ?? 0) > BORNES_CLIENT.marche ||
      (activite?.length ?? 0) > BORNES_CLIENT.activite
    ) {
      return refus('BORNE');
    }
    if (abonnementFerme(ctx)) return refus('ABONNEMENT_INACTIF');

    return {
      ok: true,
      operation: {
        ...commun(ctx, sequence, []),
        type: 'client_carte',
        charge: {
          client: {
            id: crypto.randomUUID(),
            nom,
            telephone,
            marche,
            activite,
            // Sans numéro, le consentement n'a pas d'objet.
            avisActifs: Boolean(saisie.avisActifs) && telephone !== null,
          },
          carte: { id: crypto.randomUUID(), mise: saisie.mise },
        },
        etapes: { client: false, carte: false },
      },
    };
  };
}

export function construireCarte(
  ctx: ContexteInscription,
  saisie: { clientId: string; mise: number },
): Construction<OperationCarte> {
  return (tournee, operations, sequence) => {
    if (!validerMise(saisie.mise)) return refus('MISE_HORS_BORNES');
    if (!tournee.clients.some((c) => c.id === saisie.clientId)) return refus('CLIENT_INTROUVABLE');
    if (abonnementFerme(ctx)) return refus('ABONNEMENT_INACTIF');

    return {
      ok: true,
      operation: {
        ...commun(ctx, sequence, createurDeClient(operations, saisie.clientId)),
        type: 'carte',
        charge: { id: crypto.randomUUID(), clientId: saisie.clientId, mise: saisie.mise },
      },
    };
  };
}

export function construireCaisse(
  ctx: ContexteGeste,
  saisie: { date: string; montant: number },
): Construction<OperationCaisse> {
  return (tournee, _operations, sequence) => {
    // `validerCaisse` porte les trois conditions ; les deux motifs restent
    // distincts parce que les deux phrases le sont. « Le montant déclaré doit
    // être un nombre positif » enverrait un collecteur qui a tapé onze
    // chiffres vérifier un signe qui est déjà juste.
    if (!validerCaisse(saisie.montant)) {
      return refus(saisie.montant > CAISSE_MAX ? 'MONTANT_TROP_GRAND' : 'CAISSE_INVALIDE');
    }

    // Tirée à la première déclaration du jour, réutilisée ensuite (§6.4). La
    // tournée montrée porte déjà la ligne du serveur ou une déclaration en file.
    const id = tournee.caisses.find((c) => c.date === saisie.date)?.id ?? crypto.randomUUID();

    return {
      ok: true,
      operation: {
        ...commun(ctx, sequence, []),
        type: 'caisse',
        charge: { id, date: saisie.date, cashDeclare: saisie.montant },
      },
    };
  };
}

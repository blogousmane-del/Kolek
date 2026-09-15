import { soldeRestituable } from '@kolek/core';

import type { TableauCollecteur } from '../lectures';
import type { FicheClient, Profil, Rapprochement } from '../lectures-ecrans';
import type { Operation, ProfilLocal, Tournee } from './modele';

/**
 * Ce que les écrans de collecte lisent, calculé sur la tournée du téléphone.
 *
 * Spec J2b §5.4 : en ligne comme hors ligne, un seul chemin. Chaque vue rend
 * exactement la forme de la lecture réseau qu'elle remplace, pour que les
 * écrans ne changent pas de forme en changeant de source.
 *
 * Fonctions pures : la tournée arrive déjà réappliquée (`lireTournee`), et
 * l'heure est un paramètre.
 */

/**
 * La tournée n'a jamais été chargée sur ce téléphone.
 *
 * Levée plutôt qu'une liste vide : « aucun client » dit à un collecteur qui en
 * a quarante que son carnet a disparu. La vérité est qu'il n'est pas encore là.
 */
export class TourneeAbsente extends Error {
  constructor() {
    super('Ta tournée n’est pas encore sur ce téléphone. Connecte-toi une fois au réseau pour la charger.');
    this.name = 'TourneeAbsente';
  }
}

/** Un ordre total, qui ne dépend ni de la langue ni du moteur de tri. */
function parId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Le plus récent d'abord. Par valeur d'horloge, pas par texte : le serveur écrit `+00:00`, le téléphone `Z`. */
function plusRecentDabord(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}

export function tableauDepuis(t: Tournee, maintenant: number): TableauCollecteur {
  const noms = new Map(t.clients.map((c) => [c.id, c.nom]));
  const cartes = new Map(t.cartes.map((k) => [k.id, k]));

  // Minuit local, pas UTC : « aujourd'hui » est la journée du collecteur, à Abidjan.
  const minuit = new Date(maintenant);
  minuit.setHours(0, 0, 0, 0);
  const encaisseAujourdhui = t.mises
    .filter((m) => Date.parse(m.encaisseLe) >= minuit.getTime())
    .reduce((somme, m) => somme + m.montant, 0);

  const actives = t.cartes.filter((k) => k.statut === 'active');
  // La plus avancée : c'est celle dont le cycle se termine en premier.
  const plusAvancee = [...actives].sort(
    (a, b) => b.misesEncaissees - a.misesEncaissees || parId(a, b),
  )[0];

  return {
    clients: t.clients.length,
    cartesActives: actives.length,
    encaisseAujourdhui,
    encoursTotal: actives.reduce((somme, k) => somme + soldeRestituable(k.misesEncaissees, k.mise), 0),
    carteDuJour: plusAvancee
      ? {
          carteId: plusAvancee.id,
          clientId: plusAvancee.clientId,
          nom: noms.get(plusAvancee.clientId) ?? 'Client',
          mise: plusAvancee.mise,
          misesEncaissees: plusAvancee.misesEncaissees,
          solde: soldeRestituable(plusAvancee.misesEncaissees, plusAvancee.mise),
        }
      : null,
    dernieres: [...t.mises]
      .sort((a, b) => plusRecentDabord(a.encaisseLe, b.encaisseLe) || parId(a, b))
      .slice(0, 5)
      .map((m) => {
        const carte = cartes.get(m.carteId);
        return {
          nom: (carte && noms.get(carte.clientId)) ?? 'Client',
          montant: m.montant,
          estCommission: m.estCommission,
          quand: m.encaisseLe,
        };
      }),
  };
}

/** Un client de la liste, sous les noms de colonnes que `Clients.tsx` lisait du serveur. */
export interface ClientListe {
  id: string;
  nom: string;
  marche: string | null;
  telephone: string | null;
  avis_actifs: boolean;
}

export interface CarteListe {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
  ouverte_le: string;
}

export interface ListeClients {
  clients: ClientListe[];
  cartes: CarteListe[];
}

export function listeDepuis(t: Tournee): ListeClients {
  return {
    // « Émile » entre « awa » et « Zoé » : l'ordre d'un carnet, pas celui des octets.
    clients: [...t.clients]
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || parId(a, b))
      .map((c) => ({
        id: c.id,
        nom: c.nom,
        marche: c.marche,
        telephone: c.telephone,
        avis_actifs: c.avisActifs,
      })),
    cartes: [...t.cartes].sort(parId).map((k) => ({
      id: k.id,
      client_id: k.clientId,
      mise: k.mise,
      statut: k.statut,
      mises_encaissees: k.misesEncaissees,
      ouverte_le: k.ouverteLe,
    })),
  };
}

/** Les versements montrés sur la fiche : la borne de la lecture réseau qu'elle remplace. */
export const MISES_SUR_FICHE = 40;

export function ficheDepuis(t: Tournee, clientId: string): FicheClient | null {
  const client = t.clients.find((c) => c.id === clientId);
  if (!client) return null;

  // L'ordre d'ouverture décroissant : `FicheClient.tsx` en tire le numéro de cycle.
  const cartes = t.cartes
    .filter((k) => k.clientId === clientId)
    .sort((a, b) => plusRecentDabord(a.ouverteLe, b.ouverteLe) || parId(a, b));
  const siennes = new Set(cartes.map((k) => k.id));

  return {
    id: client.id,
    nom: client.nom,
    telephone: client.telephone,
    marche: client.marche,
    activite: client.activite,
    avisActifs: client.avisActifs,
    cartes: cartes.map((k) => ({
      id: k.id,
      mise: k.mise,
      statut: k.statut,
      misesEncaissees: k.misesEncaissees,
      ouverteLe: k.ouverteLe,
      clotureeLe: k.clotureeLe,
    })),
    // Les mises des cartes actives et celles du jour (§5.1). L'historique
    // complet d'une carte clôturée reste un écran en ligne.
    mises: t.mises
      .filter((m) => siennes.has(m.carteId))
      .sort((a, b) => plusRecentDabord(a.encaisseLe, b.encaisseLe) || parId(a, b))
      .slice(0, MISES_SUR_FICHE)
      .map((m) => ({
        id: m.id,
        montant: m.montant,
        encaisseLe: m.encaisseLe,
        estCommission: m.estCommission,
      })),
  };
}

export function profilDepuis(p: ProfilLocal | null, t: Tournee): Profil {
  // Jamais lu sur ce téléphone : mieux vaut « indisponible » qu'un palier ou un
  // statut d'abonnement inventés, qui décident de ce que l'écran permet.
  if (!p) throw new TourneeAbsente();
  return {
    nom: p.nom,
    telephone: p.telephone,
    zone: p.zone,
    palier: p.palier,
    abonnementStatut: p.abonnementStatut,
    abonnementEcheance: p.abonnementEcheance,
    titulaireId: p.titulaireId,
    clients: t.clients.length,
    cartesActives: t.cartes.filter((k) => k.statut === 'active').length,
  };
}

/**
 * La caisse du jour (spec J2b §5.4, §6.4).
 *
 * **Le jour du serveur, en UTC.** `cash_attendu_du_jour` découpe la journée sur
 * `(encaisse_le at time zone 'UTC')::date`, explicitement. Même découpage ici,
 * sans quoi le collecteur déclarerait son cash pour une journée que le serveur
 * calcule autrement, et l'écart apparaîtrait sans cause visible. Abidjan est à
 * UTC+0 toute l'année : cela ne change rien aujourd'hui, par géographie et non
 * par intention.
 *
 * **Provisoire** tant que le téléphone sait quelque chose que le serveur n'a
 * pas encore compté — une mise ou une déclaration du jour en file — ou que la
 * tournée n'a pas été relue aujourd'hui. L'attendu est alors recalculé avec les
 * termes du serveur : les mises du jour, moins les restitutions du jour (depuis
 * le 2026-08-25).
 */
export function rapprochementDepuis(
  t: Tournee,
  operations: readonly Operation[],
  maintenant: number,
): Rapprochement {
  const date = new Date(maintenant).toISOString().slice(0, 10);
  const duJour = (iso: string) => new Date(iso).toISOString().slice(0, 10) === date;

  const enAttente = operations.some(
    (o) =>
      o.etat === 'en_attente' &&
      ((o.type === 'mise' && duJour(o.charge.encaisseLe)) ||
        (o.type === 'caisse' && o.charge.date === date)),
  );
  const relueAujourdhui = t.lueLe !== null && duJour(t.lueLe);
  const ligne = t.caisses.find((c) => c.date === date) ?? null;

  if (ligne && ligne.cashAttendu !== null && ligne.ecart !== null && !enAttente && relueAujourdhui) {
    return {
      date,
      cashAttendu: ligne.cashAttendu,
      cashDeclare: ligne.cashDeclare,
      ecart: ligne.ecart,
      provisoire: false,
    };
  }

  const encaisse = t.mises.filter((m) => duJour(m.encaisseLe)).reduce((s, m) => s + m.montant, 0);
  const restitue = t.retraits
    .filter((r) => duJour(r.effectueLe))
    .reduce((s, r) => s + r.montantRestitue, 0);
  const cashAttendu = encaisse - restitue;
  const cashDeclare = ligne?.cashDeclare ?? null;

  return {
    date,
    cashAttendu,
    cashDeclare,
    ecart: cashDeclare === null ? null : cashDeclare - cashAttendu,
    provisoire: ligne !== null || enAttente || !relueAujourdhui,
  };
}

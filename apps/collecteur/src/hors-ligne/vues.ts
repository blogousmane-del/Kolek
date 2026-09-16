import { argentTenu, formatMontant, mouvementsDepuis, soldeRestituable, versementsDe } from '@kolek/core';

import type { TableauCollecteur } from '../lectures';
import type { FicheClient, Profil, Rapprochement } from '../lectures-ecrans';
import { phraseRefus } from '../phrases';
import {
  JOURS_ALERTE_ATTENTE,
  chargeUtileDe,
  type Operation,
  type ProfilLocal,
  type RefusLocal,
  type Tournee,
  type TypeOperation,
} from './modele';

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

/**
 * Le registre de la tournée : la règle de la vue `mouvements`, appliquée aux
 * lignes brutes du téléphone.
 *
 * La tournée ne porte aucun rattrapage aujourd'hui — le geste qui en crée
 * appartient au chantier suivant, et le rechargement ne les copie pas encore.
 * La liste vide est donc exacte, et c'est le seul endroit à changer le jour où
 * elle ne le sera plus.
 */
function registreDe(t: Tournee) {
  return mouvementsDepuis({ mises: t.mises, retraits: t.retraits, rattrapages: [] });
}

export function tableauDepuis(t: Tournee, maintenant: number): TableauCollecteur {
  const noms = new Map(t.clients.map((c) => [c.id, c.nom]));
  const cartes = new Map(t.cartes.map((k) => [k.id, k]));

  // Minuit local, pas UTC : « aujourd'hui » est la journée du collecteur, à Abidjan.
  const minuit = new Date(maintenant);
  minuit.setHours(0, 0, 0, 0);
  const versements = versementsDe(registreDe(t));
  const encaisseAujourdhui = versements
    .filter((m) => Date.parse(m.survenuLe) >= minuit.getTime())
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
    dernieres: [...versements]
      .sort((a, b) => plusRecentDabord(a.survenuLe, b.survenuLe) || parId(a, b))
      .slice(0, 5)
      .map((m) => {
        const carte = cartes.get(m.carteId);
        return {
          nom: (carte && noms.get(carte.clientId)) ?? 'Client',
          montant: m.montant,
          estCommission: m.estCommission,
          quand: m.survenuLe,
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
    mises: versementsDe(registreDe(t))
      .filter((m) => siennes.has(m.carteId))
      .sort((a, b) => plusRecentDabord(a.survenuLe, b.survenuLe) || parId(a, b))
      .slice(0, MISES_SUR_FICHE)
      .map((m) => ({
        id: m.id,
        montant: m.montant,
        encaisseLe: m.survenuLe,
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
 * **Les chiffres du serveur** tant que rien n'a changé depuis la lecture du
 * jour : ligne relue aujourd'hui, écart gardé, rien du jour en file.
 *
 * **Provisoire** dans tous les autres cas. L'attendu vient alors :
 * - **de la ligne du serveur, quand elle existe.** Elle seule compte l'argent
 *   pris ou rendu sur la carte d'un coéquipier, que cette tournée ne contient
 *   pas. `appliquer` y porte les mises faites depuis la lecture ; un geste en
 *   ligne qui la change sans la tournée en efface l'écart (`ecritures-ecrans`) ;
 * - **sinon, d'un recompte** avec les termes du serveur : les mises du jour
 *   moins les restitutions du jour (depuis le 2026-08-25), passées par **cette
 *   main** — `encaisse_par` et `restitue_par`, pas le propriétaire de la carte.
 *   Sans ligne, le téléphone ne peut pas savoir ce qu'un titulaire a encaissé
 *   pour autrui : le chiffre ne se dit donc jamais celui du serveur.
 */
export function rapprochementDepuis(
  t: Tournee,
  operations: readonly Operation[],
  maintenant: number,
  collecteurId: string,
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

  const cashAttendu = ligne?.cashAttendu ?? recompterAttendu(t, collecteurId, duJour);
  const cashDeclare = ligne?.cashDeclare ?? null;

  return {
    date,
    cashAttendu,
    cashDeclare,
    ecart: cashDeclare === null ? null : cashDeclare - cashAttendu,
    provisoire: true,
  };
}

/** Ce qui est passé par cette main aujourd'hui : entrées moins sorties. */
function recompterAttendu(t: Tournee, collecteurId: string, duJour: (iso: string) => boolean): number {
  return argentTenu(
    registreDe(t).filter((m) => m.mainId === collecteurId && duJour(m.survenuLe)),
  );
}

/**
 * Ce que la file contient, pour le bandeau, l'accueil et les alertes.
 *
 * Les quatre comptes par nature portent **toute** la file, en attente comme
 * refusée à consigner : c'est ce qui n'a pas quitté le téléphone, donc ce que
 * la déconnexion attend (§7) et ce que le bandeau doit annoncer. Sans cela, le
 * bandeau dirait « rien en attente » à un collecteur à qui la déconnexion est
 * refusée.
 */
export interface EtatFile {
  mises: number;
  clients: number;
  cartes: number;
  caisses: number;
  /** Encore à envoyer. */
  enAttente: number;
  /** Refusées par le serveur, refus pas encore écrit dans `synchro_rejets`. */
  aConsigner: number;
  /** Les refus à montrer : ceux déjà consignés, et ceux à consigner. */
  refusees: number;
  /** Le plus ancien geste en attente : c'est lui que la fenêtre de 90 jours menace (§4.7). */
  plusAncienne: string | null;
  plusAncienneType: TypeOperation | null;
}

export function etatFileDepuis(
  operations: readonly Operation[],
  refus: readonly RefusLocal[],
): EtatFile {
  const par = (type: TypeOperation) => operations.filter((o) => o.type === type).length;
  const enAttente = operations.filter((o) => o.etat === 'en_attente');
  const aConsigner = operations.length - enAttente.length;
  const ancienne =
    [...enAttente].sort(
      (a, b) => Date.parse(a.faiteLe) - Date.parse(b.faiteLe) || a.sequence - b.sequence,
    )[0] ?? null;

  return {
    mises: par('mise'),
    clients: par('client_carte'),
    cartes: par('carte'),
    caisses: par('caisse'),
    enAttente: enAttente.length,
    aConsigner,
    refusees: refus.length + aConsigner,
    plusAncienne: ancienne?.faiteLe ?? null,
    plusAncienneType: ancienne?.type ?? null,
  };
}

/** Les clients, cartes et mises qui n'ont pas encore quitté le téléphone — « pas encore envoyé » (§8.3). */
export function identifiantsEnAttente(operations: readonly Operation[]): Set<string> {
  const ids = new Set<string>();
  for (const o of operations) {
    switch (o.type) {
      case 'mise':
        ids.add(o.charge.id);
        break;
      case 'client_carte':
        ids.add(o.charge.client.id);
        ids.add(o.charge.carte.id);
        break;
      case 'carte':
        ids.add(o.charge.id);
        break;
      case 'caisse':
        break;
    }
  }
  return ids;
}

/** Ce qui, sur une carte, n'a pas encore quitté le téléphone. */
export interface AttenteCarte {
  mises: number;
  /** La carte elle-même est encore en file — ouverte seule, ou avec son client. */
  creation: boolean;
}

export function enAttenteSurCarte(operations: readonly Operation[], carteId: string): AttenteCarte {
  let mises = 0;
  let creation = false;
  for (const o of operations) {
    // Un refus à consigner a été envoyé, et refusé : il ne partira jamais, et la
    // tournée ne le compte pas. Il se montre dans les alertes ; il n'attend rien.
    if (o.etat !== 'en_attente') continue;
    if (o.type === 'mise' && o.charge.carteId === carteId) mises += 1;
    if (
      (o.type === 'carte' && o.charge.id === carteId) ||
      (o.type === 'client_carte' && o.charge.carte.id === carteId)
    ) {
      creation = true;
    }
  }
  return { mises, creation };
}

/**
 * Pourquoi le retrait de cette carte attend, ou `null` (spec J2b §7).
 *
 * La clôture recalcule au serveur ce qui est rendu, depuis les mises qu'il a
 * reçues. Tant qu'une opération de la carte est sur le téléphone, ce calcul en
 * manquerait une : le client repartirait avec moins que son dû, ou la clôture
 * tomberait sur une mise encore en route (`CARTE_CLOTUREE`).
 */
export function phraseAttenteCarte(attente: AttenteCarte): string | null {
  if (attente.creation) return 'Cette carte n’est pas encore envoyée.';
  if (attente.mises === 0) return null;
  const s = attente.mises > 1 ? 's' : '';
  return `${attente.mises} mise${s} de cette carte pas encore envoyée${s}.`;
}

/** Un refus, tel que l'écran des alertes le montre (spec J2b §8.4). */
export interface RefusAffiche {
  /** L'identifiant de l'opération, qui est aussi celui de la ligne de `synchro_rejets`. */
  id: string;
  /** Qui et combien : « Awa — mise de 1 000 FCFA ». */
  titre: string;
  /** Le motif, en clair et au passé. */
  detail: string;
  /** L'heure réelle du geste ; `null` quand la charge ne la porte pas. */
  quand: string | null;
}

type Brut = Record<string, unknown>;

function objet(valeur: unknown): Brut | null {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Brut)
    : null;
}

function champ(o: Brut | null, cle: string): Brut | null {
  return objet(o?.[cle]);
}

function texte(o: Brut | null, cle: string): string | null {
  const valeur = o?.[cle];
  return typeof valeur === 'string' && valeur !== '' ? valeur : null;
}

function nombre(o: Brut | null, cle: string): number | null {
  const valeur = o?.[cle];
  return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
}

/**
 * Les refus à montrer, du geste le plus récent au plus ancien.
 *
 * Deux sources, toutes deux lisibles sans réseau : la copie des refus consignés,
 * et les opérations refusées dont la consignation n'est pas encore faite. Une
 * opération présente des deux côtés — consignée, pas encore retirée de la file —
 * n'est montrée qu'une fois : deux lignes feraient croire à deux gestes.
 *
 * Une charge consignée est lue sans lui faire confiance. Elle a pu être écrite
 * par une autre version de l'application, il y a des semaines : un champ absent
 * ou d'un autre type ne fait pas tomber l'écran, le titre se replie sur ce
 * qu'on sait lire, jusqu'à « Opération refusée ».
 *
 * Le nom du client vient de la tournée, puis des charges d'inscription et
 * d'ouverture de carte de toute la file : un client refusé n'est jamais entré
 * dans la tournée, ni la carte de la mise qui dépendait de lui.
 */
export function refusAffichables(
  refus: readonly RefusLocal[],
  operations: readonly Operation[],
  tournee: Tournee | null,
): RefusAffiche[] {
  const vus = new Set<string>();
  const sources: { id: string; motif: string; charge: Brut | null }[] = [];
  for (const r of refus) {
    if (vus.has(r.id)) continue;
    vus.add(r.id);
    sources.push({ id: r.id, motif: r.motif, charge: objet(r.chargeUtile) });
  }
  for (const o of operations) {
    if (o.etat !== 'refusee_a_consigner' || vus.has(o.id)) continue;
    vus.add(o.id);
    sources.push({ id: o.id, motif: o.motif ?? 'INCONNU', charge: objet(chargeUtileDe(o)) });
  }

  const noms = new Map<string, string>();
  const clientDeCarte = new Map<string, string>();
  for (const c of tournee?.clients ?? []) noms.set(c.id, c.nom);
  for (const k of tournee?.cartes ?? []) clientDeCarte.set(k.id, k.clientId);
  const charges = [
    ...sources.map((s) => s.charge),
    ...operations.map((o) => objet(chargeUtileDe(o))),
  ];
  for (const cu of charges) {
    const charge = champ(cu, 'charge');
    const type = texte(cu, 'type');
    if (type === 'client_carte') {
      const clientId = texte(champ(charge, 'client'), 'id');
      const nom = texte(champ(charge, 'client'), 'nom');
      const carteId = texte(champ(charge, 'carte'), 'id');
      if (clientId !== null && nom !== null && !noms.has(clientId)) noms.set(clientId, nom);
      if (clientId !== null && carteId !== null && !clientDeCarte.has(carteId)) {
        clientDeCarte.set(carteId, clientId);
      }
    } else if (type === 'carte') {
      const carteId = texte(charge, 'id');
      const clientId = texte(charge, 'clientId');
      if (clientId !== null && carteId !== null && !clientDeCarte.has(carteId)) {
        clientDeCarte.set(carteId, clientId);
      }
    }
  }

  const nomDuClient = (clientId: string | null) =>
    clientId === null ? null : (noms.get(clientId) ?? null);
  const nomDeLaCarte = (carteId: string | null) =>
    carteId === null ? null : nomDuClient(clientDeCarte.get(carteId) ?? null);
  /** « Awa — mise de 1 000 FCFA », ou « Mise de 1 000 FCFA » quand le nom manque. */
  const pour = (nom: string | null, quoi: string) =>
    nom === null ? quoi.charAt(0).toUpperCase() + quoi.slice(1) : `${nom} — ${quoi}`;

  const titre = (cu: Brut | null): string => {
    const charge = champ(cu, 'charge');
    const type = texte(cu, 'type');
    if (type === 'mise') {
      const montant = nombre(charge, 'montant');
      if (montant !== null) {
        return pour(nomDeLaCarte(texte(charge, 'carteId')), `mise de ${formatMontant(montant)} FCFA`);
      }
    } else if (type === 'client_carte') {
      const mise = nombre(champ(charge, 'carte'), 'mise');
      if (mise !== null) {
        return pour(
          texte(champ(charge, 'client'), 'nom'),
          `inscription et carte de ${formatMontant(mise)} FCFA`,
        );
      }
    } else if (type === 'carte') {
      const mise = nombre(charge, 'mise');
      if (mise !== null) {
        return pour(nomDuClient(texte(charge, 'clientId')), `carte de ${formatMontant(mise)} FCFA`);
      }
    } else if (type === 'caisse') {
      const date = texte(charge, 'date');
      const declare = nombre(charge, 'cashDeclare');
      if (date !== null && declare !== null) {
        return `Caisse du ${date} — ${formatMontant(declare)} FCFA déclarés`;
      }
    }
    return 'Opération refusée';
  };

  const affiches = sources.map((s) => {
    const faiteLe = texte(s.charge, 'faiteLe');
    return {
      id: s.id,
      titre: titre(s.charge),
      detail: phraseRefus(s.motif),
      quand: faiteLe !== null && !Number.isNaN(Date.parse(faiteLe)) ? faiteLe : null,
    };
  });
  const instant = (quand: string | null) =>
    quand === null ? Number.NEGATIVE_INFINITY : Date.parse(quand);
  // `sort` est stable : à heure égale, l'ordre des sources est gardé.
  return affiches.sort((a, b) => {
    const ecart = instant(b.quand) - instant(a.quand);
    return Number.isNaN(ecart) ? 0 : ecart;
  });
}

/** Jours entiers écoulés depuis `iso`. Jamais négatif : une horloge en avance n'invente pas d'attente. */
export function joursDAttente(iso: string | null, maintenant: number): number {
  if (iso === null) return 0;
  const ecoule = maintenant - Date.parse(iso);
  return Number.isNaN(ecoule) ? 0 : Math.max(0, Math.floor(ecoule / 86_400_000));
}

const NATURE_EN_ATTENTE: Readonly<Record<TypeOperation, string>> = {
  mise: 'Une mise',
  client_carte: 'Une inscription',
  carte: 'Une carte',
  caisse: 'Une déclaration de caisse',
};

/**
 * L'avertissement de l'accueil quand le plus ancien geste en attente approche
 * de la fenêtre du serveur, ou `null` (spec J2b §4.7, §8.8).
 *
 * Il nomme ce qui attend. « Une mise » quand c'est une inscription enverrait
 * le collecteur chercher une mise qu'il ne trouvera pas.
 */
export function phraseAttenteLongue(file: EtatFile | null, maintenant: number): string | null {
  if (file === null || file.plusAncienne === null || file.plusAncienneType === null) return null;
  const jours = joursDAttente(file.plusAncienne, maintenant);
  if (jours < JOURS_ALERTE_ATTENTE) return null;
  const debut = `${NATURE_EN_ATTENTE[file.plusAncienneType]} attend depuis ${jours} jours.`;
  // Passé la fenêtre, « avant 90 jours » se contredirait. Le serveur ne borne
  // par la date que les mises (`encaisse_le`) et les caisses (`date`) : le plus
  // ancien geste peut être une inscription, la phrase dit donc ce qu'il refuse.
  if (jours >= 90) {
    return `${debut} Retrouve du réseau dès que possible : passé 90 jours, le serveur refuse une mise ou une caisse, et le refus reste lisible dans les alertes.`;
  }
  return `${debut} Retrouve du réseau avant 90 jours.`;
}

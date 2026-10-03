import { lectureCourante } from './hors-ligne/moteur';
import { TourneeAbsente, listeDepuis, tableauDepuis, type ListeClients } from './hors-ligne/vues';

/**
 * Les chiffres du collecteur, pour l'écran d'accueil, et la liste de ses clients.
 *
 * Depuis J2b, ils se calculent sur la tournée gardée par le téléphone — en
 * ligne comme hors ligne, un seul chemin (spec §5.4). Le réseau n'entre ici que
 * par `hors-ligne/rafraichir.ts`, qui recharge la tournée tout ou rien.
 *
 * L'écran affichait jadis les chiffres de la maquette — « 48 500 FCFA »,
 * « 24 clients », « +8 % vs hier ». Depuis que le collecteur encaisse pour de
 * vrai, un montant inventé sur l'écran d'accueil est un montant qu'il peut
 * prendre pour sa recette du jour. La règle tient toujours : ne rendre que ce
 * que la tournée sait dire.
 */

export interface Carte {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
}

export interface MiseRecente {
  id: string;
  carte_id: string;
  montant: number;
  est_commission: boolean;
  encaisse_le: string;
}

export interface TableauCollecteur {
  clients: number;
  cartesActives: number;
  /**
   * Les cartes actives qui ont encore une case à payer : `cartesActives` moins
   * les cartes pleines, qui relèvent du retrait. C'est le « en cours » du titre
   * de la carte à finir, et du segment de l'écran Retrait.
   */
  cartesEnCours: number;
  encaisseAujourdhui: number;
  /** Les mises qui font ce montant : le « 23 mises » de l'en-tête. */
  misesAujourdhui: number;
  /** Ce que le collecteur doit encore à ses clients, toutes cartes actives. */
  encoursTotal: number;
  /**
   * La carte qu'on finit avant les autres : la première de `cartesAEncaisser`, la
   * plus avancée des cartes en cours, dans l'ordre de l'écran Encaisser. Jamais
   * une carte pleine (31 mises) : elle n'a plus de case à payer, et un « Encaisser »
   * posé dessous mènerait à un bouton éteint. `null` quand aucune carte n'a de
   * case à payer, que le collecteur n'ait aucune carte active ou que toutes soient
   * pleines (`cartesActives` les distingue).
   *
   * `carteId` et `clientId` l'accompagnent depuis le 2026-08-25 : sans eux, les
   * commandes posées sous la carte de l'accueil ne pouvaient que renvoyer vers
   * un écran — « Encaisser » ouvrait la liste des clients, à charge pour le
   * collecteur d'y retrouver celui qu'il venait de voir. Un bouton posé sous
   * une carte doit agir sur cette carte.
   */
  carteDuJour: {
    carteId: string;
    clientId: string;
    nom: string;
    mise: number;
    misesEncaissees: number;
    solde: number;
  } | null;
  dernieres: Array<{ nom: string; montant: number; estCommission: boolean; quand: string }>;
}

export async function chargerTableauCollecteur(): Promise<TableauCollecteur> {
  const { tournee } = await lectureCourante();
  if (tournee.lueLe === null) throw new TourneeAbsente();
  return tableauDepuis(tournee, Date.now());
}

/** La liste de l'écran des clients. Voir `listeDepuis` pour la forme. */
export async function chargerListeClients(): Promise<ListeClients> {
  const { tournee } = await lectureCourante();
  if (tournee.lueLe === null) throw new TourneeAbsente();
  return listeDepuis(tournee);
}

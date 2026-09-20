/**
 * Les faits d'identité de l'exploitant, en un seul endroit.
 *
 * Trois pages les citent. Deux copies d'un nom ou d'un numéro finissent par
 * diverger, et une divergence entre les mentions légales et la politique de
 * confidentialité est exactement le genre de détail qu'un adversaire relève.
 *
 * Un champ encore inconnu vaut `null`, jamais une chaîne inventée ni une
 * chaîne vide : `Champ` le rend en marqueur visible (voir `PageLegale`).
 *
 * Aucun script n’échoue sur un trou — c’est l’exploitant qui décide quand
 * publier, pas la chaîne de vérification. Le marqueur est là pour être vu,
 * et la tâche 7 en fait un point d’accord explicite.
 */

/** Un fait que l'exploitant n'a pas encore fourni. */
export type Trou = null;

export interface Identite {
  /** La personne physique. Une enseigne ne désigne personne en droit. */
  exploitant: string;
  enseigne: string;
  commune: string;
  /** Quartier, lot ou boîte postale. Une commune seule ne permet pas d'assigner. */
  adressePrecise: string | Trou;
  pays: string;
  compteContribuable: string;
  /** Déposée sans frais au greffe ; l'entreprenant en est dispensé de RCCM. */
  declarationActivite: string | Trou;
  /**
   * Le numéro de l'exploitant, sous sa forme lisible.
   *
   * Il n'en existe qu'un : `liens.ts` en déduit le lien `wa.me` en retirant
   * tout ce qui n'est pas un chiffre. Il y a eu un second champ `whatsapp`
   * portant les mêmes chiffres, retiré le 2026-09-20 — deux écritures d'un
   * seul fait, que rien n'obligeait à rester d'accord.
   *
   * Le jour où le WhatsApp de GTCS serait un autre numéro que celui-ci, c'est
   * alors qu'il faudra un second champ : ce sera deux faits, et non plus deux
   * copies.
   */
  telephone: string | Trou;
  contact: string;
  /** Annoncé dans la politique, donc opposable : ne pas promettre 48 h. */
  delaiReponseJoursOuvres: number | Trou;
}

export const IDENTITE: Readonly<Identite> = Object.freeze({
  exploitant: 'BERTHE OUSMANE',
  enseigne: 'GSM TECHNOLOGIE CYBER SHOP',
  commune: 'Saïoua',
  adressePrecise: 'Place Blé Zokou',
  pays: 'Côte d’Ivoire',
  compteContribuable: '4212842W',
  declarationActivite: 'CI-ISSI-18-A-141',
  telephone: '+225 07 88 81 81 18',
  contact: 'contact@kolek.cash',
  delaiReponseJoursOuvres: 7,
});

/** Le texte que porte un champ non renseigné. Repris par la garde de source. */
export const MARQUEUR_TROU = 'À COMPLÉTER';

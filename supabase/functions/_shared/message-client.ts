/**
 * Les messages envoyés aux clients épargnants.
 *
 * Module sans aucune API Deno, pour la raison établie par le défaut CORS du
 * 2026-08-20 : ce qui n'est pas testable finit par être faux. Ici, « faux »
 * a un prix au message.
 *
 * ## Le détail qui double la facture
 *
 * Un SMS se facture au **segment**, pas au message. Un segment vaut 160
 * caractères — mais seulement si le texte tient dans l'alphabet GSM 03.38.
 * Un seul caractère hors de cet alphabet fait basculer tout le message en
 * UCS-2, où un segment ne vaut plus que **70 caractères**.
 *
 * Le français écrit correctement en sort constamment :
 *
 * | Caractère | Dans GSM-7 ? |
 * |---|---|
 * | `é` `è` `à` `ù` `ì` `ò` | oui |
 * | **`ç` minuscule** | **non** — seul `Ç` majuscule y est |
 * | `ê` `â` `î` `ô` `û` `ë` `ï` | non |
 * | **`’` apostrophe typographique** | **non** — seule `'` droite y est |
 * | `…` `—` `«` `»` | non |
 *
 * « Reçu » et « l’argent » suffisent donc à faire payer le double. Le produit
 * écrit pourtant `’` partout ailleurs, et c'est très bien : c'est la bonne
 * typographie française. Ce module la convertit **au dernier moment**, pour le
 * seul canal qui la facture.
 *
 * Un collecteur au palier Pro envoie environ 3 900 messages par mois. À 20 FCFA
 * le segment, l'oubli de cette conversion coûte 78 000 FCFA par mois et par
 * collecteur — plus que quinze abonnements.
 */

/* -------------------------- L'alphabet GSM 03.38 -------------------------- */

/** Le jeu de base. Chaque caractère compte pour un. */
const GSM7_BASE =
  '@£$¥èéùìòÇ\nØø\rÅå' +
  'Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ' +
  ' !"#¤%&\'()*+,-./' +
  '0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNO' +
  'PQRSTUVWXYZÄÖÑÜ§' +
  '¿abcdefghijklmno' +
  'pqrstuvwxyzäöñüà';

/** La table d'extension. Chaque caractère compte pour **deux**. */
const GSM7_ETENDU = '^{}\\[~]|€';

const BASE = new Set(GSM7_BASE);
const ETENDU = new Set(GSM7_ETENDU);

/**
 * Les substitutions, du plus fidèle au plus lisible.
 *
 * On ne retire pas les accents que GSM-7 accepte : « versé » reste « versé ».
 * On ne remplace que ce qui ferait basculer le message entier.
 */
const SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[’‘‛`´]/g, "'"],
  [/[“”«»„]/g, '"'],
  [/[–—―]/g, '-'],
  [/…/g, '...'],
  [/ | | /g, ' '], // espaces insécables et fines
  [/ç/g, 'c'],
  [/[êëē]/g, 'e'],
  [/[âāă]/g, 'a'],
  [/[îïī]/g, 'i'],
  [/[ôõō]/g, 'o'],
  [/[ûüū]/g, 'u'], // `ü` existe en GSM-7 mais pas `û` : on aligne les deux
  [/œ/g, 'oe'],
  [/Œ/g, 'OE'],
  [/[ÊËÈ]/g, 'E'],
  [/[ÂÀÄ]/g, 'A'],
  [/[ÎÏ]/g, 'I'],
  [/[ÔÖ]/g, 'O'],
  [/[ÛÙÜ]/g, 'U'],
  [/✓/g, 'OK'],
];

/** Rend un texte transmissible en GSM-7, sans en changer le sens. */
export function versGsm7(texte: string): string {
  let sortie = texte;
  for (const [motif, remplacement] of SUBSTITUTIONS) {
    sortie = sortie.replace(motif, remplacement);
  }
  // Filet : tout ce qui reste hors alphabet est retiré plutôt que de faire
  // basculer le message. Un caractère perdu coûte moins qu'un doublement de
  // prix sur chaque message envoyé.
  return [...sortie].filter((c) => BASE.has(c) || ETENDU.has(c)).join('');
}

/** Le texte tient-il dans l'alphabet GSM-7 ? */
export function estGsm7(texte: string): boolean {
  return [...texte].every((c) => BASE.has(c) || ETENDU.has(c));
}

/** Le nombre d'unités facturées : les caractères étendus comptent double. */
export function unitesGsm7(texte: string): number {
  return [...texte].reduce((total, c) => total + (ETENDU.has(c) ? 2 : 1), 0);
}

export interface Facturation {
  segments: number;
  encodage: 'GSM-7' | 'UCS-2';
  unites: number;
}

/**
 * Combien de segments ce message coûtera.
 *
 * Les seuils viennent de la norme : un message court tient dans 160 unités en
 * GSM-7, 70 en UCS-2. Au-delà, l'en-tête de concaténation mange de la place et
 * les seuils tombent à 153 et 67.
 */
export function facturer(texte: string): Facturation {
  if (estGsm7(texte)) {
    const unites = unitesGsm7(texte);
    return {
      encodage: 'GSM-7',
      unites,
      segments: unites <= 160 ? 1 : Math.ceil(unites / 153),
    };
  }
  const unites = [...texte].length;
  return {
    encodage: 'UCS-2',
    unites,
    segments: unites <= 70 ? 1 : Math.ceil(unites / 67),
  };
}

/* --------------------------- La composition ------------------------------ */

export type Evenement =
  | { type: 'mise'; montant: number; solde: number; jour: number; total: number; reference: string }
  | { type: 'retrait'; montant: number; reference: string }
  | { type: 'ouverture'; mise: number; total: number };

/** Groupe les milliers par un espace simple — l'insécable n'est pas en GSM-7. */
function montant(valeur: number): string {
  return String(Math.trunc(valeur)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Compose le message d'un mouvement.
 *
 * ## Ce que le message contient, et pourquoi
 *
 * **Le montant et le solde.** C'est l'objet même du dispositif : le client
 * vérifie que ce qu'il a remis correspond à ce qui est inscrit. Sans le solde,
 * il ne peut contrôler qu'une opération à la fois et jamais le cumul — or c'est
 * le cumul qu'on lui doit.
 *
 * **Une référence courte.** Les huit premiers caractères de l'identifiant de la
 * mise, celui-là même qu'affiche l'écran Reçus. C'est ce qui permet de retrouver
 * l'opération en cas de contestation, des deux côtés.
 *
 * ## Ce qu'il ne contient pas
 *
 * **Ni le nom du client, ni celui du collecteur.** Le téléphone est souvent
 * partagé en famille, parfois prêté. Le message doit informer son destinataire
 * sans renseigner celui qui le lirait par-dessus l'épaule : un montant sans nom
 * ne désigne personne.
 *
 * **Aucun lien.** Un SMS financier contenant un lien apprend à ses destinataires
 * à cliquer sur les liens des SMS financiers. C'est exactement le réflexe que
 * l'hameçonnage exploite.
 */
export function composer(evenement: Evenement): string {
  const brut = (() => {
    switch (evenement.type) {
      case 'mise':
        return (
          `KOLEK. Versement recu : ${montant(evenement.montant)} FCFA. ` +
          `Jour ${evenement.jour}/${evenement.total}. ` +
          `Total a vous rendre : ${montant(evenement.solde)} FCFA. ` +
          `Ref ${evenement.reference}.`
        );
      case 'retrait':
        return (
          `KOLEK. Carte cloturee. ` +
          `Montant rendu : ${montant(evenement.montant)} FCFA. ` +
          `Ref ${evenement.reference}. ` +
          `Verifiez la somme avant de quitter votre collecteur.`
        );
      case 'ouverture':
        return (
          `KOLEK. Nouvelle carte ouverte. ` +
          `Mise de ${montant(evenement.mise)} FCFA par jour, ${evenement.total} jours. ` +
          `Vous recevrez un message a chaque versement.`
        );
    }
  })();

  return versGsm7(brut);
}

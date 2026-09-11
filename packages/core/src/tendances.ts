/**
 * La variation d'une période à la précédente.
 *
 * La base mesure, ce module juge, l'écran affiche — même partage qu'au chantier
 * de la santé du système. Le jugement vit ici parce qu'il n'autorise rien : une
 * fonction pure se prouve cas par cas, sans base et sans navigateur.
 *
 * ## Ce que ce module refuse de faire
 *
 * Comparer à rien. Une période précédente vide ne donne pas « +100 % » : elle
 * ne donne aucun pourcentage. `null` remonte alors jusqu'à l'écran, qui retire
 * sa pastille et écrit une phrase — Design System §2, principe 7.
 */

/**
 * L'insécable est construite par son code, jamais tapée.
 *
 * Écrite en séquence d'échappement, elle arrive dans le fichier comme le
 * caractère lui-même : invisible, et impossible à distinguer d'une espace
 * ordinaire à la relecture. Constaté le 2026-09-11 sur huit lignes du chantier
 * précédent.
 */
const INSECABLE = String.fromCharCode(160);

/** Ce que la base rend pour une période. */
export interface FluxPeriode {
  encaisse: number;
  commissions: number;
  restitutions: number;
  mises: number;
  retraits: number;
}

export interface Variation {
  /** La variation réelle, non bornée : c'est elle qu'on relit dans un journal. */
  pourcentage: number;
  positive: boolean;
  /** Ce que la pastille affiche, borné à trois chiffres. */
  libelle: string;
}

/**
 * `null` quand la comparaison n'a pas de sens : période précédente vide,
 * négative, ou valeur qui n'est pas un nombre fini.
 */
export function variation(actuel: number, precedent: number): Variation | null {
  if (!Number.isFinite(actuel) || !Number.isFinite(precedent)) return null;
  if (precedent <= 0) return null;

  const pourcentage = Math.round(((actuel - precedent) / precedent) * 100);
  const positive = pourcentage >= 0;
  // Au-delà de 999 %, le chiffre exact n'apprend rien de plus que « beaucoup »,
  // et il déborde de la pastille.
  const affiche = Math.min(Math.abs(pourcentage), 999);
  const signe = pourcentage > 0 ? '+' : pourcentage < 0 ? '-' : '';

  return { pourcentage, positive, libelle: `${signe}${affiche}${INSECABLE}%` };
}

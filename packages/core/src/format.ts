/**
 * Le séparateur de milliers est une **espace insécable** (U+00A0), pas une
 * espace ordinaire.
 *
 * Une espace ordinaire est une occasion de retour à la ligne : sur le tableau
 * de bord, « 345 000 FCFA » se coupait en « 345 » puis « 000 FCFA » dès que la
 * carte descendait sous la largeur du nombre — quatre colonnes à partir de
 * `xl`, donc autour de 1280 px. Un montant coupé en deux se lit comme deux
 * montants, et c'est un tableau de bord financier.
 *
 * Insécable et non fine (U+202F) : la fine change la largeur de tous les
 * montants du produit, sur les trois applications. Celle-ci garde exactement
 * le rendu actuel et retire la seule chose qui posait problème — la coupure.
 *
 * Les exports CSV ne passent pas par ici : `exporter.ts` écrit les nombres
 * bruts, et un tableur ne saurait pas relire un montant espacé.
 */
const ESPACE = ' ';

function grouperMilliers(entierAbsolu: string): string {
  return entierAbsolu.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE);
}

/** Formate un montant FCFA sans suffixe : 817432 → "817 432". */
export function formatMontant(montant: number): string {
  if (!Number.isFinite(montant)) {
    throw new TypeError(`Montant non fini : ${montant}`);
  }
  const entier = Math.trunc(montant);
  const signe = entier < 0 ? '-' : '';
  return signe + grouperMilliers(Math.abs(entier).toString());
}

/** Formate un montant FCFA : 817432 → "817 432 FCFA". */
export function formatFCFA(montant: number): string {
  return `${formatMontant(montant)} FCFA`;
}

function deuxChiffres(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 15/08/2026 */
export function formatDateLocale(d: Date): string {
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 15/08/2026 à 14:32 */
export function formatHeureLocale(d: Date): string {
  return `${formatDateLocale(d)} à ${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}

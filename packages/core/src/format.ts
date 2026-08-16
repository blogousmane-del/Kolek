const ESPACE = ' ';

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

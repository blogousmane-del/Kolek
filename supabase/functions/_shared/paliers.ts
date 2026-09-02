// Fichier engendré par scripts/generer-paliers-edge.mjs — ne pas modifier à la main.
// La source est packages/core/src/paliers.ts. Relancer : npm run generer:paliers
//
// Les Edge Functions tournent sous Deno et ne voient pas les paquets de l'espace
// de travail npm. Sans ce fichier, le calcul du chiffre d'affaires porterait sa
// propre copie des prix — exactement ce que l'en-tête de paliers.ts interdit :
// « un prix qui diverge entre la page de vente et l'écran d'administration
// n'est pas un défaut d'affichage, c'est un litige commercial ».
//
// Le contrôle de fraîcheur (npm run verifier:paliers) est ce qui empêche les
// deux de diverger. Il tourne dans `npm run verifier`, à côté de celui du thème.

export type Palier = 'essai' | 'standard' | 'pro' | 'illimite';

export interface TarifPalier {
  cle: Palier;
  nom: string;
  /** En FCFA par mois. */
  prix: number;
  /** Plafond de clients ; `null` vaut « aucun plafond ». */
  limiteClients: number | null;
  /** Collaborateurs inclus dans le forfait. */
  collaborateursInclus: number;
}

export const TARIFS: readonly TarifPalier[] = [
  { cle: 'essai', nom: 'Essai', prix: 0, limiteClients: 20, collaborateursInclus: 0 },
  { cle: 'standard', nom: 'Standard', prix: 2500, limiteClients: 50, collaborateursInclus: 0 },
  { cle: 'pro', nom: 'Pro', prix: 5000, limiteClients: 150, collaborateursInclus: 0 },
  { cle: 'illimite', nom: 'Illimité', prix: 10000, limiteClients: null, collaborateursInclus: 3 },
];

const PAR_CLE = new Map(TARIFS.map((t) => [t.cle, t]));

/** Rend le tarif, ou lève : un palier inconnu en base doit se voir, pas se taire. */
export function tarifParCle(cle: string): TarifPalier {
  const trouve = PAR_CLE.get(cle as Palier);
  if (!trouve) throw new RangeError(`Palier inconnu : ${cle}`);
  return trouve;
}

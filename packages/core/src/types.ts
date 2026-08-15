export type StatutCarte = 'active' | 'cloturee';

export type Palier = 'essai' | 'standard' | 'pro' | 'illimite';

export interface Carte {
  id: string;
  collecteurId: string;
  clientId: string;
  mise: number;
  statut: StatutCarte;
  misesEncaissees: number;
}

export interface Mise {
  id: string;
  collecteurId: string;
  carteId: string;
  montant: number;
  estCommission: boolean;
  encaisseLe: string;
}

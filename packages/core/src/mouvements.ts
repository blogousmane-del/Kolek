/**
 * Le registre des mouvements d'argent, calculé sur des lignes brutes.
 *
 * ## Pourquoi ce module existe
 *
 * Depuis le chantier du 2026-09-15, l'argent ne se lit plus dans `mises` ni
 * dans `retraits` : il se lit dans la vue `public.mouvements`, qui réunit les
 * mises, les retraits et les rattrapages — ces mises qu'un collecteur a
 * encaissées et que le serveur a refusées. Un bilan écrit sur `mises` seule
 * perdrait exactement l'argent que le rattrapage sert à ne pas perdre.
 *
 * Le téléphone, lui, garde ses lignes brutes : sa tournée est une copie de
 * tables, pas de vue. Cette fonction lui donne la **même règle**, et
 * `supabase/tests/mouvements.test.ts` compare les deux sorties sur la vraie
 * base : si l'une bouge sans l'autre, l'épreuve tombe.
 *
 * ## Les trois règles, les mêmes que celles de la vue
 *
 * 1. Le montant est toujours **positif** ; `sens` dit la direction. L'argent
 *    tenu est `sum(sens * montant)`, les encaissements `sens = 1`.
 * 2. La commission reste une mise. Une sortie vaut le montant **restitué**,
 *    jamais restitué + commission : la commission reste chez le collecteur, et
 *    elle est déjà comptée du côté des mises.
 * 3. `mainId` est la main qui a tenu l'argent — `encaisse_par`, `restitue_par`
 *    ou `main_id` — et non le propriétaire de la carte. C'est elle qui range
 *    l'argent dans une sacoche, donc dans une caisse du jour.
 */

export type NatureMouvement = 'mise' | 'retrait' | 'rattrapage';

export interface LigneMouvement {
  id: string;
  nature: NatureMouvement;
  /** `1` : l'argent entre dans la main. `-1` : il en sort. */
  sens: 1 | -1;
  /** Toujours positif. */
  montant: number;
  /** Qui a tenu l'argent, jamais le propriétaire de la carte. */
  mainId: string;
  carteId: string;
  /** ISO 8601, tel que la source l'a écrit. */
  survenuLe: string;
  estCommission: boolean;
}

export interface SourcesMouvements {
  mises: ReadonlyArray<{
    id: string;
    carteId: string;
    montant: number;
    encaissePar: string;
    encaisseLe: string;
    estCommission: boolean;
  }>;
  retraits: ReadonlyArray<{
    id: string;
    carteId: string;
    montantRestitue: number;
    restituePar: string;
    effectueLe: string;
  }>;
  rattrapages: ReadonlyArray<{
    id: string;
    carteId: string;
    montant: number;
    mainId: string;
    encaisseLe: string;
  }>;
}

export function mouvementsDepuis(sources: SourcesMouvements): LigneMouvement[] {
  return [
    ...sources.mises.map((m) => ({
      id: m.id,
      nature: 'mise' as const,
      sens: 1 as const,
      montant: m.montant,
      mainId: m.encaissePar,
      carteId: m.carteId,
      survenuLe: m.encaisseLe,
      estCommission: m.estCommission,
    })),
    ...sources.retraits.map((r) => ({
      id: r.id,
      nature: 'retrait' as const,
      sens: -1 as const,
      montant: r.montantRestitue,
      mainId: r.restituePar,
      carteId: r.carteId,
      survenuLe: r.effectueLe,
      estCommission: false,
    })),
    ...sources.rattrapages.map((t) => ({
      id: t.id,
      nature: 'rattrapage' as const,
      sens: 1 as const,
      montant: t.montant,
      mainId: t.mainId,
      carteId: t.carteId,
      survenuLe: t.encaisseLe,
      estCommission: false,
    })),
  ];
}

/** Ce qui est entré : les mises et les rattrapages. */
export function versementsDe(mouvements: readonly LigneMouvement[]): LigneMouvement[] {
  return mouvements.filter((m) => m.sens === 1);
}

/** L'argent tenu : les entrées moins les sorties. */
export function argentTenu(mouvements: readonly LigneMouvement[]): number {
  return mouvements.reduce((somme, m) => somme + m.sens * m.montant, 0);
}

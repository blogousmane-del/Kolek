/**
 * Un PostgREST de poche, pour les épreuves des lectures. Aucun module de
 * l'application ne l'importe.
 *
 * Il imite les deux traits du vrai qui décident de ces épreuves :
 *
 * - **toute requête s'attend** : `await` sur la chaîne l'exécute, comme sur
 *   celles de `supabase-js` ;
 * - **sans `range`, il coupe à `MAX_ROWS` lignes, sans erreur** — ce que fait
 *   `max_rows = 1000` (`supabase/config.toml`, suivi par la production). Une
 *   épreuve de 1 001 lignes voit donc, sur un code qui oublie de paginer,
 *   exactement ce que voit un collecteur : mille lignes, et rien pour le dire.
 *
 * `range(debut, fin)` rend la tranche demandée, et jamais plus de `MAX_ROWS` :
 * le vrai plafonne aussi une plage trop large.
 *
 * `MAX_ROWS` est écrit ici en dur, et non repris de `TAILLE_PAGE` : si la page
 * de `pagination.ts` changeait un jour, le faux ne doit pas la suivre — c'est
 * le serveur qu'il imite, pas le code qu'il éprouve.
 */

export const MAX_ROWS = 1000;

export type Ligne = Record<string, unknown>;

interface Tri {
  colonne: string;
  croissant: boolean;
}

interface Etat {
  lignes: Ligne[];
  tris: Tri[];
  debut: number;
  fin: number;
}

export type Requete = Promise<{ data: Ligne[]; error: null }> & {
  select: (colonnes?: string) => Requete;
  eq: (colonne: string, valeur: unknown) => Requete;
  gte: (colonne: string, valeur: string) => Requete;
  order: (colonne: string, options?: { ascending?: boolean }) => Requete;
  range: (debut: number, fin: number) => Requete;
  limit: (nombre: number) => Requete;
  maybeSingle: () => Promise<{ data: Ligne | null; error: null }>;
};

function comparer(a: Ligne, b: Ligne, tris: Tri[]): number {
  for (const { colonne, croissant } of tris) {
    const x = String(a[colonne]);
    const y = String(b[colonne]);
    if (x !== y) return (x < y ? -1 : 1) * (croissant ? 1 : -1);
  }
  return 0;
}

function requete(etat: Etat): Requete {
  const { lignes, tris, debut, fin } = etat;
  // `sort` est stable : sans tri demandé, l'ordre d'insertion reste.
  const triees = [...lignes].sort((a, b) => comparer(a, b, tris));
  const rendues = triees.slice(debut, Math.min(fin + 1, debut + MAX_ROWS));
  const suite = (change: Partial<Etat>) => requete({ ...etat, ...change });

  return Object.assign(Promise.resolve({ data: rendues, error: null as null }), {
    select: () => suite({}),
    eq: (colonne: string, valeur: unknown) =>
      suite({ lignes: lignes.filter((l) => l[colonne] === valeur) }),
    gte: (colonne: string, valeur: string) =>
      suite({ lignes: lignes.filter((l) => String(l[colonne]) >= valeur) }),
    order: (colonne: string, options?: { ascending?: boolean }) =>
      suite({ tris: [...tris, { colonne, croissant: options?.ascending !== false }] }),
    range: (d: number, f: number) => suite({ debut: d, fin: f }),
    limit: (nombre: number) => suite({ fin: debut + nombre - 1 }),
    maybeSingle: () => Promise.resolve({ data: triees[0] ?? null, error: null as null }),
  });
}

/** Une table factice. `tableFactice(lignes).select(…)` commence une requête. */
export function tableFactice(lignes: Ligne[]): Requete {
  return requete({ lignes, tris: [], debut: 0, fin: Number.MAX_SAFE_INTEGER });
}

/**
 * Les sources rendues de la vitrine, telles que les tests de garde les lisent.
 *
 * Deux suites s'en servent — `contraste.test.ts` et `copie.test.ts` — et elles
 * doivent lire exactement la même chose. Le 2026-09-05, elles ne le faisaient
 * pas : `copie` retirait les commentaires, `contraste` non. Le premier
 * commentaire écrit pour expliquer une correction de contraste a donc fait
 * rougir `contraste` en citant la classe qu'il venait de retirer.
 *
 * Un test qui échoue parce qu'on a documenté sa propre correction est un test
 * qui apprend à ne plus rien documenter. D'où ce fichier : une seule lecture,
 * une seule règle de nettoyage.
 *
 * Le suffixe `.test-utils.ts` le garde hors de la collecte de Vitest, qui ne
 * ramasse que `*.test.ts`.
 */

export interface SourceRendue {
  fichier: string;
  /** Le fichier débarrassé de ses commentaires. */
  texte: string;
  /** Le fichier tel qu'il est écrit, commentaires compris. */
  brut: string;
}

/**
 * La source débarrassée de ses commentaires.
 *
 * Les blocs `/* … *\/` couvrent aussi la forme `{/* … *\/}` du JSX, qui n'est
 * qu'un bloc entre accolades. Les lignes `//` sont retirées **sauf** quand deux
 * points les précèdent : sans cette réserve, `https://kolek.cash` amputerait la
 * fin de sa ligne, et une faute posée après une adresse passerait inaperçue.
 */
export function sansCommentaires(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Les composants de la vitrine, hors fichiers de test.
 *
 * Lus par `import.meta.glob` en `?raw` : c'est le transformateur du build qui
 * les fournit, et cela évite de faire entrer les types Node dans un projet
 * navigateur.
 */
export function sourcesRendues(
  modules: Record<string, string>,
): SourceRendue[] {
  return Object.entries(modules)
    .filter(([chemin]) => !chemin.endsWith('.test.tsx'))
    .map(([chemin, brut]) => ({
      fichier: chemin.replace('./', ''),
      texte: sansCommentaires(brut),
      brut,
    }));
}

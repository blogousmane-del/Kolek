/**
 * Charger une table entière, par pages, jusqu'à épuisement.
 *
 * ## Pourquoi ce module existe
 *
 * PostgREST applique `max_rows = 1000` — réglé dans `supabase/config.toml` —
 * **sans erreur et sans en-tête d'avertissement**. Une liste amputée a
 * exactement l'air d'une liste entière.
 *
 * L'écran des clients en portait deux, dont une invisible. Le compte exact posé
 * le 2026-09-09 sur `clients` faisait apparaître la troncature dans un bandeau ;
 * la requête sur `cartes`, elle, n'avait aucun comptage. Un collecteur au-delà
 * de mille cartes aurait vu des clients sans leurs cartes, et un solde
 * restituable calculé sur ce qui restait.
 *
 * ## Pourquoi tout charger, plutôt que paginer à l'écran
 *
 * Le collecteur travaille **hors ligne**, en tournée, et sa recherche filtre le
 * tableau déjà chargé. Une pagination à l'écran irait demander au serveur ce
 * que le collecteur n'a pas — c'est-à-dire rien, dans un marché sans réseau.
 * Charger l'intégralité de *sa* liste, une fois, est le seul dessin compatible
 * avec « hors-ligne d'abord », qui est la promesse de cette application.
 *
 * Le volume est borné par le métier : un collecteur porte quelques centaines de
 * clients. `PAGES_MAX` tient l'autre bord, pour le jour où ce ne serait plus
 * vrai ou pour un serveur qui ignorerait `range`.
 */

/** La taille d'une page. Égale à `max_rows` : demander plus ne rendrait pas plus. */
export const TAILLE_PAGE = 1000;

/**
 * Le nombre de pages au-delà duquel on refuse de continuer.
 *
 * Vingt mille lignes pour un collecteur n'est pas un cas de métier, c'est un
 * symptôme. Sans cette borne, un serveur qui ignorerait `range` rendrait une
 * page pleine à l'infini et le téléphone tournerait jusqu'à la panne de
 * batterie, en tournée, sans rien afficher.
 */
export const PAGES_MAX = 20;

/**
 * Combien de lignes l'écran **dessine** à la fois.
 *
 * ## À ne pas confondre avec `TAILLE_PAGE`, juste au-dessus
 *
 * Les deux nombres répondent à des questions opposées, et c'est pour ça qu'ils
 * sont écrits l'un sous l'autre plutôt que dans deux fichiers.
 *
 * `TAILLE_PAGE = 1000` dit combien de lignes on **demande au serveur** d'un
 * coup. Il vaut `max_rows` et n'a rien à voir avec l'affichage : le collecteur
 * travaille hors ligne, et toutes ses lignes sont chargées avant qu'il descende
 * au marché.
 *
 * Celui-ci dit combien de lignes on **met dans le document**. Aucun octet de
 * réseau n'en dépend.
 *
 * ## Pourquoi vingt, et non cinquante comme l'administration
 *
 * Cinquante était la valeur d'origine, reprise du journal du Super Admin. Elle
 * tient sur un tableau de bureau à six colonnes ; elle ne tient pas dans la main
 * du collecteur. Cinquante fiches de client sur un téléphone d'entrée de gamme,
 * c'est encore un long défilement — et c'est surtout un seuil que la plupart des
 * collecteurs n'atteignent jamais, si bien que la pagination restait invisible.
 * Une commande qui ne se déclenche pour personne ne sert personne.
 *
 * L'administration garde cinquante : ses tableaux se lisent sur un grand écran,
 * et les couper plus court les paginerait sans raison.
 */
export const LIGNES_AFFICHEES_PAR_PAGE = 20;

interface Page<T> {
  data: T[] | null;
  error: unknown;
  /** Présent quand la requête demande `count: 'exact'`. */
  count?: number | null;
}

/**
 * Appelle `page(debut, fin)` jusqu'à ce qu'elle rende moins que `TAILLE_PAGE`.
 *
 * Rend `{ data, error }` comme une requête simple, pour que l'appelant traite
 * l'erreur exactement comme avant.
 *
 * **Aucune donnée partielle en cas d'erreur.** Rendre les pages déjà obtenues
 * présenterait une liste incomplète comme complète — le défaut même que ce
 * module ferme.
 */
export async function chargerTout<T>(
  page: (debut: number, fin: number) => PromiseLike<Page<T>>,
): Promise<{ data: T[]; error: unknown; total: number | null }> {
  const tout: T[] = [];
  // Pris sur la première page et gardé : les suivantes le répètent, mais une
  // insertion en cours de chargement les ferait diverger.
  let total: number | null = null;

  for (let rang = 0; rang < PAGES_MAX; rang += 1) {
    const debut = rang * TAILLE_PAGE;
    const { data, error, count } = await page(debut, debut + TAILLE_PAGE - 1);

    if (error) return { data: [], error, total: null };
    if (rang === 0 && typeof count === 'number') total = count;

    const lot = data ?? [];
    tout.push(...lot);

    if (lot.length < TAILLE_PAGE) return { data: tout, error: null, total };
  }

  return {
    data: [],
    total: null,
    error: {
      message:
        `Plus de ${PAGES_MAX} pages de ${TAILLE_PAGE} lignes : le chargement a été ` +
        'interrompu plutôt que de tourner sans fin.',
    },
  };
}

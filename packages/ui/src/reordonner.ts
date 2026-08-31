/**
 * Réordonner une main de cartes.
 *
 * Module sans React et sans DOM, pour la raison désormais habituelle dans ce
 * dépôt : ce qui n'est pas testable finit par être faux. Le calcul d'un rang
 * cible pendant un glissement est exactement le genre de code qui paraît juste,
 * se trompe d'une unité au bord, et ne se voit qu'avec dix cartes sous le pouce.
 *
 * ## L'ordre ne se conserve pas
 *
 * Décision de GTCS : c'est un confort d'affichage. Le collecteur étale ses
 * cartes comme une main de jeu pour retrouver celle qu'il cherche, et l'ordre
 * meurt avec l'écran. Rien en base, aucune colonne, aucune migration.
 *
 * Conséquence directe : l'ordre vit à côté des données et doit donc être
 * recousu à chaque fois que la liste change — une carte clôturée disparaît, une
 * carte ouverte arrive. C'est le rôle d'`ordreSuivant`.
 */

/**
 * Déplace un élément, en décalant les autres.
 *
 * Une main de cartes ne s'échange pas deux à deux : on tire une carte et on
 * l'insère ailleurs, le reste glisse. Un `swap` mettrait la carte voisine à la
 * place qu'on vient de quitter, ce qui n'est pas ce que fait la main et se voit
 * immédiatement dès trois cartes.
 *
 * Les rangs hors bornes rendent la liste inchangée plutôt que de lever : un
 * glissement qui sort de l'écran est un geste courant, pas une erreur de
 * programmation.
 */
export function deplacer<T>(liste: readonly T[], de: number, vers: number): T[] {
  const copie = [...liste];

  const horsBornes =
    de < 0 || de >= copie.length || vers < 0 || vers >= copie.length || de === vers;
  if (horsBornes) return copie;

  const [pris] = copie.splice(de, 1);
  copie.splice(vers, 0, pris as T);
  return copie;
}

/**
 * Recoud l'ordre choisi avec la liste réelle.
 *
 * Trois cas, et les trois arrivent en une journée de tournée :
 *
 * - une carte **demeure** : elle garde la place que le collecteur lui a donnée ;
 * - une carte **disparaît** — clôturée, rendue — : elle sort sans décaler le
 *   choix fait sur les autres ;
 * - une carte **apparaît** — nouvelle ouverture — : elle va **à la fin**, jamais
 *   au milieu. Insérer une nouveauté au centre d'une main qu'on vient de ranger
 *   défait le rangement sous les yeux de celui qui l'a fait.
 *
 * Quand aucun ordre n'a encore été choisi, la liste d'origine passe telle
 * quelle : l'ordre du serveur est le défaut, et il est bon.
 */
export function ordreSuivant(
  ordre: readonly string[],
  ids: readonly string[],
): string[] {
  const presents = new Set(ids);
  const deja = new Set<string>();

  const survivants: string[] = [];
  for (const id of ordre) {
    if (presents.has(id) && !deja.has(id)) {
      survivants.push(id);
      deja.add(id);
    }
  }

  const nouveaux = ids.filter((id) => !deja.has(id));
  return [...survivants, ...nouveaux];
}

/**
 * Le rang sous le doigt, pendant un glissement.
 *
 * `depart` est le rang de la carte saisie, `ecart` la distance parcourue en
 * pixels depuis la prise, `pas` la largeur d'une carte plus son écartement.
 *
 * L'arrondi est délibéré : la carte bascule quand le doigt a franchi **la
 * moitié** de la carte voisine, pas sa totalité. Attendre la largeur entière
 * donne l'impression que la main résiste — le rang change une fois que le doigt
 * est déjà passé au-delà de l'endroit visé.
 *
 * Un `pas` nul ou négatif rend le rang de départ. C'est le cas de jsdom, qui ne
 * calcule aucune géométrie : sans cette garde, une division par zéro rendrait
 * `NaN`, et `NaN` borné donne zéro — toutes les cartes remonteraient en tête au
 * premier geste, dans les tests comme sur un écran qui n'a pas fini sa mise en
 * page.
 */
export function rangCible(depart: number, ecart: number, pas: number, total: number): number {
  if (!(pas > 0) || total <= 0) return depart;

  const vise = depart + Math.round(ecart / pas);
  return Math.min(Math.max(vise, 0), total - 1);
}

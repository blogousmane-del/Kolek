/**
 * Les préférences d'affichage, gardées sur l'appareil.
 *
 * ## Ce qui a le droit de passer par ici
 *
 * `apps/collecteur/src/cache.ts` pose la règle du dépôt : les lectures qui
 * portent des noms et des soldes de clients ne s'écrivent **pas** sur le disque
 * du téléphone, parce qu'elles y resteraient lisibles après la déconnexion, à
 * qui a l'appareil en main.
 *
 * Ce module ne l'entame pas. Ce qui passe ici est un choix d'affichage — trois
 * mots comme « reduite » — qui ne nomme personne, ne chiffre rien, et ne dit
 * pas même combien de clients existent. Deux collecteurs qui se relaient sur le
 * même téléphone se transmettront une taille de carte, et rien d'autre.
 *
 * Toute valeur qui apprendrait quelque chose sur un client n'a rien à faire
 * ici : elle relève du cache en mémoire, qui meurt avec l'onglet.
 *
 * ## Pourquoi une lecture validée
 *
 * Ce qui est stocké survit au code qui l'a écrit. Une version d'après peut
 * renommer une taille, en retirer une, et retrouver dans le stockage un mot
 * qu'elle ne connaît plus — sans compter ce qu'une console ouverte peut y
 * mettre. La liste des valeurs acceptées est donc passée à la lecture : ce qui
 * n'y figure pas est traité comme absent.
 */

/**
 * Lit une préférence, ou rend le défaut.
 *
 * Le stockage peut manquer (rendu hors navigateur) ou refuser : navigation
 * privée, stockage désactivé, cookies tiers bloqués. Le refus ne porte pas
 * toujours sur l'appel — Chrome lève sur l'**accès** à `localStorage`
 * lui-même — d'où le `typeof` à l'intérieur du `try` et non devant.
 *
 * Une préférence d'affichage n'est jamais une raison de casser un écran.
 */
export function lirePreference<T extends string>(
  cle: string,
  acceptees: readonly T[],
  defaut: T,
): T {
  let brut: string | null = null;

  try {
    if (typeof localStorage === 'undefined') return defaut;
    brut = localStorage.getItem(cle);
  } catch {
    return defaut;
  }

  return acceptees.find((valeur) => valeur === brut) ?? defaut;
}

/** Écrit une préférence, et se tait si le stockage refuse. */
export function ecrirePreference(cle: string, valeur: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(cle, valeur);
  } catch {
    // Un stockage plein ou fermé ne doit pas empêcher le choix d'agir sur
    // l'écran ; il l'empêche seulement de survivre au rechargement.
  }
}

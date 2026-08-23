/**
 * Les destinations réelles de la vitrine.
 *
 * Elles sont ici, en un seul endroit, parce que le défaut qu'on corrige le
 * 2026-08-23 était précisément leur absence : les boutons du hero pointaient
 * sur un `mailto:`. Un `mailto:` n'est pas un lien mort, mais sur une machine
 * sans client de messagerie configuré il ne produit **rien de visible** — et un
 * bouton qui ne produit rien de visible est un bouton cassé, quoi qu'en dise
 * le code.
 *
 * La règle qui en sort : **le geste principal d'une page de vente doit mener à
 * l'intérieur du produit**, pas dans la boîte aux lettres de quelqu'un.
 */

/** L'application du collecteur. Site Netlify distinct — la vitrine y renvoie
    par une navigation ordinaire, ce qu'aucune directive CSP n'entrave. */
export const APP_COLLECTEUR = 'https://kolek-collecteur.netlify.app';

/** L'administration GTCS. Non annoncée dans la navigation : elle ne s'adresse
    pas aux visiteurs, et la lister reviendrait à publier une cible. Elle
    figure dans la section Accès, nommée pour ce qu'elle est. */
export const APP_ADMIN = 'https://kolek-admin.netlify.app';

/**
 * Le formulaire d'ouverture de compte.
 *
 * Il remplace le `mailto:` partout où l'on demandait « une démo ». Le motif est
 * celui du 2026-08-23 : un `mailto:` ne produit **rien de visible** sur une
 * machine sans client de messagerie configuré, et le visiteur repart en croyant
 * le bouton cassé — sans que GTCS sache seulement qu'il est venu.
 *
 * `pour()` accroche le palier choisi sur la grille tarifaire, que le formulaire
 * présélectionne. Le serveur le revalide : un palier inconnu y est refusé, pas
 * corrigé en silence.
 */
export const INSCRIPTION = '/inscription';

export function inscriptionPour(palier: string): string {
  return `${INSCRIPTION}?palier=${encodeURIComponent(palier)}`;
}

/**
 * L'adresse de GTCS. Elle reste offerte en dernier recours, sous le formulaire
 * — pour qui préfère écrire — mais n'est plus jamais le geste principal.
 */
export const CONTACT_DEMO =
  'mailto:gsmtechnoloy@gmail.com?subject=Kolek%20—%20demande%20de%20démo';

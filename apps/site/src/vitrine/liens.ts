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

import { IDENTITE } from './legal/identite';

/** L'application du collecteur. Site Netlify distinct — la vitrine y renvoie
    par une navigation ordinaire, ce qu'aucune directive CSP n'entrave. */
export const APP_COLLECTEUR = 'https://app.kolek.cash';

/** L'administration GTCS. Non annoncée dans la navigation : elle ne s'adresse
    pas aux visiteurs, et la lister reviendrait à publier une cible. Elle
    figure dans la section Accès, nommée pour ce qu'elle est. */
export const APP_ADMIN = 'https://admin.kolek.cash';

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

/** Les trois textes juridiques. Servis par la vitrine, hors de l'index. */
export const MENTIONS_LEGALES = '/mentions-legales';
export const CONDITIONS = '/conditions';
export const CONFIDENTIALITE = '/confidentialite';

/**
 * La conversation WhatsApp de GTCS.
 *
 * Le numéro est en chiffres nus, sans `+`, sans espace et sans indicatif
 * entre parenthèses : `wa.me` n'accepte que cette forme, et un numéro
 * formaté pour l'œil humain y ouvre une conversation vide — un lien mort qui
 * n'a pas l'air mort, le pire des deux.
 *
 * **Il se déduit de `IDENTITE`, il ne s'y recopie pas.** Ce fichier a porté
 * les mêmes chiffres en dur jusqu'au 2026-09-19, à côté d'un `identite.ts`
 * qui s'ouvre sur « deux copies d'un nom ou d'un numéro finissent par
 * diverger » — et dont le champ `whatsapp` n'avait, lui, aucun lecteur. Le
 * fait d'identité était donc le mort, et la copie le vivant. Changer de numéro
 * aurait laissé le pied de page ouvrir l'ancien, sans qu'aucune garde ne
 * bronche : `verifier:mentions` contrôle qu'un champ est renseigné, pas qu'il
 * est lu.
 *
 * `null` quand l'exploitant n'a pas fourni de numéro : le champ est un `Trou`,
 * et `https://wa.me/` sans chiffres ouvre une conversation vide. Les deux
 * appelants retirent alors le lien plutôt que d'en servir un mort.
 */
export const WHATSAPP: string | null = IDENTITE.whatsapp
  ? `https://wa.me/${IDENTITE.whatsapp}`
  : null;

/**
 * L'adresse de l'exploitant. Elle reste offerte en dernier recours, sous le
 * formulaire — pour qui préfère écrire — mais n'est plus jamais le geste
 * principal.
 *
 * Au domaine depuis le 2026-09-18 : l'adresse d'un service commercial qui
 * figure dans des mentions légales et sert à exercer un droit d'accès ne peut
 * pas être un compte personnel chez un fournisseur grand public.
 */
export const CONTACT_DEMO =
  'mailto:contact@kolek.cash?subject=Kolek%20-%20demande%20de%20démo';

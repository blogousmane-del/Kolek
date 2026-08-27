/**
 * La règle d'adresse électronique du produit.
 *
 * Module sans aucune API Deno, et à part de `valider-demande.ts` parce qu'il a
 * deux appelants : le dépôt de demande, et `mot-de-passe-oublie`. Deux règles
 * qui divergeraient laisseraient un prospect déposer une adresse que l'écran
 * d'oubli refuserait ensuite de reconnaître.
 *
 * ## Ce que cette expression cherche à faire, et ce qu'elle renonce à faire
 *
 * Elle ne prétend pas décider si une adresse existe — seule une lettre envoyée
 * le dit, et c'est justement ce que fait le lien d'invitation. Elle écarte les
 * saisies qui ne peuvent en aucun cas en être une : pas d'arobase, pas de
 * domaine, un espace au milieu, une virgule qui trahit deux adresses collées.
 *
 * Une expression rationnelle « complète » au sens de la RFC 5322 fait plusieurs
 * milliers de caractères, refuse des adresses valides, et n'est relue par
 * personne. Celle-ci tient sur une ligne et se relit.
 *
 * ## La normalisation est la moitié du travail
 *
 * Ce que rend cette fonction est **ce qui sera écrit en base**, et l'index
 * unique partiel des demandes en attente porte dessus. Sans le passage en
 * minuscules, une majuscule suffirait à redéposer une demande.
 */

/** Reprise du `check` de `public.demandes_ouverture.email`. */
export const EMAIL_MAX = 160;

const FORME = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export type RefusEmail = 'EMAIL_MANQUANT' | 'EMAIL_TROP_LONG' | 'EMAIL_INVALIDE';

export type ResultatEmail =
  | { ok: true; email: string }
  | { ok: false; erreur: RefusEmail };

export function validerEmail(brut: unknown): ResultatEmail {
  const email = typeof brut === 'string' ? brut.trim().toLowerCase() : '';

  if (!email) return { ok: false, erreur: 'EMAIL_MANQUANT' };
  // La longueur d'abord : celui qui a collé un paragraphe doit apprendre le
  // vrai problème, pas « ce n'est pas une adresse ».
  if (email.length > EMAIL_MAX) return { ok: false, erreur: 'EMAIL_TROP_LONG' };
  if (!FORME.test(email)) return { ok: false, erreur: 'EMAIL_INVALIDE' };

  return { ok: true, email };
}

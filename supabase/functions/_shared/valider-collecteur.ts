import { tarifParCle } from './paliers.ts';

/**
 * Validation de la saisie de création d'un collecteur.
 *
 * Module à part, et sans aucune API Deno, pour la même raison que `cors.ts` :
 * ce qui n'est pas testable finit par être faux. La leçon vient du défaut CORS
 * du 2026-08-20 — une règle enfermée dans un fichier Deno n'était vérifiée par
 * rien, et la seule sonde qui l'examinait confirmait ce qu'elle croyait déjà.
 *
 * ## Pourquoi valider ici alors que la base valide déjà
 *
 * Les bornes ci-dessous répètent des contraintes `CHECK` de la base. Ce n'est
 * pas une seconde source de vérité — la base reste seule juge, et un
 * dépassement y lève `23514`. Deux raisons pratiques :
 *
 * 1. **Ne pas créer l'utilisateur Auth avant de savoir que sa ligne
 *    `collecteurs` sera refusée.** L'ordre est imposé : le déclencheur
 *    `creer_collecteur_apres_signup` compose la ligne à partir des métadonnées
 *    du compte. Un nom de 200 caractères ferait échouer le déclencheur *après*
 *    la création du compte, laissant une adresse consommée pour rien — et la
 *    seconde tentative buterait sur « adresse déjà prise ».
 * 2. **Rendre une phrase plutôt qu'un code SQL.** `23514` ne dit pas à
 *    l'administrateur quel champ reprendre.
 */

/** Reprises des contraintes `CHECK` de `public.collecteurs`. */
export const BORNES = { nom: 120, telephone: 64, zone: 80 } as const;

/**
 * Le distant applique 8 ; on exige 10, l'intention écrite dans `config.toml` et
 * relevée en écart au dernier audit. Durcir ici est sans risque : un mot de
 * passe plus long n'est jamais refusé par le serveur.
 */
export const LONGUEUR_MOT_DE_PASSE = 10;

export interface SaisieBrute {
  email?: unknown;
  motDePasse?: unknown;
  nom?: unknown;
  telephone?: unknown;
  zone?: unknown;
  palier?: unknown;
}

export interface ValeursCollecteur {
  email: string;
  motDePasse: string;
  nom: string;
  telephone: string;
  zone: string;
  palier: string;
}

export type Validation =
  | { ok: true; valeurs: ValeursCollecteur }
  | { ok: false; erreur: string };

function texte(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function validerCollecteur(saisie: SaisieBrute): Validation {
  const email = texte(saisie.email).toLowerCase();
  // Pas de `trim` sur le mot de passe : les espaces de tête ou de fin en font
  // partie. Les retirer changerait silencieusement le mot de passe remis au
  // collecteur, qui ne pourrait plus se connecter avec ce qu'on lui a dicté.
  const motDePasse = typeof saisie.motDePasse === 'string' ? saisie.motDePasse : '';
  const nom = texte(saisie.nom);
  const telephone = texte(saisie.telephone);
  const zone = texte(saisie.zone);
  const palier = texte(saisie.palier) || 'essai';

  // Volontairement sommaire : la validation d'adresse fait autorité chez GoTrue,
  // qui refusera ce qui ne lui convient pas. Ce test évite un aller-retour
  // évident, il ne prétend pas trancher.
  if (!email.includes('@') || email.length < 5) return { ok: false, erreur: 'EMAIL_INVALIDE' };
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
    return { ok: false, erreur: 'MOT_DE_PASSE_COURT' };
  }
  if (!nom) return { ok: false, erreur: 'NOM_REQUIS' };
  // Le téléphone est exigé alors que la base l'accepterait absent : sans lui,
  // le déclencheur y met l'identifiant du compte, un UUID de 36 caractères qui
  // s'afficherait comme numéro dans toute l'administration.
  if (!telephone) return { ok: false, erreur: 'TELEPHONE_REQUIS' };

  if (nom.length > BORNES.nom) return { ok: false, erreur: 'NOM_TROP_LONG' };
  if (telephone.length > BORNES.telephone) return { ok: false, erreur: 'TELEPHONE_TROP_LONG' };
  if (zone.length > BORNES.zone) return { ok: false, erreur: 'ZONE_TROP_LONGUE' };

  // Lève si le palier n'existe pas dans la grille tarifaire, laquelle est
  // engendrée depuis `packages/core`. La contrainte `collecteurs_palier_check`
  // dirait la même chose, mais plus tard et moins clairement.
  try {
    tarifParCle(palier);
  } catch {
    return { ok: false, erreur: 'PALIER_INCONNU' };
  }

  return { ok: true, valeurs: { email, motDePasse, nom, telephone, zone, palier } };
}

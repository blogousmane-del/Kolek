/**
 * Validation d'une demande d'ouverture de compte.
 *
 * Module sans aucune API Deno, pour la raison établie par le défaut CORS du
 * 2026-08-20 : ce qui n'est pas testable finit par être faux.
 *
 * ## Ce que cette validation protège
 *
 * C'est la **première écriture publique** du produit — le seul endroit où une
 * requête sans session ouverte fait grossir une table. Les bornes ci-dessous ne
 * sont donc pas du confort d'affichage : elles sont ce qui sépare un formulaire
 * de prospection d'un dépotoir.
 *
 * Elles répètent les contraintes `CHECK` de la table, et c'est voulu. La base
 * reste seule juge — un dépassement y lève `23514`. Mais refuser ici rend une
 * phrase française au visiteur au lieu d'un code SQL, et évite d'ouvrir une
 * transaction pour une saisie vide.
 */

import { PALIERS_PAYANTS } from './chariow.ts';
import { EMAIL_MAX, validerEmail } from './valider-email.ts';
import { LONGUEUR_MOT_DE_PASSE } from './valider-collecteur.ts';

/** Reprises des contraintes `CHECK` de `public.demandes_ouverture`. */
export const BORNES = {
  nom: { min: 2, max: 120 },
  telephone: { min: 8, max: 64 },
  email: { max: EMAIL_MAX },
  zone: { max: 80 },
  message: { max: 500 },
} as const;

export const PALIERS_VALIDES = ['essai', 'standard', 'pro', 'illimite'] as const;
export type PalierDemande = (typeof PALIERS_VALIDES)[number];

export interface DemandeBrute {
  nom?: unknown;
  telephone?: unknown;
  email?: unknown;
  zone?: unknown;
  palier?: unknown;
  message?: unknown;
  /** Exigé pour un palier payant seulement. Voir `Resultat`. */
  motDePasse?: unknown;
}

export interface DemandeValide {
  nom: string;
  telephone: string;
  email: string;
  zone: string | null;
  palier: PalierDemande;
  message: string | null;
}

/**
 * Le mot de passe voyage **à côté** de la demande, jamais dedans.
 *
 * `demande` est inséré tel quel dans `demandes_ouverture`. Y laisser le clair
 * l'écrirait en base au premier appel — et la contrainte
 * `demandes_mot_de_passe_empreinte` le refuserait, ce qui est le bon
 * comportement mais un mauvais moment pour l'apprendre. Deux champs séparés
 * rendent la faute impossible plutôt que détectable.
 *
 * `motDePasse` est nul pour une demande d'essai : il n'y a pas de compte à
 * créer plus tard, donc rien à retenir, et conserver une empreinte dont
 * personne ne se servira serait un secret gardé pour rien.
 */
export type Resultat =
  | { ok: true; demande: DemandeValide; motDePasse: string | null }
  | { ok: false; erreur: string; champ: string };

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/**
 * Normalise un numéro ivoirien.
 *
 * Les chiffres seulement, plus un `+` initial s'il y en a un. Un même numéro
 * saisi « 07 01 02 03 04 », « +225 0701020304 » ou « 0701020304 » doit produire
 * une seule forme, sans quoi l'index unique qui empêche les demandes en double
 * ne sert à rien — il suffirait d'ajouter un espace pour resoumettre.
 *
 * Le préfixe pays n'est **pas** ajouté d'office : GTCS reçoit aussi des numéros
 * de la sous-région, et deviner « +225 » les rendrait injoignables.
 */
export function normaliserTelephone(brut: string): string {
  const nettoye = brut.replace(/[^\d+]/g, '');
  // Un `+` n'a de sens qu'en tête. Ailleurs, c'est une faute de frappe.
  const plus = nettoye.startsWith('+') ? '+' : '';
  return plus + nettoye.replace(/\+/g, '');
}

export function validerDemande(brut: DemandeBrute): Resultat {
  const nom = texte(brut.nom);
  if (nom.length < BORNES.nom.min) {
    return { ok: false, erreur: 'NOM_TROP_COURT', champ: 'nom' };
  }
  if (nom.length > BORNES.nom.max) {
    return { ok: false, erreur: 'NOM_TROP_LONG', champ: 'nom' };
  }

  const telephone = normaliserTelephone(texte(brut.telephone));
  // Le compte porte sur les chiffres : « +225 » occupe quatre caractères qui ne
  // sont pas un numéro.
  const chiffres = telephone.replace(/\D/g, '').length;
  if (chiffres < BORNES.telephone.min) {
    return { ok: false, erreur: 'TELEPHONE_TROP_COURT', champ: 'telephone' };
  }
  if (telephone.length > BORNES.telephone.max) {
    return { ok: false, erreur: 'TELEPHONE_TROP_LONG', champ: 'telephone' };
  }

  // L'adresse est obligatoire depuis le 2026-08-27, et c'est un revirement
  // assumé : `admin-creer-collecteur` explique qu'« attendre une confirmation
  // par courriel bloquerait un collecteur qui n'a pas d'adresse à lui — cas
  // courant sur ce marché ». C'est vrai du collecteur qu'on équipe au comptoir,
  // et cette fonction-là n'a pas changé. Ce n'est pas vrai de celui qui remplit
  // le formulaire de la vitrine : il choisit une offre, il paiera, et sans
  // adresse aucun des trois services demandés ne peut exister. Une adresse
  // créée pour l'occasion suffit.
  const verdictEmail = validerEmail(brut.email);
  if (!verdictEmail.ok) {
    return { ok: false, erreur: verdictEmail.erreur, champ: 'email' };
  }

  const zone = texte(brut.zone);
  if (zone.length > BORNES.zone.max) {
    return { ok: false, erreur: 'ZONE_TROP_LONGUE', champ: 'zone' };
  }

  const message = texte(brut.message);
  if (message.length > BORNES.message.max) {
    return { ok: false, erreur: 'MESSAGE_TROP_LONG', champ: 'message' };
  }

  // Un palier absent vaut « essai ». Un palier inconnu est refusé plutôt que
  // ramené à une valeur par défaut : une requête forgée qui demande un palier
  // inexistant ne doit pas être silencieusement corrigée.
  const palierBrut = texte(brut.palier) || 'essai';
  if (!(PALIERS_VALIDES as readonly string[]).includes(palierBrut)) {
    return { ok: false, erreur: 'PALIER_INCONNU', champ: 'palier' };
  }

  // Le mot de passe, pour un palier payant seulement.
  //
  // Amendement « payer vaut accord » du 2026-09-02 : un prospect qui règle au
  // formulaire n'a pas d'administrateur pour lui remettre des identifiants. Il
  // choisit donc son mot de passe **avant** de payer, et il est jugé ici — le
  // refuser après l'encaissement serait le pire moment possible.
  //
  // Pas de `trim` : les espaces de tête ou de fin font partie du mot de passe,
  // et les retirer changerait silencieusement ce que la personne a tapé. Même
  // raison que dans `validerCollecteur`, dont la longueur minimale est reprise
  // plutôt que recopiée — deux vérités finiraient par diverger.
  const palier = palierBrut as PalierDemande;
  const payant = PALIERS_PAYANTS.includes(palier);
  const motDePasse = typeof brut.motDePasse === 'string' ? brut.motDePasse : '';

  if (payant && motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
    return {
      ok: false,
      erreur: motDePasse ? 'MOT_DE_PASSE_COURT' : 'MOT_DE_PASSE_REQUIS',
      champ: 'motDePasse',
    };
  }

  return {
    ok: true,
    demande: {
      nom,
      telephone,
      email: verdictEmail.email,
      zone: zone || null,
      palier,
      message: message || null,
    },
    // Nul pour un essai, même si le formulaire en a envoyé un : aucun compte ne
    // naîtra de cette demande sans l'accord d'un humain, et garder une empreinte
    // dont personne ne se servira serait un secret gardé pour rien.
    motDePasse: payant ? motDePasse : null,
  };
}

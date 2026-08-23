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

/** Reprises des contraintes `CHECK` de `public.demandes_ouverture`. */
export const BORNES = {
  nom: { min: 2, max: 120 },
  telephone: { min: 8, max: 64 },
  zone: { max: 80 },
  message: { max: 500 },
} as const;

export const PALIERS_VALIDES = ['essai', 'standard', 'pro', 'illimite'] as const;
export type PalierDemande = (typeof PALIERS_VALIDES)[number];

export interface DemandeBrute {
  nom?: unknown;
  telephone?: unknown;
  zone?: unknown;
  palier?: unknown;
  message?: unknown;
}

export interface DemandeValide {
  nom: string;
  telephone: string;
  zone: string | null;
  palier: PalierDemande;
  message: string | null;
}

export type Resultat =
  | { ok: true; demande: DemandeValide }
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

  return {
    ok: true,
    demande: {
      nom,
      telephone,
      zone: zone || null,
      palier: palierBrut as PalierDemande,
      message: message || null,
    },
  };
}

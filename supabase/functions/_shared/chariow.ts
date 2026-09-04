import { TARIFS } from './paliers.ts';
import { secretValide } from './secret.ts';

/**
 * Le contrat Chariow, réduit à ce que Kolek en utilise.
 *
 * Module sans aucune API Deno et **sans aucun spécificateur `npm:`**, pour la
 * même raison que `cors.ts` et `valider-collecteur.ts` : ce qui n'est pas
 * testable finit par être faux, et Vitest ne sait pas résoudre `npm:`. C'est
 * aussi ce qui explique l'absence de `libphonenumber` — voir la note d'écart en
 * tête du plan d'implémentation.
 */

export type StatutPaiement = 'en_attente' | 'regle' | 'echoue' | 'abandonne';

/**
 * L'ordre des tests **est** la règle, et il n'est pas négociable.
 *
 * `Docs/Chariow.md` §3.3 : « unpaid » contient « paid ». Tester les succès
 * d'abord créditerait une vente non payée. Et `settled` — « réglé, fonds
 * encaissés » — est un paiement : l'oublier a déjà coûté une vente jamais
 * créditée chez l'auteur du fournisseur.
 *
 * Tout ce qui n'est pas reconnu retombe en attente, jamais en succès. Un
 * statut qu'on ne comprend pas n'est pas une preuve de paiement.
 */
export function mapperStatut(brut: unknown): StatutPaiement {
  const valeur = typeof brut === 'string' ? brut.trim().toLowerCase() : '';
  if (!valeur) return 'en_attente';

  if (valeur.includes('unpaid') || valeur.includes('pending') || valeur.includes('await')) {
    return 'en_attente';
  }
  if (valeur.includes('fail') || valeur.includes('error') || valeur.includes('declin')) {
    return 'echoue';
  }
  if (
    valeur.includes('cancel') ||
    valeur.includes('abandon') ||
    valeur.includes('refund') ||
    valeur.includes('expire')
  ) {
    return 'abandonne';
  }
  if (
    valeur.includes('settle') ||
    valeur.includes('complete') ||
    valeur.includes('paid') ||
    valeur.includes('success')
  ) {
    return 'regle';
  }
  return 'en_attente';
}

/** Tolérance du contrôle anti-fraude sur les montants. */
export const TOLERANCE_MONTANT = 0.05;

/**
 * Le montant relu chez Chariow est-il celui qu'on a enregistré à la création ?
 *
 * Un écart signale une boutique dont le prix a bougé entre la création de la
 * vente et son règlement, ou un identifiant de vente qui ne désigne pas ce
 * qu'on croit. Dans les deux cas on ne crédite pas — on journalise.
 */
export function montantCoherent(distant: number, stocke: number): boolean {
  if (!Number.isFinite(distant) || !Number.isFinite(stocke)) return false;
  if (distant < 0 || stocke < 0) return false;
  if (stocke === 0) return distant === 0;
  return Math.abs(distant - stocke) / stocke <= TOLERANCE_MONTANT;
}

export interface SaisieTelephone {
  /** E.164 complet, tel que le formulaire l'a composé. */
  telephone?: unknown;
  /** ISO2 du sélecteur de pays. */
  paysTelephone?: unknown;
  /** Numéro national, tel que saisi — le zéro de tête est admis. */
  telephoneLocal?: unknown;
}

/** Ce que Chariow exige : un numéro national et un pays ISO2. Jamais un E.164. */
export interface TelephoneChariow {
  number: string;
  country_code: string;
}

/**
 * Les indicatifs que le repli sait reconnaître.
 *
 * Volontairement limité à l'Afrique de l'Ouest et centrale, plus le Maghreb :
 * c'est le marché du produit. Un pays absent d'ici reste joignable — il suffit
 * que le formulaire envoie `paysTelephone`, ce qu'il fait toujours. Cette table
 * ne sert qu'au cas où il ne l'aurait pas fait.
 */
const INDICATIFS: ReadonlyArray<readonly [string, string]> = [
  ['225', 'CI'],
  ['221', 'SN'],
  ['229', 'BJ'],
  ['228', 'TG'],
  ['226', 'BF'],
  ['223', 'ML'],
  ['227', 'NE'],
  ['245', 'GW'],
  ['224', 'GN'],
  ['238', 'CV'],
  ['237', 'CM'],
  ['241', 'GA'],
  ['242', 'CG'],
  ['243', 'CD'],
  ['235', 'TD'],
  ['236', 'CF'],
  ['240', 'GQ'],
  ['233', 'GH'],
  ['234', 'NG'],
  ['261', 'MG'],
  ['212', 'MA'],
  ['216', 'TN'],
  ['213', 'DZ'],
];

const LONGUEUR_MIN = 6;
const LONGUEUR_MAX = 15;

function chiffres(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\D/g, '') : '';
}

function iso2(v: unknown): string {
  if (typeof v !== 'string') return '';
  const nettoye = v.trim();
  return /^[A-Za-z]{2}$/.test(nettoye) ? nettoye.toUpperCase() : '';
}

/** Le zéro national de tête ne fait pas partie du numéro pour Chariow. */
function sansZeroDeTete(national: string): string {
  return national.replace(/^0+/, '');
}

function utilisable(national: string): boolean {
  return national.length >= LONGUEUR_MIN && national.length <= LONGUEUR_MAX;
}

/** Découpe un E.164 sur les indicatifs connus. Rend `null` si aucun ne colle. */
export function decouperIndicatif(brut: string): TelephoneChariow | null {
  const n = brut.replace(/^00/, '');
  for (const [indicatif, code] of INDICATIFS) {
    if (!n.startsWith(indicatif)) continue;
    const national = sansZeroDeTete(n.slice(indicatif.length));
    if (utilisable(national)) return { number: national, country_code: code };
  }
  return null;
}

/**
 * Trois tentatives, la première qui valide gagne.
 *
 * Rendre `null` plutôt que de deviner : un numéro envoyé sans pays à Chariow
 * revient en `400 Invalid phone number`, après que la requête est partie. Mieux
 * vaut refuser ici, avant tout appel sortant.
 */
export function resoudreTelephone(saisie: SaisieTelephone): TelephoneChariow | null {
  const pays = iso2(saisie.paysTelephone);
  const local = sansZeroDeTete(chiffres(saisie.telephoneLocal));
  const complet = chiffres(saisie.telephone);

  // 1. Le cas normal : le formulaire a envoyé les deux.
  if (pays && utilisable(local)) return { number: local, country_code: pays };

  // 2. Un E.164 seul, dont on sait reconnaître l'indicatif.
  const decoupe = decouperIndicatif(complet);
  if (decoupe) return decoupe;

  // 3. Un pays, et des chiffres dont on ne sait pas s'ils portent l'indicatif.
  if (pays) {
    const brut = sansZeroDeTete(complet);
    if (utilisable(brut)) return { number: brut, country_code: pays };
  }

  return null;
}

/** Les paliers qui ont un prix, donc un produit dans la boutique Chariow. */
export const PALIERS_PAYANTS: readonly string[] = TARIFS.filter((t) => t.prix > 0).map(
  (t) => t.cle,
);

/**
 * Lit `CHARIOW_PRODUITS`, et lève si la correspondance n'est pas exacte.
 *
 * Lever au démarrage plutôt que rendre un objet incomplet : un identifiant
 * manquant ne se verrait qu'au premier collecteur qui choisit ce palier-là,
 * c'est-à-dire au pire moment.
 */
export function lireProduits(brut: string | undefined | null): Record<string, string> {
  if (!brut) throw new Error('CHARIOW_PRODUITS absent');

  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    throw new Error('CHARIOW_PRODUITS illisible');
  }
  if (!lu || typeof lu !== 'object' || Array.isArray(lu)) {
    throw new Error('CHARIOW_PRODUITS illisible');
  }

  const table = lu as Record<string, unknown>;

  for (const cle of Object.keys(table)) {
    if (!PALIERS_PAYANTS.includes(cle)) {
      throw new Error(`CHARIOW_PRODUITS nomme un palier qui ne se vend pas : ${cle}`);
    }
  }

  const produits: Record<string, string> = {};
  for (const cle of PALIERS_PAYANTS) {
    const valeur = table[cle];
    if (typeof valeur !== 'string' || !valeur.trim()) {
      throw new Error(`CHARIOW_PRODUITS ne nomme pas de produit pour : ${cle}`);
    }
    produits[cle] = valeur.trim();
  }
  return produits;
}

/**
 * Le nom complet d'une fiche Kolek, coupé en prénom et nom pour Chariow.
 *
 * Chariow exige les deux champs. Une fiche Kolek n'en porte qu'un — c'est ainsi
 * qu'on inscrit les gens ici, et le formulaire de la vitrine ne demande pas
 * autre chose. On coupe donc au premier espace, avec un **repli plutôt qu'un
 * refus** : quelqu'un enregistré sous un seul mot ne doit pas être empêché de
 * payer parce qu'un fournisseur veut deux cases.
 *
 * Deux appelants s'en servent — le renouvellement d'un collecteur et la
 * première souscription d'un prospect. La règle est la même, et la recopier
 * aurait donné deux découpes qui finiraient par diverger.
 */
export function couperNom(complet: string): { prenom: string; nomFamille: string } {
  const morceaux = String(complet ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    prenom: morceaux[0] ?? 'Collecteur',
    nomFamille: morceaux.length > 1 ? morceaux.slice(1).join(' ') : 'Kolek',
  };
}

/**
 * La signature que Chariow pose sur le corps de ses « Pulses ».
 *
 * `x-chariow-signature` vaut `sha256=` suivi du HMAC-SHA256 du **corps brut**,
 * clé par le secret de signature du Pulse — un `whsec_…` propre à chaque
 * destination, distinct de la clé d'API et de tout ce qui traverse l'URL.
 *
 * ## Pourquoi le corps brut, et pas l'objet
 *
 * Chariow sérialise en JSON compact avec les barres obliques échappées
 * (`https:\/\/`) et le non-ASCII en `\uXXXX`. Re-sérialiser l'objet analysé
 * produirait d'autres octets, donc une autre empreinte, et la signature ne
 * correspondrait jamais — une porte fermée en permanence, pour une raison qu'on
 * ne trouve qu'en comparant deux chaînes caractère par caractère.
 *
 * ## Ce qu'elle ajoute au secret de l'URL, et ce qu'elle n'ajoute pas
 *
 * Elle **n'empêche pas** un crédit frauduleux : `reconcilier` ne croit pas le
 * corps reçu — il relit la vente chez Chariow et ne recharge que les paiements
 * `en_attente` ou `echoue`. Un `successful.sale` forgé ne crédite donc rien.
 *
 * Elle empêche ce que le secret d'URL laisse passer : un tiers qui découvre
 * l'adresse — un journal du fournisseur, une capture — peut désigner des lignes
 * et faire consommer des lectures d'API à notre quota. Et c'est le contrôle que
 * le fournisseur prescrit : s'en passer, c'est ignorer la seule preuve
 * d'origine qu'il émet.
 *
 * Les deux barrières restent, dans cet ordre : le secret d'URL écarte le bruit
 * sans calcul, la signature répond de l'origine.
 */
export async function signatureChariowValide(
  entete: string | null,
  corpsBrut: string,
  secret: string,
): Promise<boolean> {
  if (!secret || !entete) return false;

  const encodeur = new TextEncoder();
  const cle = await crypto.subtle.importKey(
    'raw',
    encodeur.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const brut = await crypto.subtle.sign('HMAC', cle, encodeur.encode(corpsBrut));
  const attendu = `sha256=${[...new Uint8Array(brut)]
    .map((octet) => octet.toString(16).padStart(2, '0'))
    .join('')}`;

  // Comparaison en temps constant, comme partout ailleurs : une comparaison qui
  // s'arrête au premier caractère différent dit combien de caractères étaient
  // bons, et une signature se reconstitue alors octet par octet.
  return secretValide(entete, attendu);
}

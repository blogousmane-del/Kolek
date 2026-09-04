import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { StatutPaiement } from './chariow.ts';
import type { Depot, PaiementEnCours, VenteDistante } from './reconciliation.ts';
import type { TelephoneChariow } from './chariow.ts';

/**
 * Le branchement réel de la réconciliation : Chariow d'un côté, la base de
 * l'autre.
 *
 * Ce fichier est le seul du lot à toucher le réseau et la clé de service. Tout
 * ce qui **décide** vit dans `reconciliation.ts`, qui est testé sans réseau ;
 * ici il ne reste que du câblage. Ce découpage est délibéré — le code non
 * couvert doit être du câblage, pas du jugement.
 *
 * Ce qui est quand même couvert, et pourquoi : la lecture d'une vente
 * (`lireVenteChariow`) traduit trois noms de date et une devise, et le tri des
 * paiements rattrapables (`chargerPaiementsRattrapables`) porte une fenêtre et
 * une liste de colonnes. Ce sont des traductions, et une traduction fausse ne
 * se voit qu'au premier paiement perdu.
 */

/** La fenêtre de rattrapage d'un paiement refusé à tort. `Docs/Chariow.md` §5. */
export const JOURS_RATTRAPAGE = 14;

/** Au-delà, ce n'est plus un rattrapage : c'est une lecture d'archives que
    personne n'a demandée, et vingt lignes suffisent à couvrir la fenêtre. */
const LOT_MAX = 20;

export interface OptionsChariow {
  racine: string;
  cleApi: string;
}

/**
 * Comment ouvrir le compte d'un prospect qui vient de payer.
 *
 * Injecté, et non écrit ici, parce que les deux appelants de `creerDepot` n'ont
 * pas le même droit. `abonnement-verifier` réconcilie les paiements **du
 * collecteur connecté** : ils portent tous un `collecteur_id`, donc la
 * réconciliation n'atteint jamais cette opération. Le webhook, lui, reçoit des
 * paiements de prospects et doit savoir les servir.
 */
export type OuvrirCompte = (paiement: PaiementEnCours) => Promise<string>;

/**
 * Le défaut : refuser, bruyamment.
 *
 * Un paiement sans compte qui arriverait sur un chemin non prévu pour en créer
 * signale un défaut ailleurs. `reconcilier` rattrape ce refus, l'écrit au
 * journal et **ne crédite pas** — la ligne reste en base, lisible, rattrapable
 * au passage suivant. C'est le bon comportement : ouvrir un compte est
 * irréversible, laisser une ligne en attente ne l'est pas.
 */
const refuserOuverture: OuvrirCompte = (paiement) => {
  return Promise.reject(
    new Error(
      `OUVERTURE_HORS_CONTEXTE — le paiement ${paiement.id} règle la demande ` +
        `${paiement.demande_id} et arrive par un chemin qui n'ouvre pas de compte`,
    ),
  );
};

/** Les trois noms de date que Chariow emploie selon la version. */
function dateDeReglement(vente: Record<string, unknown>): string | null {
  for (const nom of ['settled_at', 'paid_at', 'completed_at']) {
    const valeur = vente[nom];
    if (typeof valeur === 'string' && valeur) return valeur;
  }
  return null;
}

export async function lireVenteChariow(
  venteId: string,
  options: OptionsChariow,
): Promise<VenteDistante> {
  const reponse = await fetch(`${options.racine}/sales/${encodeURIComponent(venteId)}`, {
    headers: { Authorization: `Bearer ${options.cleApi}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  // Le statut brut est remonté dans le message : `reconcilier` le journalise
  // sans créditer, et un 404 ne se diagnostique pas comme un 500.
  if (!reponse.ok) throw new Error(`HTTP_${reponse.status}`);

  const corps = (await reponse.json()) as { data?: Record<string, unknown> };
  const vente = (corps.data ?? {}) as Record<string, unknown>;
  const montant = (vente.amount ?? {}) as { value?: unknown; currency?: unknown };

  return {
    // Chaîne vide plutôt que `null` : `mapperStatut` la range en `en_attente`,
    // qui est le seul verdict sûr pour une réponse qu'on n'a pas comprise.
    statut: typeof vente.status === 'string' ? vente.status : '',
    montant: Number(montant.value),
    devise: typeof montant.currency === 'string' ? montant.currency.toUpperCase() : '',
    regleLe: dateDeReglement(vente),
  };
}

/**
 * À qui se rapportent les paiements qu'on veut relire.
 *
 * Un paiement appartient à un compte **ou** à une demande d'ouverture, jamais
 * aux deux — c'est la contrainte `paiements_rattachement`. Les deux cas passent
 * par la même requête plutôt que par deux fonctions jumelles : la fenêtre de
 * rattrapage et la liste de colonnes sont ce qui compte ici, et deux copies
 * finiraient par n'en garder qu'une à jour.
 */
export type Cible = { collecteur: string } | { demande: string };

/**
 * Les paiements qu'il vaut la peine de relire : ceux en attente, et ceux
 * refusés depuis moins de quatorze jours.
 *
 * La cible peut être un compte — le renouvellement d'un collecteur — ou une
 * demande d'ouverture, dont le paiement précède le compte et n'en porte donc
 * aucun.
 *
 * `remise_pct`, `collecteur_id` et `demande_id` font partie de la sélection.
 * Sans le premier, le contrôle de grille de `reconcilier` écrirait une anomalie
 * à chaque paiement remisé, et la vraie divergence de boutique se perdrait dans
 * le bruit. Sans les deux autres, la réconciliation ne saurait pas à qui le
 * règlement profite.
 */
export async function chargerPaiementsRattrapables(
  clientService: SupabaseClient,
  cible: Cible,
): Promise<PaiementEnCours[]> {
  const depuis = new Date(Date.now() - JOURS_RATTRAPAGE * 86_400_000).toISOString();

  const [colonne, valeur] =
    'collecteur' in cible ? ['collecteur_id', cible.collecteur] : ['demande_id', cible.demande];

  const { data, error } = await clientService
    .from('paiements_abonnement')
    .select('id, palier, vente_id, montant, devise, remise_pct, collecteur_id, demande_id, cree_le')
    .eq(colonne, valeur)
    .in('statut', ['en_attente', 'echoue'])
    .gte('cree_le', depuis)
    .order('cree_le', { ascending: true })
    .limit(LOT_MAX);

  if (error) throw new Error(error.message);

  // `montant` arrive en chaîne : PostgREST rend `numeric` en texte pour ne pas
  // perdre de décimale au passage par JSON. `montantCoherent` compare des
  // nombres, et une chaîne y serait toujours différente.
  return ((data ?? []) as PaiementEnCours[]).map((p) => ({
    ...p,
    montant: Number(p.montant),
    remise_pct: Number(p.remise_pct),
  }));
}

export function creerDepot(
  clientService: SupabaseClient,
  options: OptionsChariow,
  ouvrirCompte: OuvrirCompte = refuserOuverture,
): Depot {
  return {
    lireVente: (venteId) => lireVenteChariow(venteId, options),

    ouvrirCompte,

    crediter: async (paiementId, regleLe, montant, devise, collecteur) => {
      const { data, error } = await clientService.rpc('crediter_abonnement', {
        p_paiement: paiementId,
        p_regle_le: regleLe,
        p_montant: montant,
        p_devise: devise,
        p_collecteur: collecteur,
      });
      if (error) throw new Error(error.message);
      const ligne = (data as Array<{ credite: boolean; echeance: string | null }>)?.[0];
      return { credite: ligne?.credite === true, echeance: ligne?.echeance ?? null };
    },

    marquer: async (paiementId, statut: StatutPaiement) => {
      const { error } = await clientService
        .from('paiements_abonnement')
        .update({ statut })
        .eq('id', paiementId);
      // Un refus du déclencheur d'immuabilité signifie que la ligne est déjà
      // terminale : ce n'est pas une erreur, c'est une course perdue contre le
      // webhook ou une autre ouverture d'application.
      if (error && !error.message.includes('PAIEMENT_TERMINAL')) {
        throw new Error(error.message);
      }
    },

    journaliser: (message) => console.error('[Abonnement]', message),
  };
}

/* --------------------------- La création d'une vente ---------------------- */

/**
 * Ce qu'il faut savoir pour ouvrir un paiement chez Chariow.
 *
 * Aucun montant. C'est la propriété centrale du dispositif, et elle tient à ce
 * qui **n'est pas** dans cette structure : Chariow débite le prix du produit
 * configuré dans sa boutique, et un code de remise est le seul moyen de le
 * réduire (`Docs/Chariow.md` §3.1). Un appelant — Edge Function comme
 * téléphone — ne peut donc pas fixer ce qui sera prélevé.
 */
export interface SaisieVente {
  produitId: string;
  email: string;
  prenom: string;
  nomFamille: string;
  telephone: TelephoneChariow;
  /** Absent plutôt que nul : Chariow valide la présence de la clé. */
  codeRemise?: string | null;
  urlRetour: string;
  metadonnees: Record<string, unknown>;
}

export type IssueVente =
  | { ok: true; venteId: string; checkoutUrl: string; montant: number; devise: string }
  | { ok: false; erreur: string; statut: number };

/**
 * Ouvre une vente, et ne rend un lien que si la réponse est complète.
 *
 * Les deux chemins de paiement s'en servent — le renouvellement d'un collecteur
 * et la première souscription d'un prospect. Ils ne diffèrent que par ce qu'ils
 * mettent dans `metadonnees` ; tout le reste, y compris la manière de refuser,
 * doit être identique. Recopié, ce bloc aurait donné deux façons de traiter une
 * réponse incomplète, et l'une des deux aurait fini par rediriger quand même.
 *
 * **Jamais de redirection sur une réponse incomplète.** Un lien manquant ou un
 * identifiant de vente absent renvoient `CHECKOUT_INCOMPLET` : mieux vaut un
 * refus lisible qu'un payeur envoyé sur une page qui n'existe pas, ou une vente
 * réglée que nous ne saurions rattacher à personne.
 *
 * Le montant et la devise viennent de la **réponse**, jamais de la grille : la
 * réconciliation comparera le débit réel à ce qui est enregistré, et enregistrer
 * ce que nous espérions plutôt que ce que la boutique a dit ferait de ce
 * contrôle une tautologie.
 */
/**
 * Ce que veut dire un refus de Chariow, statut par statut.
 *
 * ## Le défaut que ceci corrige, mesuré le 2026-09-04
 *
 * Seul `422` était distingué ; tout le reste devenait `CHECKOUT_IMPOSSIBLE`,
 * dont le message dit « le service ne répond pas, réessaie dans un moment ».
 * Un collecteur a donc lu ça devant une clé d'API refusée — un cas où réessayer
 * ne changera jamais rien, et où la personne capable d'agir n'est pas prévenue.
 *
 * La documentation du fournisseur nomme trois refus, et ils n'appellent pas la
 * même personne :
 *
 * | Statut | Ce que Chariow dit | Qui peut corriger |
 * |---|---|---|
 * | `401` | `Unauthorised` — clé absente ou invalide | GTCS, dans les secrets |
 * | `404` | `Product not found` — identifiant inconnu **ou produit non publié** | GTCS, dans la boutique |
 * | `422` | saisie refusée | celui qui paie |
 *
 * Le `404` est le plus traître : un produit créé mais laissé en brouillon rend
 * exactement la même chose qu'un identifiant faux, et l'ancien code traduisait
 * les deux en « le service ne répond pas ».
 *
 * Ce que l'utilisateur lit ne dit jamais laquelle des deux configurations
 * cloche — il n'a pas à le savoir, et l'écrire à l'écran renseignerait un
 * inconnu sur l'état de notre boutique. Le journal, lui, porte le statut et le
 * corps de la réponse.
 */
export function refusDeChariow(statut: number): IssueVente {
  if (statut === 401 || statut === 403) {
    return { ok: false, erreur: 'CLE_CHARIOW_REFUSEE', statut: 500 };
  }
  if (statut === 404) {
    return { ok: false, erreur: 'PRODUIT_INTROUVABLE', statut: 500 };
  }
  if (statut === 422) {
    return { ok: false, erreur: 'SAISIE_REFUSEE', statut: 400 };
  }
  // Tout le reste — 5xx, 429, un statut qu'ils ajouteraient demain. Celui-là
  // seul mérite « réessaie » : c'est le seul où réessayer peut marcher.
  return { ok: false, erreur: 'CHECKOUT_IMPOSSIBLE', statut: 502 };
}

export async function creerVenteChariow(
  saisie: SaisieVente,
  options: OptionsChariow,
): Promise<IssueVente> {
  let appel: Response;
  try {
    appel = await fetch(`${options.racine}/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.cleApi}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        product_id: saisie.produitId,
        email: saisie.email,
        first_name: saisie.prenom,
        last_name: saisie.nomFamille,
        phone: saisie.telephone,
        ...(saisie.codeRemise ? { discount_code: saisie.codeRemise } : {}),
        redirect_url: saisie.urlRetour,
        custom_metadata: saisie.metadonnees,
      }),
    });
  } catch (cause) {
    console.error('[Abonnement] checkout :', cause instanceof Error ? cause.message : cause);
    return { ok: false, erreur: 'CHECKOUT_IMPOSSIBLE', statut: 502 };
  }

  if (!appel.ok) {
    const detail = await appel.text().catch(() => '');
    console.error('[Abonnement] checkout refusé :', appel.status, detail.slice(0, 300));
    return refusDeChariow(appel.status);
  }

  let corps: {
    data?: {
      purchase?: { id?: unknown; amount?: { value?: unknown; currency?: unknown } };
      payment?: { checkout_url?: unknown };
    };
  };
  try {
    corps = await appel.json();
  } catch {
    console.error('[Abonnement] réponse de checkout illisible');
    return { ok: false, erreur: 'CHECKOUT_INCOMPLET', statut: 502 };
  }

  const vente = corps.data?.purchase ?? {};
  const lien = corps.data?.payment?.checkout_url;
  const montant = Number(vente.amount?.value);
  const devise =
    typeof vente.amount?.currency === 'string' ? vente.amount.currency.toUpperCase() : '';

  if (typeof vente.id !== 'string' || !vente.id || typeof lien !== 'string' || !lien) {
    console.error('[Abonnement] réponse de checkout incomplète');
    return { ok: false, erreur: 'CHECKOUT_INCOMPLET', statut: 502 };
  }

  if (!Number.isFinite(montant) || !/^[A-Z]{3}$/.test(devise)) {
    console.error('[Abonnement] montant ou devise illisibles dans la réponse');
    return { ok: false, erreur: 'CHECKOUT_INCOMPLET', statut: 502 };
  }

  return { ok: true, venteId: vente.id, checkoutUrl: lien, montant, devise };
}

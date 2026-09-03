import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { StatutPaiement } from './chariow.ts';
import type { Depot, PaiementEnCours, VenteDistante } from './reconciliation.ts';

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
 * Les paiements qu'il vaut la peine de relire : ceux en attente, et ceux
 * refusés depuis moins de quatorze jours.
 *
 * `remise_pct`, `collecteur_id` et `demande_id` font partie de la sélection.
 * Sans le premier, le contrôle de grille de `reconcilier` écrirait une anomalie
 * à chaque paiement remisé, et la vraie divergence de boutique se perdrait dans
 * le bruit. Sans les deux autres, la réconciliation ne saurait pas à qui le
 * règlement profite.
 */
export async function chargerPaiementsRattrapables(
  clientService: SupabaseClient,
  collecteurId: string,
): Promise<PaiementEnCours[]> {
  const depuis = new Date(Date.now() - JOURS_RATTRAPAGE * 86_400_000).toISOString();

  const { data, error } = await clientService
    .from('paiements_abonnement')
    .select('id, palier, vente_id, montant, devise, remise_pct, collecteur_id, demande_id, cree_le')
    .eq('collecteur_id', collecteurId)
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

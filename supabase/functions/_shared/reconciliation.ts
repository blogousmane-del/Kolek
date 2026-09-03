import { mapperStatut, montantCoherent, type StatutPaiement } from './chariow.ts';
import { tarifParCle } from './paliers.ts';

/**
 * Le cœur du fulfilment, appelé par les trois chemins : le retour de paiement,
 * le webhook, et l'ouverture de l'application.
 *
 * Ses effets de bord sont **injectés** — lire une vente chez le fournisseur,
 * ouvrir un compte, créditer en base. C'est ce qui rend testables sans réseau
 * les seules décisions qui comptent : créditer ou non, avec quelle date, à quel
 * montant, au profit de qui. La leçon vient du défaut CORS du 2026-08-20 : ce
 * qui n'est pas testable finit par être faux.
 *
 * ## Ce que l'amendement « payer vaut accord » ajoute ici
 *
 * Un paiement peut arriver **sans compte**, parce qu'il règle une demande
 * d'ouverture. C'est alors ce module qui fait naître le compte, et l'ordre est
 * le sujet : la vente est d'abord reconnue réglée et cohérente, le compte
 * ouvert ensuite, le crédit en dernier. Un compte sans abonnement se répare à
 * la main ; un abonnement crédité sans compte ne se rattache à rien, et la
 * somme encaissée n'appartient plus à personne.
 */

export interface PaiementEnCours {
  id: string;
  palier: string;
  vente_id: string;
  montant: number;
  devise: string;
  /** La remise portée par ce paiement, pas celle que la fiche porte aujourd'hui. */
  remise_pct: number;
  /** Nul tant que le compte n'existe pas — cas d'une demande d'ouverture. */
  collecteur_id: string | null;
  /** La demande d'origine, quand ce paiement en règle une. */
  demande_id: string | null;
  /** Sert de date de règlement de repli. Jamais `now()`. */
  cree_le: string;
}

export interface VenteDistante {
  statut: string;
  montant: number;
  devise: string;
  /** `settled_at`, `paid_at` ou `completed_at` selon la version. */
  regleLe: string | null;
}

export interface Depot {
  lireVente: (venteId: string) => Promise<VenteDistante>;
  /**
   * Crée le compte d'un prospect qui vient de payer, et rend son identifiant.
   *
   * La ligne `auth.users` ne se fabrique pas en SQL : c'est l'appelant qui la
   * crée, à partir de la demande d'ouverture, puis nomme le compte au crédit.
   */
  ouvrirCompte: (paiement: PaiementEnCours) => Promise<string>;
  crediter: (
    paiementId: string,
    regleLe: string,
    montant: number,
    devise: string,
    /** Le compte fraîchement ouvert ; nul pour un renouvellement. */
    collecteur: string | null,
  ) => Promise<{ credite: boolean; echeance: string | null }>;
  marquer: (paiementId: string, statut: StatutPaiement) => Promise<void>;
  journaliser: (message: string) => void;
}

export interface ResultatReconciliation {
  credites: number;
  enAttente: number;
  /** La dernière échéance obtenue, pour que l'écran de retour l'affiche. */
  echeance: string | null;
}

export async function reconcilier(
  paiements: PaiementEnCours[],
  depot: Depot,
): Promise<ResultatReconciliation> {
  let credites = 0;
  let enAttente = 0;
  let echeance: string | null = null;

  for (const paiement of paiements) {
    let vente: VenteDistante;
    try {
      vente = await depot.lireVente(paiement.vente_id);
    } catch (cause) {
      // Une panne de lecture n'est pas un échec de paiement : on laisse la ligne
      // en attente et on continue la liste.
      depot.journaliser(
        `lecture de ${paiement.vente_id} impossible : ${cause instanceof Error ? cause.message : 'inconnue'}`,
      );
      enAttente += 1;
      continue;
    }

    const statut = mapperStatut(vente.statut);

    if (statut !== 'regle') {
      if (statut === 'en_attente') {
        enAttente += 1;
      } else {
        await depot.marquer(paiement.id, statut);
      }
      continue;
    }

    // Contrôle principal : le montant relu contre celui enregistré à la
    // création de la vente. Un écart ne crédite pas.
    if (!montantCoherent(vente.montant, paiement.montant)) {
      depot.journaliser(
        `ANOMALIE montant — NON crédité : vente ${paiement.vente_id}, ` +
          `attendu ${paiement.montant} ${paiement.devise}, reçu ${vente.montant} ${vente.devise}`,
      );
      enAttente += 1;
      continue;
    }

    // Contrôle secondaire, purement informatif : l'écart avec la grille
    // tarifaire. Il détecte une boutique dont le prix a divergé. Il avertit et
    // ne bloque pas — le collecteur n'y est pour rien, et refuser après un
    // débit serait le punir d'une erreur de configuration de GTCS.
    if (vente.devise === 'XOF') {
      try {
        // Le prix de la grille, diminué de la remise **portée par le paiement**
        // — pas de celle que la fiche porte aujourd'hui. Sans ce calcul, chaque
        // paiement remisé écrirait une anomalie de grille parfaitement normale,
        // et le jour où la boutique Chariow divergerait vraiment, la ligne se
        // perdrait dans le bruit qu'on aurait appris à ignorer.
        //
        // `Math.round` : Chariow applique un pourcentage sur un entier en FCFA
        // et arrondit ; 15 000 à -20 % fait 12 000, mais 15 000 à -33 % fait
        // 10 050 chez eux et 10 050,0000001 ici si on ne borne pas.
        const plein = tarifParCle(paiement.palier).prix;
        const attendu = Math.round((plein * (100 - paiement.remise_pct)) / 100);
        if (vente.montant !== attendu) {
          depot.journaliser(
            `GRILLE — le produit ${paiement.palier} a débité ${vente.montant} XOF ` +
              `au lieu de ${attendu} XOF (grille ${plein}, remise ${paiement.remise_pct} %). ` +
              `Aligner la boutique Chariow sur la grille.`,
          );
        }
      } catch {
        depot.journaliser(`GRILLE — palier inconnu en base : ${paiement.palier}`);
      }
    }

    // --- À qui ce règlement profite-t-il ? ---
    //
    // Trois états possibles, et le troisième ne devrait pas exister.
    let compte: string | null = null;

    if (paiement.collecteur_id === null) {
      if (paiement.demande_id === null) {
        // La contrainte `paiements_rattachement` interdit cet état en base.
        // S'il arrive quand même ici, créditer reviendrait à encaisser sans
        // savoir qui servir. On ne le compte ni comme crédité ni comme en
        // attente : aucun passage suivant ne le résoudra, c'est une ligne à
        // regarder à la main.
        depot.journaliser(
          `ORPHELIN — paiement ${paiement.id} rattaché ni à un compte ni à une demande, NON crédité`,
        );
        continue;
      }

      // Le prospect a payé : son compte naît maintenant. Avant le crédit, et
      // seulement après que la vente a été reconnue réglée et cohérente —
      // personne ne reçoit de compte pour un paiement qui n'a pas abouti.
      try {
        compte = await depot.ouvrirCompte(paiement);
      } catch (cause) {
        depot.journaliser(
          `OUVERTURE — compte impossible pour la demande ${paiement.demande_id} : ` +
            `${cause instanceof Error ? cause.message : 'inconnue'} — NON crédité`,
        );
        enAttente += 1;
        continue;
      }
    }

    // La date vient du fournisseur, à défaut de la création du paiement.
    // Jamais `now()` : un rattrapage inscrirait la recette au mauvais jour.
    const regleLe = vente.regleLe ?? paiement.cree_le;

    const { credite, echeance: obtenue } = await depot.crediter(
      paiement.id,
      regleLe,
      vente.montant,
      vente.devise,
      compte,
    );

    if (credite) {
      credites += 1;
      echeance = obtenue ?? echeance;
    }
  }

  return { credites, enAttente, echeance };
}

import { describe, expect, it, vi } from 'vitest';

import { reconcilier, type Depot, type PaiementEnCours } from '../functions/_shared/reconciliation';

/**
 * Ce module décide de créditer ou non. Il est écrit avec ses effets de bord
 * injectés — lire une vente, ouvrir un compte, créditer — pour que ces
 * décisions soient testables sans réseau et sans base.
 *
 * Les trois cas qui comptent, et qui viennent tous d'incidents réels
 * documentés dans `Docs/Chariow.md` §10 :
 *   1. un statut non réglé ne crédite jamais ;
 *   2. un montant qui a bougé ne crédite pas, et se journalise ;
 *   3. la date de règlement vient du fournisseur, jamais de l'horloge locale.
 *
 * S'y ajoute depuis l'amendement « payer vaut accord » du 2026-09-02 : un
 * paiement peut arriver ici **sans compte**, parce qu'il règle une demande
 * d'ouverture. C'est alors la réconciliation qui fait naître le compte, et
 * l'ordre est le sujet — un compte sans abonnement se répare, un abonnement
 * sans compte ne se rattache à rien.
 */

function paiement(sur: Partial<PaiementEnCours> = {}): PaiementEnCours {
  return {
    id: 'p1',
    palier: 'pro',
    vente_id: 'vente-1',
    montant: 5000,
    devise: 'XOF',
    remise_pct: 0,
    collecteur_id: 'c1',
    demande_id: null,
    cree_le: '2026-08-20T08:00:00Z',
    ...sur,
  };
}

/** Le même paiement, mais né d'une demande d'ouverture : pas encore de compte. */
function prospect(sur: Partial<PaiementEnCours> = {}): PaiementEnCours {
  return paiement({ collecteur_id: null, demande_id: 'd1', ...sur });
}

function depot(sur: Partial<Depot> = {}): Depot {
  return {
    lireVente: vi.fn(async () => ({
      statut: 'settled',
      montant: 5000,
      devise: 'XOF',
      regleLe: '2026-08-21T20:04:00Z',
    })),
    ouvrirCompte: vi.fn(async () => 'compte-neuf'),
    crediter: vi.fn(async () => ({ credite: true, echeance: '2026-09-21' })),
    marquer: vi.fn(async () => {}),
    journaliser: vi.fn(),
    ...sur,
  };
}

describe('reconcilier', () => {
  it('crédite une vente réglée, avec la date du fournisseur', async () => {
    const d = depot();
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(1);
    expect(resultat.echeance).toBe('2026-09-21');
    expect(d.crediter).toHaveBeenCalledWith('p1', '2026-08-21T20:04:00Z', 5000, 'XOF', null);
  });

  it('retombe sur la date de création quand le fournisseur n’en donne pas', async () => {
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'settled',
        montant: 5000,
        devise: 'XOF',
        regleLe: null,
      })),
    });
    await reconcilier([paiement()], d);

    // Jamais `now()` : un rattrapage inscrirait la recette au mauvais jour.
    expect(d.crediter).toHaveBeenCalledWith('p1', '2026-08-20T08:00:00Z', 5000, 'XOF', null);
  });

  it('ne crédite pas une vente encore impayée', async () => {
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'unpaid',
        montant: 5000,
        devise: 'XOF',
        regleLe: null,
      })),
    });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(0);
    expect(resultat.enAttente).toBe(1);
    expect(d.crediter).not.toHaveBeenCalled();
  });

  it('marque un échec sans créditer', async () => {
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'failed',
        montant: 5000,
        devise: 'XOF',
        regleLe: null,
      })),
    });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(0);
    expect(d.marquer).toHaveBeenCalledWith('p1', 'echoue');
    expect(d.crediter).not.toHaveBeenCalled();
  });

  it('refuse de créditer un montant qui a bougé au-delà de la tolérance', async () => {
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'settled',
        montant: 500,
        devise: 'XOF',
        regleLe: '2026-08-21T20:04:00Z',
      })),
    });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(0);
    expect(d.crediter).not.toHaveBeenCalled();
    expect(d.journaliser).toHaveBeenCalledWith(expect.stringContaining('ANOMALIE montant'));
  });

  it('avertit sans bloquer quand le montant s’écarte de la grille en FCFA', async () => {
    // 4900 contre 5000 stocké : dans la tolérance. Mais la grille dit 5000.
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'settled',
        montant: 4900,
        devise: 'XOF',
        regleLe: '2026-08-21T20:04:00Z',
      })),
    });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(1);
    expect(d.journaliser).toHaveBeenCalledWith(expect.stringContaining('GRILLE'));
  });

  it('ne crie pas à la grille quand la remise explique l’écart', async () => {
    // Sans ce calcul, chaque paiement remisé écrirait une anomalie parfaitement
    // normale — et le jour où la boutique divergerait vraiment, la ligne se
    // perdrait dans le bruit qu'on aurait appris à ignorer.
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'settled',
        montant: 4000,
        devise: 'XOF',
        regleLe: '2026-08-21T20:04:00Z',
      })),
    });
    const resultat = await reconcilier([paiement({ montant: 4000, remise_pct: 20 })], d);

    expect(resultat.credites).toBe(1);
    expect(d.journaliser).not.toHaveBeenCalled();
  });

  it('ne compte pas deux fois un paiement que la base a déjà crédité', async () => {
    const d = depot({ crediter: vi.fn(async () => ({ credite: false, echeance: null })) });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(0);
  });

  it('continue la liste quand une lecture échoue', async () => {
    const d = depot({
      lireVente: vi.fn(async (venteId: string) => {
        if (venteId === 'vente-1') throw new Error('réseau');
        return { statut: 'settled', montant: 5000, devise: 'XOF', regleLe: null };
      }),
    });
    const resultat = await reconcilier([paiement(), paiement({ id: 'p2', vente_id: 'vente-2' })], d);

    expect(resultat.credites).toBe(1);
    expect(resultat.enAttente).toBe(1);
  });

  describe('payer vaut accord — le compte naît ici', () => {
    it('ouvre le compte, puis crédite en le nommant', async () => {
      const d = depot();
      const resultat = await reconcilier([prospect()], d);

      expect(d.ouvrirCompte).toHaveBeenCalledTimes(1);
      expect(resultat.credites).toBe(1);
      expect(d.crediter).toHaveBeenCalledWith(
        'p1',
        '2026-08-21T20:04:00Z',
        5000,
        'XOF',
        'compte-neuf',
      );
    });

    it('ne crédite pas quand l’ouverture du compte échoue', async () => {
      // L'ordre est le sujet. Un compte sans abonnement se répare à la main ;
      // un abonnement crédité sans compte ne se rattache à rien, et la somme
      // encaissée n'appartient plus à personne.
      const d = depot({
        ouvrirCompte: vi.fn(async () => {
          throw new Error('adresse déjà prise');
        }),
      });
      const resultat = await reconcilier([prospect()], d);

      expect(resultat.credites).toBe(0);
      expect(resultat.enAttente).toBe(1);
      expect(d.crediter).not.toHaveBeenCalled();
      expect(d.journaliser).toHaveBeenCalledWith(expect.stringContaining('OUVERTURE'));
    });

    it('n’ouvre pas de second compte pour un paiement déjà rattaché', async () => {
      // Une demande servie porte les deux : sa demande d'origine et le compte
      // qu'elle a fait naître. Une seconde réconciliation ne doit pas relire
      // « demande_id présent » comme « compte à créer ».
      const d = depot();
      await reconcilier([paiement({ demande_id: 'd1' })], d);

      expect(d.ouvrirCompte).not.toHaveBeenCalled();
      expect(d.crediter).toHaveBeenCalledWith('p1', '2026-08-21T20:04:00Z', 5000, 'XOF', null);
    });

    it('n’ouvre aucun compte pour une vente qui n’est pas réglée', async () => {
      // Le contrôle du règlement précède la création : personne ne reçoit de
      // compte pour un paiement qui n'a pas abouti.
      const d = depot({
        lireVente: vi.fn(async () => ({
          statut: 'unpaid',
          montant: 5000,
          devise: 'XOF',
          regleLe: null,
        })),
      });
      await reconcilier([prospect()], d);

      expect(d.ouvrirCompte).not.toHaveBeenCalled();
    });

    it('n’ouvre aucun compte quand le montant relu a bougé', async () => {
      const d = depot({
        lireVente: vi.fn(async () => ({
          statut: 'settled',
          montant: 500,
          devise: 'XOF',
          regleLe: '2026-08-21T20:04:00Z',
        })),
      });
      await reconcilier([prospect()], d);

      expect(d.ouvrirCompte).not.toHaveBeenCalled();
      expect(d.crediter).not.toHaveBeenCalled();
    });

    it('refuse un paiement qui n’est rattaché à rien', async () => {
      // La contrainte `paiements_rattachement` l'interdit en base. Si une ligne
      // pareille arrive quand même ici, la traiter reviendrait à créditer un
      // abonnement sans savoir à qui.
      const d = depot();
      const resultat = await reconcilier([paiement({ collecteur_id: null, demande_id: null })], d);

      expect(resultat.credites).toBe(0);
      expect(d.ouvrirCompte).not.toHaveBeenCalled();
      expect(d.crediter).not.toHaveBeenCalled();
      expect(d.journaliser).toHaveBeenCalledWith(expect.stringContaining('ORPHELIN'));
    });
  });
});

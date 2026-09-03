import { describe, expect, it } from 'vitest';

import { dernierPaiement } from './Abonnements';
import type { VueGlobale } from '../donnees';

/**
 * Trois états se ressemblent à l'écran et ne veulent pas dire la même chose :
 * GTCS n'a pas pu lire les paiements, ce collecteur n'a jamais payé, ou voici
 * sa dernière facture. Confondre les deux premiers ferait passer une panne
 * d'agrégation pour un impayé — et personne ne va réclamer une somme déjà
 * reçue.
 */

function paiements(
  lignes: Array<{ collecteur_id: string; dernier_le: string; dernier_montant: number; derniere_devise: string }>,
): VueGlobale['paiements'] {
  return { total_30j: 0, nombre_30j: 0, par_collecteur: lignes };
}

describe('dernierPaiement', () => {
  it('dit « indisponible » quand l’agrégation a échoué', () => {
    expect(dernierPaiement(null, 'c1')).toBe('indisponible');
  });

  it('dit « jamais » pour un collecteur absent de la liste', () => {
    expect(dernierPaiement(paiements([]), 'c1')).toBe('jamais');
  });

  it('rend la date et le montant du dernier règlement', () => {
    const rendu = dernierPaiement(
      paiements([
        {
          collecteur_id: 'c1',
          dernier_le: '2026-08-21T20:04:00Z',
          dernier_montant: 5000,
          derniere_devise: 'XOF',
        },
      ]),
      'c1',
    );

    expect(rendu).toContain('2026');
    expect(rendu).toContain('FCFA');
    // `formatMontant` sépare les milliers par une espace insécable — comparer
    // sur « 5 000 » avec une espace ordinaire ferait échouer sans rien dire.
    expect(rendu).toContain('5 000');
  });

  it('laisse passer une devise que la grille ne connaît pas', () => {
    // `XOF` s'écrit « FCFA » pour le lecteur. Toute autre devise se rend telle
    // quelle plutôt que d'être tue : un montant sans unité ne se vérifie pas.
    const rendu = dernierPaiement(
      paiements([
        {
          collecteur_id: 'c1',
          dernier_le: '2026-08-21T20:04:00Z',
          dernier_montant: 12,
          derniere_devise: 'EUR',
        },
      ]),
      'c1',
    );

    expect(rendu).toContain('EUR');
  });
});

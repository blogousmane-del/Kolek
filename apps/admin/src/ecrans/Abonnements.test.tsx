import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TAILLE_PAGE } from '@kolek/ui';
import { afterEach, describe, expect, it } from 'vitest';

import { Abonnements, dernierPaiement } from './Abonnements';
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

/**
 * La pagination du tableau des abonnés.
 *
 * Même liste que l'écran « Collecteurs », vue sous l'angle de la facturation —
 * et donc les mêmes raisons de paginer : quelques dizaines de comptes
 * aujourd'hui, rien de visible sous cinquante lignes, mais « borné par le
 * modèle d'affaires » est une hypothèse commerciale et non une contrainte
 * technique.
 *
 * Ce tableau n'a ni recherche ni filtre : il n'y a donc rien à ramener au début
 * ici, contrairement aux trois autres. L'export, lui, continue d'écrire
 * `vue.collecteurs` en entier — c'est le fichier des relances, et une page ne
 * relance personne.
 */
describe('pagination du tableau des abonnés', () => {
  /** `n` abonnés numérotés, pour que l'ordre de lecture se lise à l'œil nu. */
  const abonnes = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const rang = String(i + 1).padStart(3, '0');
      return {
        id: `id-${rang}`,
        nom: `Abonne ${rang}`,
        telephone: '+2250700000009',
        zone: 'Cocody',
        palier: 'pro',
        abonnement_statut: 'actif',
        abonnement_echeance: '2026-12-31',
        cree_le: '2026-06-12T09:00:00Z',
        clients: 1,
        cartes_actives: 1,
        encaisse: 0,
        commissions: 0,
        restitutions: 0,
        encours: 0,
      };
    });

  const rendre = (liste: ReturnType<typeof abonnes>) =>
    render(
      <Abonnements
        vue={
          {
            collecteurs: liste,
            abonnements: {
              mrr: 0,
              collecteurs_actifs: liste.length,
              collecteurs_total: liste.length,
              expirations_ce_mois: 0,
              expirations_a_venir_30j: 0,
              suspendus: 0,
              expires: 0,
              parPalier: [],
            },
            paiements: null,
          } as unknown as VueGlobale
        }
      />,
    );

  /** Une cellule par ligne rendue, et une seule : de quoi les compter. */
  const lignesRendues = () => screen.queryAllByText(/^Abonne \d{3}$/);

  afterEach(cleanup);

  it('ne rend qu’une page de lignes, quelle que soit la longueur du tableau', () => {
    rendre(abonnes(120));

    expect(lignesRendues()).toHaveLength(TAILLE_PAGE);
  });

  it('mène à la page suivante', () => {
    rendre(abonnes(120));

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));

    expect(screen.getByText('Abonne 051')).toBeDefined();
    expect(screen.queryByText('Abonne 001')).toBeNull();
  });

  it('n’affiche aucune commande de page quand tout tient sur une', () => {
    rendre(abonnes(10));

    expect(screen.queryByRole('button', { name: /page suivante/i })).toBeNull();
  });
});

import { formatMontant } from '@kolek/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { VueGlobale } from '../donnees';
import { TableauDeBord } from './TableauDeBord';

/**
 * Ce que ce fichier garde : **aucun montant affiché n'est calculé par l'écran.**
 *
 * La version du 2026-09-05 portait un sélecteur de période au-dessus de tout le
 * tableau de bord, et le faisait agir sur des totaux qui n'ont pas de dimension
 * temporelle — en les multipliant par des coefficients écrits à la main :
 *
 * ```ts
 * case 'aujourdhui': return 0.12;
 * case '7j':         return 0.35;
 * case '30j':        return 0.85;
 * ```
 *
 * « 7 derniers jours » affichait donc 35 % de l'encaissé depuis l'ouverture,
 * présenté comme un montant lu. Rien dans la base ne dit cela ; rien ne pouvait
 * le dire, `agregat_admin` ne rendant qu'un cumul.
 *
 * Le test ne vérifie pas la formule — il n'y en a plus. Il vérifie qu'en
 * changeant la fenêtre, **les montants ne bougent pas**, et que ce qui bouge est
 * la seule chose qui porte une date : la liste des mouvements.
 */

const MAINTENANT = new Date();
const ancien = new Date(MAINTENANT.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
const recent = new Date(MAINTENANT.getTime() - 2 * 60 * 60 * 1000).toISOString();

const VUE: VueGlobale = {
  genereLe: MAINTENANT.toISOString(),
  abonnements: {
    collecteurs_total: 10,
    collecteurs_actifs: 8,
    suspendus: 1,
    expires: 1,
    expirations_ce_mois: 1,
    expirations_a_venir_30j: 1,
    mrr: 150000,
    parPalier: [
      {
        palier: 'standard',
        nom: 'Standard',
        prix: 15000,
        limiteClients: 100,
        total: 10,
        actifs: 8,
        mrr: 150000,
      },
    ],
  },
  totaux: {
    clients: 120,
    cartes_actives: 100,
    cartes_total: 130,
    mises: 900,
    total_encaisse: 7_654_000,
    commissions: 654_000,
    restitutions: 3_210_000,
    encours_clients: 1_234_000,
  },
  zones: [{ zone: 'Cocody', collecteurs: 2, clients: 60, encaisse: 4_000_000 }],
  collecteurs: [],
  mouvements: [
    {
      type: 'mise',
      client: 'Koffi Amenan',
      collecteur_id: 'c-1',
      collecteur: 'Kouassi',
      montant: 5000,
      survenu_le: recent,
    },
    {
      type: 'mise',
      client: 'Touré Bakary',
      collecteur_id: 'c-2',
      collecteur: 'Yao',
      montant: 2000,
      survenu_le: ancien,
    },
  ],
  cartes: [],
  cartes_total_lignes: 0,
  paiements: null,
};

afterEach(cleanup);

/**
 * `formatMontant` sépare les milliers par une **espace insécable** (U+00A0),
 * délibérément — un montant coupé en fin de ligne se lit comme deux montants.
 * Testing Library, lui, normalise le texte du DOM avant de comparer et remplace
 * l'insécable par une espace ordinaire, sans toucher à la chaîne cherchée. Sans
 * cette conversion, la recherche échoue sur deux caractères invisibles.
 */
function montantAffiche(valeur: number): string {
  return formatMontant(valeur).replace(/\s/g, ' ');
}

function rendre() {
  return render(<TableauDeBord vue={VUE} onNaviguer={() => {}} onRecharger={() => {}} />);
}

describe('TableauDeBord — les montants viennent de la vue, pas de l’écran', () => {
  it('affiche les totaux tels que la base les rend', () => {
    rendre();
    expect(screen.getByText(montantAffiche(7_654_000))).toBeTruthy();
    expect(screen.getByText(montantAffiche(1_234_000))).toBeTruthy();
    expect(screen.getByText(montantAffiche(654_000))).toBeTruthy();
  });

  it('changer la fenêtre de temps ne déplace aucun montant', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: '7 j' }));

    expect(screen.getByText(montantAffiche(7_654_000))).toBeTruthy();
    expect(screen.getByText(montantAffiche(1_234_000))).toBeTruthy();
    expect(screen.getByText(montantAffiche(654_000))).toBeTruthy();
  });

  it('la fenêtre de temps filtre les mouvements, qui sont les seuls datés', () => {
    rendre();
    expect(screen.getByText('Koffi Amenan')).toBeTruthy();
    expect(screen.getByText('Touré Bakary')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '7 j' }));

    expect(screen.getByText('Koffi Amenan')).toBeTruthy();
    expect(screen.queryByText('Touré Bakary')).toBeNull();
  });

  it('ne compare rien à hier, puisque la base ne garde pas hier', () => {
    const { container } = rendre();

    // Chercher « +12.4% » ne prouverait rien : n'importe quel autre chiffre
    // inventé passerait. Ce qui se vérifie, c'est la **phrase** que `CarteStat`
    // écrit sous chaque badge de tendance. Tant qu'elle est absente de l'écran,
    // aucune carte ne prétend mesurer une variation — et le jour où une table
    // d'historique existera, c'est ce test qu'il faudra rouvrir en connaissance
    // de cause.
    expect(container.textContent).not.toContain('vs période précédente');
  });

  it('les deux groupes de filtres s’annoncent, et disent lequel est actif', () => {
    rendre();
    expect(screen.getByRole('group', { name: 'Fenêtre de temps' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Type de mouvement' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tout' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '7 j' }).getAttribute('aria-pressed')).toBe('false');
  });
});

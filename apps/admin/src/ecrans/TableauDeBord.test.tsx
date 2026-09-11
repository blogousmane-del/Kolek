import { formatMontant } from '@kolek/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Tendances, VueGlobale } from '../donnees';
import { TableauDeBord } from './TableauDeBord';

/**
 * Ce que ce fichier garde : **aucun montant affiché n'est calculé par l'écran,
 * et aucune comparaison n'est affichée sans passé auquel comparer.**
 *
 * La version du 2026-09-05 portait un sélecteur de période qui multipliait des
 * totaux sans dimension temporelle par des coefficients écrits à la main —
 * 0,12 pour la journée, 0,35 pour sept jours. L'audit du 2026-09-06 les a
 * retirés, et ce fichier a longtemps vérifié que la phrase « vs période
 * précédente » était **absente** de l'écran.
 *
 * **Ce test est rouvert le 2026-09-11, en connaissance de cause.** La base rend
 * désormais les flux datés de la période et ceux de la période précédente
 * (`admin_tendances`), donc la comparaison existe. Ce qui se vérifie a changé
 * de forme, pas de nature :
 *
 * - la phrase apparaît sur les deux cartes de flux, et **seulement** sur elles ;
 * - elle disparaît dès que la période précédente est vide ;
 * - changer de période déplace les flux et **ne touche pas** aux stocks ;
 * - quand la base ne rend pas les tendances, l'écran le dit au lieu d'afficher
 *   des zéros, qui se liraient « aucune activité ».
 */

const MAINTENANT = new Date();
const ancien = new Date(MAINTENANT.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
const recent = new Date(MAINTENANT.getTime() - 2 * 60 * 60 * 1000).toISOString();

const jourISO = (decalage: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
};

const MOUVEMENTS = [
  {
    type: 'mise' as const,
    client: 'Koffi Amenan',
    collecteur_id: 'c-1',
    collecteur: 'Kouassi',
    montant: 5000,
    survenu_le: recent,
  },
  {
    type: 'mise' as const,
    client: 'Touré Bakary',
    collecteur_id: 'c-2',
    collecteur: 'Yao',
    montant: 2000,
    survenu_le: ancien,
  },
];

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
  mouvements: MOUVEMENTS,
  cartes: [],
  cartes_total_lignes: 0,
  paiements: null,
};

/**
 * Sept jours : 1 140 000 encaissés contre 1 000 000 la semaine d'avant, soit
 * +14 %, et 130 000 de commissions contre 100 000, soit +30 %.
 *
 * Les deux variations sont **délibérément différentes**. Des commissions
 * proportionnelles à l'encaissé donnaient deux fois « +14 % » à l'écran, et
 * l'épreuve ne pouvait plus dire si chaque carte lisait bien son propre couple
 * de valeurs — elle échouait d'ailleurs sur deux éléments trouvés pour un.
 */
const TENDANCES: Tendances = {
  periode: { jours: 7, debut: jourISO(-6), fin: jourISO(0) },
  depuis: jourISO(-20),
  flux: { encaisse: 1_140_000, commissions: 130_000, restitutions: 90_000, mises: 228, retraits: 3 },
  flux_precedent: {
    encaisse: 1_000_000,
    commissions: 100_000,
    restitutions: 80_000,
    mises: 200,
    retraits: 2,
  },
  serie: [
    { jour: jourISO(-2), encaisse: 300_000, commissions: 30_000, restitutions: 0, mises: 60 },
    { jour: jourISO(-1), encaisse: 0, commissions: 0, restitutions: 0, mises: 0 },
    { jour: jourISO(0), encaisse: 400_000, commissions: 40_000, restitutions: 90_000, mises: 80 },
  ],
  zones: [{ zone: 'Cocody', encaisse: 700_000, mises: 140, collecteurs: 2 }],
  mouvements: MOUVEMENTS,
  mouvements_total: 228,
  collecteurs_sans_mise: [
    { id: 'c-9', nom: 'Yao Adjoua', zone: 'Yopougon', derniere_mise: jourISO(-12), jours_sans: 12 },
  ],
};

/** Trente jours : 4 000 000 contre 5 000 000, soit une baisse de 20 %. */
const TENDANCES_30: Tendances = {
  ...TENDANCES,
  periode: { jours: 30, debut: jourISO(-29), fin: jourISO(0) },
  flux: { ...TENDANCES.flux, encaisse: 4_000_000 },
  flux_precedent: { ...TENDANCES.flux_precedent, encaisse: 5_000_000 },
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

/** L'écran sans tendances : le cas où la base n'a pas rendu ses flux datés. */
function rendreSansTendances() {
  return render(
    <TableauDeBord
      vue={VUE}
      onNaviguer={() => {}}
      onRecharger={() => {}}
      charger={async () => TENDANCES}
    />,
  );
}

function rendreAvecTendances(charger: (jours: 1 | 7 | 30) => Promise<Tendances> = async () =>
  TENDANCES_30) {
  return render(
    <TableauDeBord
      vue={{ ...VUE, tendances: TENDANCES }}
      onNaviguer={() => {}}
      onRecharger={() => {}}
      charger={charger}
    />,
  );
}

describe('TableauDeBord — les montants viennent de la vue, pas de l’écran', () => {
  it('affiche les cumuls, qui ne dépendent d’aucune période', () => {
    rendreAvecTendances();

    // Le cumul depuis l'ouverture et l'encours à l'instant : deux chiffres que
    // le sélecteur de période ne touche jamais.
    expect(screen.getByText(montantAffiche(7_654_000))).toBeTruthy();
    expect(screen.getByText(montantAffiche(1_234_000))).toBeTruthy();
  });

  it('affiche l’encaissé de la période et sa variation', () => {
    rendreAvecTendances();

    expect(screen.getByText(montantAffiche(1_140_000))).toBeTruthy();
    // Chaque carte lit son propre couple : +14 % pour l'encaissé (1 140 000
    // contre 1 000 000), +30 % pour les commissions (130 000 contre 100 000).
    // L'insécable du libellé est normalisée par Testing Library, la chaîne
    // cherchée porte donc une espace ordinaire.
    expect(screen.getByText('+14 %')).toBeTruthy();
    expect(screen.getByText('+30 %')).toBeTruthy();
    expect(screen.getAllByText('vs période précédente').length).toBe(2);
  });

  it('ne met aucune tendance sur un stock', () => {
    rendreAvecTendances();

    // L'encours est un stock : il n'a pas de période précédente, et sa carte
    // porte une phrase, pas une pastille.
    expect(screen.getByText('Dû aux clients, à l’instant')).toBeTruthy();
  });

  it('retire la pastille quand la période précédente est vide', () => {
    const sansPasse: Tendances = {
      ...TENDANCES,
      flux_precedent: { encaisse: 0, commissions: 0, restitutions: 0, mises: 0, retraits: 0 },
    };
    render(
      <TableauDeBord
        vue={{ ...VUE, tendances: sansPasse }}
        onNaviguer={() => {}}
        onRecharger={() => {}}
        charger={async () => sansPasse}
      />,
    );

    expect(screen.queryByText('vs période précédente')).toBeNull();
    expect(screen.getAllByText(/pas de comparaison/i).length).toBe(2);
  });

  it('change de période et recharge les seules tendances', async () => {
    const appels: number[] = [];
    rendreAvecTendances(async (jours) => {
      appels.push(jours);
      return TENDANCES_30;
    });

    fireEvent.click(screen.getByRole('button', { name: '30 j' }));

    await screen.findByText(montantAffiche(4_000_000));
    expect(appels).toEqual([30]);
    // La baisse : 4 000 000 contre 5 000 000.
    expect(screen.getByText('-20 %')).toBeTruthy();
  });

  it('garde les stocks immobiles quand la période change', async () => {
    rendreAvecTendances();

    fireEvent.click(screen.getByRole('button', { name: '30 j' }));
    await screen.findByText(montantAffiche(4_000_000));

    // L'encours et le cumul viennent de `totaux`, pas de la période.
    expect(screen.getByText(montantAffiche(1_234_000))).toBeTruthy();
    expect(screen.getByText(montantAffiche(7_654_000))).toBeTruthy();
  });

  it('dit quand les tendances manquent, sans afficher de zéros', () => {
    rendreSansTendances();

    expect(screen.getByText(/tendances indisponibles/i)).toBeTruthy();
    // Le reste de l'écran vit : le cumul depuis l'ouverture est là.
    expect(screen.getByText(montantAffiche(7_654_000))).toBeTruthy();
  });

  it('les deux groupes de commandes s’annoncent, et disent lequel est actif', () => {
    rendreAvecTendances();

    expect(screen.getByRole('group', { name: 'Période' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Type de mouvement' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '7 j' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '30 j' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('la recherche filtre les mouvements', () => {
    rendreAvecTendances();

    expect(screen.getByText('Koffi Amenan')).toBeTruthy();
    expect(screen.getByText('Touré Bakary')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Rechercher un client ou un collecteur'), {
      target: { value: 'koffi' },
    });

    expect(screen.getByText('Koffi Amenan')).toBeTruthy();
    expect(screen.queryByText('Touré Bakary')).toBeNull();
  });
});

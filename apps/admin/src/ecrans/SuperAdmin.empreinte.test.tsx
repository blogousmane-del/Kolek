import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CleNavSuper } from '@kolek/ui';

import type { VueGlobale } from '../donnees';
import type { EtatSuperAdmin } from '../superadmin';

/**
 * Échafaudage. **À supprimer à la fin du découpage** — voir la tâche 9 de
 * `Docs/plans/2026-09-10-superadmin-decoupe.md`.
 *
 * ## Ce que ce fichier prouve, et pourquoi il ne survit pas
 *
 * Le découpage de `SuperAdmin.tsx` est un déplacement de texte. « Déplacement
 * de texte » est une affirmation, et ces empreintes la transforment en mesure :
 * le DOM rendu de chaque onglet, avant et après, au caractère près.
 *
 * Une empreinte qui diffère est un **défaut**, jamais une empreinte à mettre à
 * jour. `vitest -u` est interdit tant que ce fichier vit.
 *
 * Il ne survit pas au découpage, et c'est délibéré. Une empreinte de six écrans
 * entiers casse à chaque changement légitime ; gardée, elle apprendrait à faire
 * `-u` sans lire. C'est un outil de transformation, pas un filet de sécurité —
 * le filet, ce sont les `describe` de `SuperAdmin.test.tsx`.
 *
 * Les bouchons et le jeu de données sont **recopiés** de `SuperAdmin.test.tsx`
 * plutôt qu'importés : ce fichier meurt à la tâche 9, et un module partagé lui
 * survivrait.
 */

const agirSuperAdmin = vi.fn();
const chargerJournal = vi.fn();
const recharger = vi.fn();
const utiliserEtat = vi.fn();
const modifierCollecteur = vi.fn();

vi.mock('../donnees', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  modifierCollecteur: (...args: unknown[]) => modifierCollecteur(...args),
}));

vi.mock('../superadmin', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useEtatSuperAdmin: () => utiliserEtat(),
  agirSuperAdmin: (...args: unknown[]) => agirSuperAdmin(...args),
  chargerJournal: (...args: unknown[]) => chargerJournal(...args),
}));

const { SuperAdmin } = await import('./SuperAdmin');

const MOI = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';

const ETAT: EtatSuperAdmin = {
  genere_le: '2026-08-30T08:00:00Z',
  appelant: MOI,
  administrateurs: [
    {
      user_id: MOI,
      niveau: 'super',
      nom: 'Aya Konan',
      telephone: '+2250700000001',
      ajoute_le: '2026-01-05T09:00:00Z',
      ajoute_par: null,
    },
    {
      user_id: AUTRE,
      niveau: 'admin',
      nom: 'Bakary Touré',
      telephone: '+2250700000002',
      ajoute_le: '2026-06-12T09:00:00Z',
      ajoute_par: MOI,
    },
  ],
  codes_promo: [
    {
      code: 'RENTREE',
      remise_pct: 30,
      valide_du: '2026-08-01',
      valide_au: '2026-09-30',
      quota: 50,
      utilisations: 12,
      cree_le: '2026-07-30T09:00:00Z',
      statut: 'en_cours',
    },
  ],
  remises: [
    {
      collecteur_id: AUTRE,
      nom: 'Bakary Touré',
      palier: 'pro',
      promo_code: 'RENTREE',
      remise_pct: 30,
      remise_fin: '2026-09-30',
    },
  ],
  volumes: { collecteurs: 42, audit_log: 1284 },
  journal: { derniere_ecriture: '2026-08-30T07:59:00Z', tables: ['collecteurs', 'admins'] },
  postgres: 'PostgreSQL 15.8',
};

const VUE = {
  collecteurs: [
    {
      id: AUTRE,
      nom: 'Bakary Touré',
      telephone: '+2250700000002',
      zone: 'Cocody',
      palier: 'pro',
      abonnement_statut: 'actif',
      abonnement_echeance: '2027-06-12T00:00:00Z',
      cree_le: '2026-06-12T09:00:00Z',
      clients: 10,
      cartes_actives: 5,
      encaisse: 50000,
      commissions: 5000,
      restitutions: 0,
      encours: 45000,
    },
    {
      id: 'ccc',
      nom: 'Chantal Yao',
      telephone: '+2250700000003',
      zone: 'Plateau',
      palier: 'standard',
      abonnement_statut: 'actif',
      abonnement_echeance: '2027-03-01T00:00:00Z',
      cree_le: '2026-03-01T09:00:00Z',
      clients: 5,
      cartes_actives: 3,
      encaisse: 20000,
      commissions: 2000,
      restitutions: 0,
      encours: 18000,
    },
  ],
  abonnements: {
    collecteurs_total: 2,
    collecteurs_actifs: 2,
    suspendus: 0,
    expires: 0,
    expirations_ce_mois: 0,
    expirations_a_venir_30j: 0,
    mrr: 7500,
    parPalier: [
      { palier: 'pro', nom: 'Pro', prix: 5000, limiteClients: 150, total: 1, actifs: 1, mrr: 5000 },
      { palier: 'standard', nom: 'Standard', prix: 2500, limiteClients: 50, total: 1, actifs: 1, mrr: 2500 },
    ],
  },
  totaux: {
    clients: 15, cartes_actives: 8, cartes_total: 10, mises: 70000,
    total_encaisse: 70000, commissions: 7000, restitutions: 0, encours_clients: 63000,
  },
  zones: [],
  mouvements: [],
  cartes: [],
  cartes_total_lignes: 0,
  genereLe: '2026-08-30T08:00:00Z',
} as unknown as VueGlobale;

/** Une configuration de paiement complète et acceptée par la boutique. */
const COMPLET = {
  cleConfiguree: true,
  cleIndice: 'MNOP',
  webhookConfigure: true,
  produits: [
    { palier: 'standard', configure: true },
    { palier: 'pro', configure: true },
    { palier: 'illimite', configure: true },
  ],
  boutique: 'joignable' as const,
};

afterEach(() => {
  cleanup();
  utiliserEtat.mockReset();
});

function empreinte(onglet: CleNavSuper, etat: EtatSuperAdmin = ETAT): string {
  utiliserEtat.mockReturnValue({ statut: 'ok', etat, recharger });
  const { container } = render(<SuperAdmin vue={VUE} onglet={onglet} onRecharger={() => {}} />);
  return container.innerHTML;
}

/**
 * Les six entrées de `ONGLETS` dans `SuperAdmin.tsx`, recomptées le
 * 2026-09-11 (lignes 87-119). Si la table change pendant le découpage, ce
 * n'est plus un déplacement de texte.
 */
const ONGLETS = [
  'abonnements',
  'administrateurs',
  'promos',
  'securite',
  'paiement',
  'plateforme',
] as const satisfies readonly CleNavSuper[];

describe('empreinte du rendu, avant et après le découpage', () => {
  for (const onglet of ONGLETS) {
    it(`l’onglet ${onglet} rend exactement le même DOM`, () => {
      expect(empreinte(onglet)).toMatchSnapshot();
    });
  }

  // Sans configuration, l'onglet Paiement ne rend presque rien de `Paiement`,
  // de `BOUTIQUE` ni de `Pastille` — c'est-à-dire presque rien de ce qui se
  // déplace aux tâches 4 et 5. Cette empreinte-ci les rend tous.
  it('l’onglet paiement, configuré, rend exactement le même DOM', () => {
    expect(empreinte('paiement', { ...ETAT, paiement: COMPLET })).toMatchSnapshot();
  });
});

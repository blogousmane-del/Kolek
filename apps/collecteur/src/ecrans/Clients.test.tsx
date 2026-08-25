import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * La liste de travail du collecteur, une fois qu'un client peut tenir plusieurs
 * carnets.
 *
 * Elle cesse d'être une liste de personnes pour devenir une liste de cartes. Le
 * geste du métier porte sur une carte — encaisser 5 000 sur celle-ci, pas 1 000
 * sur celle-là — et un écran qui montre les personnes oblige à choisir après
 * avoir touché le bouton, c'est-à-dire l'argent déjà en main.
 */

const from = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => from(table),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) },
  },
}));

vi.mock('./FicheClient', () => ({ FicheClient: () => null }));

const { Clients } = await import('./Clients');

const CLIENTS = [
  { id: 'cli1', nom: 'Hj', marche: 'Sokourani', telephone: null, avis_actifs: false },
  { id: 'cli2', nom: 'Ka', marche: null, telephone: null, avis_actifs: false },
];

/** Deux cartes actives pour Hj, aucune active pour Ka. */
const CARTES = [
  {
    id: 'k1',
    client_id: 'cli1',
    mise: 5000,
    statut: 'active',
    mises_encaissees: 2,
    ouverte_le: '2026-08-01T08:00:00.000Z',
  },
  {
    id: 'k2',
    client_id: 'cli1',
    mise: 1000,
    statut: 'active',
    mises_encaissees: 17,
    ouverte_le: '2026-07-02T08:00:00.000Z',
  },
  {
    id: 'k3',
    client_id: 'cli2',
    mise: 2000,
    statut: 'cloturee',
    mises_encaissees: 31,
    ouverte_le: '2026-06-03T08:00:00.000Z',
  },
];

function brancherSupabase() {
  from.mockImplementation((table: string) => {
    if (table === 'clients') {
      return { select: () => ({ order: () => Promise.resolve({ data: CLIENTS, error: null }) }) };
    }
    return { select: () => Promise.resolve({ data: CARTES, error: null }) };
  });
}

function rendre() {
  return render(
    <Clients
      collecteurId="col1"
      revision={0}
      ouvrirFormulaire={false}
      onFormulaireVu={vi.fn()}
      onDeconnexion={vi.fn()}
      onEncaisser={vi.fn()}
      onEcriture={vi.fn()}
      onNaviguer={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  from.mockReset();
});

describe('liste des clients devenue liste de cartes', () => {
  it('rend une ligne par carte active', async () => {
    brancherSupabase();
    rendre();

    // Hj tient deux carnets : deux lignes, pas une.
    expect(await screen.findAllByText('Hj')).toHaveLength(2);
  });

  it('donne à chaque ligne son propre bouton d’encaissement', async () => {
    brancherSupabase();
    rendre();

    const boutons = await screen.findAllByRole('button', { name: 'Encaisser' });
    expect(boutons).toHaveLength(2);
  });

  it('distingue deux cartes par leur date d’ouverture', async () => {
    brancherSupabase();
    rendre();

    // Les mises sont immuables : encaisser sur la mauvaise carte n'est pas
    // rattrapable. La date d'ouverture est ce qui sépare deux lignes de même
    // montant.
    expect(await screen.findByText(/1 août/)).toBeTruthy();
    expect(await screen.findByText(/2 juil/)).toBeTruthy();
  });

  it('garde une ligne pour le client sans carte active', async () => {
    brancherSupabase();
    rendre();

    // Ka n'a qu'une carte clôturée. Sans sa ligne, on ne peut plus lui en ouvrir.
    expect(await screen.findByText('Ka')).toBeTruthy();
  });

  it('n’affiche pas les cartes clôturées dans la liste de travail', async () => {
    brancherSupabase();
    rendre();

    // Un client fidèle depuis un an occuperait douze lignes d'historique.
    expect(screen.queryByText(/2 000 FCFA/)).toBeNull();
  });
});

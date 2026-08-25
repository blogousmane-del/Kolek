import { MISES_PAR_CYCLE } from '@kolek/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  { id: 'cli3', nom: 'Sy', marche: null, telephone: null, avis_actifs: false },
];

/** Deux cartes actives pour Hj, aucune active pour Ka, une carte pleine pour Sy. */
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
  // Reste `active` à 31/31 : la base ne clôture qu'au retrait. C'est la seule
  // des trois branches du badge de statut qu'aucune carte ci-dessus n'atteint.
  {
    id: 'k4',
    client_id: 'cli3',
    mise: 3000,
    statut: 'active',
    mises_encaissees: MISES_PAR_CYCLE,
    ouverte_le: '2026-05-01T08:00:00.000Z',
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

function rendre(supplement: Record<string, unknown> = {}) {
  return render(
    <Clients
      collecteurId="col1"
      revision={0}
      ouvrirFormulaire={false}
      onFormulaireVu={vi.fn()}
      ficheAOuvrir={null}
      onFicheVue={vi.fn()}
      onDeconnexion={vi.fn()}
      onEncaisser={vi.fn()}
      onEcriture={vi.fn()}
      onRetrait={vi.fn()}
      {...supplement}
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

  it('envoie l’identifiant de la carte touchée, pas celui de sa voisine', async () => {
    brancherSupabase();
    const onEncaisser = vi.fn();
    rendre({ onEncaisser });

    // Le tri range la carte la plus avancée en premier : k2 (17 mises) doit
    // précéder k1 (2 mises) parmi les boutons rendus. Vérifié plutôt que
    // supposé — c'est cet ordre-là qui rend la confusion possible.
    const boutons = await screen.findAllByRole('button', { name: 'Encaisser' });
    expect(boutons).toHaveLength(2);
    expect(boutons[0].closest('.bg-surface')?.textContent).toMatch(/1 000 FCFA/);
    expect(boutons[1].closest('.bg-surface')?.textContent).toMatch(/5 000 FCFA/);

    // boutons[1] porte la ligne de k1 : c'est celui-là qu'on touche, et non son
    // voisin — les mises sont immuables, encaisser sur la mauvaise carte ne se
    // rattrape pas.
    fireEvent.click(boutons[1]);

    expect(onEncaisser).toHaveBeenCalledTimes(1);
    expect(onEncaisser).toHaveBeenCalledWith({
      carteId: 'k1',
      clientNom: 'Hj',
      mise: 5000,
      misesEncaissees: 2,
    });
  });

  it('ouvre les deux portes sur une carte au bout de son cycle', async () => {
    brancherSupabase();
    rendre();

    // Seule des trois branches du badge encore sans couverture : aucune carte
    // ci-dessus n'atteignait 31/31 en restant `active`.
    await screen.findByText('Sy');
    const ligne = screen.getByText('Sy').closest('.bg-surface') as HTMLElement;

    expect(within(ligne).getByText('Cycle terminé')).toBeTruthy();
    expect(within(ligne).getByRole('button', { name: 'Retirer' })).toBeTruthy();
    expect(within(ligne).getByRole('button', { name: 'Activer une carte' })).toBeTruthy();
    // Encaisser ici serait refusé par la base (déclencheur CYCLE_COMPLET) :
    // c'est justement ce que la refonte en cartes doit empêcher de proposer.
    expect(within(ligne).queryByRole('button', { name: 'Encaisser' })).toBeNull();
  });

  it('mène au retrait du bon client depuis la carte terminée', async () => {
    const onRetrait = vi.fn();
    brancherSupabase();
    rendre({ onRetrait });

    await screen.findByText('Sy');
    const ligne = screen.getByText('Sy').closest('.bg-surface') as HTMLElement;
    fireEvent.click(within(ligne).getByRole('button', { name: 'Retirer' }));

    // Sans cet identifiant, le collecteur atterrissait sur toutes les cartes de
    // tous ses clients et devait retrouver la ligne à la main — avant un geste
    // qui ne se défait pas, et alors qu'un même client peut en avoir deux.
    expect(onRetrait).toHaveBeenCalledWith({ id: 'cli3', nom: 'Sy' });
  });
});

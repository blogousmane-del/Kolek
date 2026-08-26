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

describe('liste des clients redevenue liste de personnes', () => {
  it('rend une ligne par client, quel que soit le nombre de carnets', async () => {
    brancherSupabase();
    rendre();

    // Hj tient deux carnets, et n'existe qu'une fois. Signalé le 2026-08-26,
    // capture à l'appui : quatre lignes au même nom, quatre boutons
    // « Encaisser », un seul client. La liste des cartes avait été écrite le 25
    // à 06 h 34, avant que la fiche sache montrer tous les carnets ; le
    // carrousel du 25 au soir a rendu ce choix caduc.
    expect(await screen.findAllByText('Hj')).toHaveLength(1);
  });

  it('dit combien de carnets le client tient, et où en est le plus avancé', async () => {
    brancherSupabase();
    rendre();

    const ligne = (await screen.findByText('Hj')).closest('.bg-surface') as HTMLElement;
    // Le nombre est l'information qui manquait : sans lui, une ligne unique
    // cacherait les carnets au lieu de les résumer.
    expect(ligne.textContent).toMatch(/2 carnets/);
    // Et c'est l'avancement du plus avancé qui compte — k2, 17 mises : celui
    // dont le cycle se termine en premier, donc celui qu'on n'oublie pas.
    expect(ligne.textContent).toMatch(new RegExp(`17/${MISES_PAR_CYCLE}`));
  });

  it('ne propose plus d’encaisser depuis la liste', async () => {
    brancherSupabase();
    rendre();

    await screen.findByText('Hj');
    // Une mise est immuable. Depuis une ligne qui résume plusieurs carnets,
    // aucun bouton ne peut désigner le bon sans que le collecteur l'ait choisi :
    // le choix se fait dans la fiche, devant le carrousel.
    expect(screen.queryByRole('button', { name: 'Encaisser' })).toBeNull();
  });

  it('mène à la fiche, où les carnets se voient', async () => {
    brancherSupabase();
    rendre();

    expect(
      await screen.findByRole('button', { name: 'Ouvrir la fiche de Hj' }),
    ).toBeTruthy();
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

  it('signale le cycle terminé sans proposer d’encaisser', async () => {
    brancherSupabase();
    rendre();

    await screen.findByText('Sy');
    const ligne = screen.getByText('Sy').closest('.bg-surface') as HTMLElement;

    expect(within(ligne).getByText('Cycle terminé')).toBeTruthy();
    // « Retirer » reste : il porte sur le client, pas sur une carte, et
    // l'écran de retrait montre lui-même les carnets concernés.
    expect(within(ligne).getByRole('button', { name: 'Retirer' })).toBeTruthy();
    expect(within(ligne).queryByRole('button', { name: 'Encaisser' })).toBeNull();
    // « Activer une carte » demande un montant à préremplir, donc une carte
    // précise. Il vit dans la fiche, avec les autres gestes de carnet.
    expect(within(ligne).queryByRole('button', { name: 'Activer une carte' })).toBeNull();
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

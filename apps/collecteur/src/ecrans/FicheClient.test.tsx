import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * La fiche client, qui n'affichait qu'une carte sur plusieurs.
 *
 * `chargerFicheClient` rendait déjà la liste complète, triée par date
 * d'ouverture ; c'est l'écran qui n'en gardait qu'une, par un `.find()`. D'où son
 * titre « Carte en cours », au singulier — le défaut se lisait dans le libellé.
 */

const chargerFicheClient = vi.fn();

vi.mock('../lectures-ecrans', () => ({
  chargerFicheClient: (id: string) => chargerFicheClient(id),
}));

vi.mock('../ecritures', () => ({
  definirConsentementAvis: vi.fn(),
  ouvrirCarte: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) } },
}));

const { FicheClient } = await import('./FicheClient');

const FICHE_DEUX_CARTES = {
  id: 'cli1',
  nom: 'Hj',
  telephone: null,
  marche: 'Sokourani',
  activite: null,
  avisActifs: false,
  cartes: [
    {
      id: 'k1',
      mise: 5000,
      statut: 'active' as const,
      misesEncaissees: 31,
      ouverteLe: '2026-08-01T08:00:00.000Z',
      clotureeLe: null,
    },
    {
      id: 'k2',
      mise: 1000,
      statut: 'active' as const,
      misesEncaissees: 17,
      ouverteLe: '2026-07-02T08:00:00.000Z',
      clotureeLe: null,
    },
  ],
  mises: [],
};

/**
 * Le rang d'affichage (tri par avancement décroissant) et le rang chronologique
 * (ordre de `fiche.cartes`, rendu par `chargerFicheClient`) divergent ici
 * exprès : la carte la plus ancienne (« ancienne ») est aussi la plus avancée,
 * et la plus récente (« recente ») la moins avancée.
 *
 * C'est la seule configuration à deux cartes actives où un calcul de cycle
 * fondé sur le rang d'affichage et un calcul fondé sur l'index chronologique
 * donnent des réponses différentes — donc la seule qui verrouille vraiment
 * « le cycle suit l'ancienneté, pas l'avancement ». Avec la corrélation
 * inverse (la moins avancée est la plus ancienne), les deux tris coïncident et
 * un calcul fondé sur le rang d'affichage passerait le test sans être corrigé.
 */
const FICHE_CYCLE_ET_AVANCEMENT = {
  id: 'cli2',
  nom: 'Aw',
  telephone: null,
  marche: null,
  activite: null,
  avisActifs: false,
  cartes: [
    {
      id: 'recente',
      mise: 2000,
      statut: 'active' as const,
      misesEncaissees: 3,
      ouverteLe: '2026-08-10T08:00:00.000Z',
      clotureeLe: null,
    },
    {
      id: 'ancienne',
      mise: 4000,
      statut: 'active' as const,
      misesEncaissees: 25,
      ouverteLe: '2026-06-01T08:00:00.000Z',
      clotureeLe: null,
    },
  ],
  mises: [],
};

/**
 * Deux cartes actives, non pleines toutes les deux : les cartes pleines
 * n'ont pas de bouton d'encaissement, elles ne participent donc pas au
 * verrouillage du bon dispatch de `carteId`.
 */
const FICHE_DEUX_CARTES_ENCAISSABLES = {
  id: 'cli3',
  nom: 'Diarra',
  telephone: null,
  marche: null,
  activite: null,
  avisActifs: false,
  cartes: [
    {
      id: 'kA',
      mise: 2000,
      statut: 'active' as const,
      misesEncaissees: 5,
      ouverteLe: '2026-08-05T08:00:00.000Z',
      clotureeLe: null,
    },
    {
      id: 'kB',
      mise: 6000,
      statut: 'active' as const,
      misesEncaissees: 20,
      ouverteLe: '2026-07-10T08:00:00.000Z',
      clotureeLe: null,
    },
  ],
  mises: [],
};

/** Un client inscrit qui n'a encore jamais ouvert de carte. */
const FICHE_SANS_CARTE = {
  id: 'cli4',
  nom: 'Coulibaly',
  telephone: null,
  marche: null,
  activite: null,
  avisActifs: false,
  cartes: [],
  mises: [],
};

/** Un client dont les cartes existent, mais sont toutes closes. */
const FICHE_TOUTES_CLOTUREES = {
  id: 'cli5',
  nom: 'Traore',
  telephone: null,
  marche: null,
  activite: null,
  avisActifs: false,
  cartes: [
    {
      id: 'k9',
      mise: 3000,
      statut: 'cloturee' as const,
      misesEncaissees: 31,
      ouverteLe: '2026-01-01T08:00:00.000Z',
      clotureeLe: '2026-03-01T08:00:00.000Z',
    },
    {
      id: 'k8',
      mise: 1500,
      statut: 'cloturee' as const,
      misesEncaissees: 10,
      ouverteLe: '2025-10-01T08:00:00.000Z',
      clotureeLe: '2025-11-01T08:00:00.000Z',
    },
  ],
  mises: [],
};

afterEach(() => {
  cleanup();
  chargerFicheClient.mockReset();
});

describe('fiche d’un client à plusieurs cartes', () => {
  it('montre les deux cartes en cours, pas une', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Cartes en cours/)).toBeTruthy();
    // Un simple compte de « FCFA » passerait déjà avec une seule carte rendue :
    // ce qui distingue vraiment deux cartes, ce sont leurs deux montants.
    expect(await screen.findByText(/5\s*000/)).toBeTruthy();
    expect(await screen.findByText(/1\s*000/)).toBeTruthy();
  });

  it('offre les deux portes sur la carte au bout de son cycle', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // Un choix offert à un endroit et pas aux autres se lit comme un défaut.
    expect(await screen.findByRole('button', { name: 'Aller au retrait' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Activer une carte' })).toBeTruthy();
  });

  it('ne promet plus que la nouvelle carte attend le retrait', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByText(/Cartes en cours/);
    // « La nouvelle carte s'ouvre ensuite » était la règle d'une seule carte
    // active. Elle est tombée avec l'index.
    expect(screen.queryByText(/s’ouvre ensuite/)).toBeNull();
  });

  it('envoie l’identifiant de la carte touchée, pas celui de sa voisine', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    const onEncaisser = vi.fn();

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={onEncaisser}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // Le tri affiche la carte la plus avancée en premier : kB (20 mises)
    // précède kA (5 mises) parmi les boutons rendus. Vérifié plutôt que
    // supposé — c'est cet ordre-là qui rend la confusion possible si le tri
    // venait à changer, et un index nu la cliquerait en silence.
    const boutons = await screen.findAllByRole('button', { name: 'Encaisser une mise' });
    expect(boutons).toHaveLength(2);
    expect(boutons[0].parentElement?.textContent).toMatch(/6\s*000/);
    expect(boutons[1].parentElement?.textContent).toMatch(/2\s*000/);

    // boutons[1] porte le bloc de kA : c'est celui-là qu'on touche, et non son
    // voisin — une mise est immuable, encaisser sur la mauvaise carte ne se
    // rattrape pas.
    fireEvent.click(boutons[1]);

    expect(onEncaisser).toHaveBeenCalledTimes(1);
    expect(onEncaisser).toHaveBeenCalledWith({
      carteId: 'kA',
      clientNom: 'Diarra',
      mise: 2000,
      misesEncaissees: 5,
    });
  });
});

describe('numéro de cycle : l’ancienneté, jamais l’avancement', () => {
  it('numérote depuis la date d’ouverture, pas depuis le tri d’affichage', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_CYCLE_ET_AVANCEMENT);

    render(
      <FicheClient
        clientId="cli2"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByText(/Cartes en cours/);

    // La carte ancienne (4 000 FCFA de mise) est la première ouverte : cycle 1,
    // quel que soit son avancement. `.rounded-xl` cible le bloc `CarteCollecte`
    // entier — seul endroit du composant à porter cette classe — pour vérifier
    // que le numéro de cycle est bien accolé à la bonne carte, et pas juste
    // présent quelque part dans le document.
    const carteAncienne = screen.getByText('Cycle 1').closest('.rounded-xl') as HTMLElement;
    expect(within(carteAncienne).getByText(/4\s*000/)).toBeTruthy();

    // La carte récente est la seconde ouverte : cycle 2, même si elle est moins
    // avancée et se retrouve donc affichée en second (tri par avancement).
    const carteRecente = screen.getByText('Cycle 2').closest('.rounded-xl') as HTMLElement;
    expect(within(carteRecente).getByText(/2\s*000/)).toBeTruthy();
  });
});

describe('client sans carte active : le bloc d’ouverture reste atteignable', () => {
  it('propose d’ouvrir une première carte au client qui n’en a jamais eu', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_SANS_CARTE);

    render(
      <FicheClient
        clientId="cli4"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // Le libellé change selon que le client a déjà eu une carte ou non : les
    // deux cas ne doivent pas se confondre.
    expect(await screen.findByText('Ouvrir sa première carte')).toBeTruthy();
    expect(screen.queryByText('Ouvrir une nouvelle carte')).toBeNull();
  });

  it('propose d’en rouvrir une au client dont toutes les cartes sont clôturées', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_TOUTES_CLOTUREES);

    render(
      <FicheClient
        clientId="cli5"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    expect(await screen.findByText('Ouvrir une nouvelle carte')).toBeTruthy();
    expect(screen.queryByText('Ouvrir sa première carte')).toBeNull();
  });
});

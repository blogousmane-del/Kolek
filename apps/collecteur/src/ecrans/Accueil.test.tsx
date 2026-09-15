import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Les commandes posées sous la carte de l'accueil.
 *
 * Elles renvoyaient vers des écrans : « Encaisser » ouvrait la liste des
 * clients, à charge pour le collecteur d'y retrouver à la main celui qu'il
 * venait de lire — dans une liste triée autrement que par avancement. Un bouton
 * posé sous une carte doit agir sur cette carte ; c'est ce que ces deux tests
 * vérifient, et c'est pour cela que `carteDuJour` porte désormais son
 * identifiant et celui de son client.
 */

const chargerTableauCollecteur = vi.fn();

vi.mock('../lectures', () => ({
  chargerTableauCollecteur: () => chargerTableauCollecteur(),
}));

vi.mock('../supabase', () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) } },
}));

const FILE_VIDE = {
  mises: 0,
  clients: 0,
  cartes: 0,
  caisses: 0,
  enAttente: 0,
  aConsigner: 0,
  refusees: 0,
  plusAncienne: null,
  plusAncienneType: null,
};
let etatHorsLigne: Record<string, unknown> = {};
const horsLigne = (reste: Record<string, unknown> = {}) => ({
  operations: [],
  refus: [],
  tournee: null,
  file: FILE_VIDE,
  stockage: 'persistant',
  ...reste,
});

vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));

const { Accueil } = await import('./Accueil');
const { viderCache } = await import('../cache');

const TABLEAU = {
  clients: 3,
  cartesActives: 2,
  encaisseAujourdhui: 5000,
  encoursTotal: 120000,
  carteDuJour: {
    carteId: 'k7',
    clientId: 'cli9',
    nom: 'Mariam',
    mise: 5000,
    misesEncaissees: 18,
    solde: 85000,
  },
  dernieres: [],
};

beforeEach(() => {
  etatHorsLigne = horsLigne();
});

afterEach(() => {
  cleanup();
  // L'état réseau simulé par une épreuve ne doit pas survivre à la suivante.
  delete (window.navigator as unknown as { onLine?: boolean }).onLine;
  // `useDonnees` garde sa lecture sous la clé « accueil », au-delà du démontage
  // — c'est ce qui fait qu'un retour sur l'écran affiche des chiffres avant le
  // réseau. Sans cette purge, le tableau du test précédent survit au suivant.
  viderCache();
});

function rendre(supplement: Record<string, unknown> = {}) {
  return render(
    <Accueil
      nomCollecteur="Awa"
      revision={0}
      onNaviguer={vi.fn()}
      onSouscrire={vi.fn()}
      onEncaisser={vi.fn()}
      onOuvrirFiche={vi.fn()}
      onDeconnexion={vi.fn()}
      {...supplement}
    />,
  );
}

describe('les commandes sous la carte à finir en premier', () => {
  it('encaisse sur la carte affichée, et non sur une liste à parcourir', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onEncaisser = vi.fn();
    rendre({ onEncaisser });

    // Le nom complet, et non « Encaisser » : la grille de raccourcis porte une
    // pastille du même libellé, qui ouvre la liste des clients. Deux commandes
    // homonymes sur un écran, c'est un piège pour le test comme pour l'oreille.
    fireEvent.click(
      await screen.findByRole('button', { name: 'Encaisser sur la carte de Mariam' }),
    );

    expect(onEncaisser).toHaveBeenCalledWith({
      carteId: 'k7',
      clientNom: 'Mariam',
      mise: 5000,
      misesEncaissees: 18,
    });
  });

  it('ouvre la fiche du client de cette carte', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onOuvrirFiche = vi.fn();
    rendre({ onOuvrirFiche });

    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la fiche de Mariam' }));

    expect(onOuvrirFiche).toHaveBeenCalledWith('cli9');
  });

  it('ne propose aucune commande quand il n’y a pas de carte', async () => {
    // Sans carte, deux pastilles grises sous un bloc « Aucune carte active »
    // se liraient comme une application en panne.
    chargerTableauCollecteur.mockResolvedValue({ ...TABLEAU, carteDuJour: null, cartesActives: 0 });
    rendre();

    expect(await screen.findByText('Aucune carte active.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Encaisser sur la carte/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ouvrir la fiche/ })).toBeNull();
  });
});

describe('le compteur de la file sur l’accueil (§8.2)', () => {
  it('reste visible en ligne tant que la file n’est pas vide', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({ file: { ...FILE_VIDE, mises: 2, enAttente: 2 } });

    rendre();

    expect(await screen.findByText('Envoi en cours · 2 restantes')).toBeTruthy();
  });

  it('dit ce que la file contient, hors ligne', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({ file: { ...FILE_VIDE, mises: 3, clients: 1, enAttente: 4 } });

    rendre();

    expect(
      await screen.findByText('Hors ligne · 3 mises et 1 client en attente d’envoi'),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/synchronisés dès connexion/);
  });
});

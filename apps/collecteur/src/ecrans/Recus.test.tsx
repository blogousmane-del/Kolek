import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viderCache } from '../cache';

/**
 * L'écran qui a absorbé tout le passé, le 2026-09-17.
 *
 * Il portait les cinquante derniers encaissements, sans filtre et sans page. Il
 * porte maintenant les mises, les commissions, les rattrapages **et** les
 * cartes closes — ce que la fiche client et l'accueil montraient chacun de leur
 * côté. Ce qui suit tient les trois choses sans lesquelles ce regroupement
 * serait une régression : on retrouve une ligne, on la retrouve vite, et on
 * sait que la liste est bornée.
 */

// Sans ce doublon, importer `../lectures-ecrans` charge `../supabase`, qui lève
// faute de configuration. Même forme que `commission.test.tsx`.
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) },
  },
}));

const journal = vi.fn();
const historiqueCarte = vi.fn();

vi.mock('../lectures-ecrans', async (original) => ({
  ...((await original()) as object),
  chargerJournal: () => journal(),
  chargerHistoriqueCarte: (carteId: string) => historiqueCarte(carteId),
  chargerProfil: () => Promise.resolve({ estCollaborateur: false }),
}));

const { Recus } = await import('./Recus');

/**
 * Il y a N jours, à cette heure-ci.
 *
 * Relatif et non écrit en clair : l'écran nomme « Aujourd'hui » et « Hier »
 * par rapport à l'instant du rendu, et une épreuve qui code une date en dur
 * passe au vert aujourd'hui et ment demain. Aucun minuteur simulé non plus —
 * `findBy*` sonde en temps réel et resterait suspendu.
 */
/**
 * La ligne d'un client, pour y chercher sans attraper les pastilles.
 *
 * « Carte clôturée » est à la fois un filtre en haut et un libellé sur la
 * ligne : une recherche sur toute la page en trouve deux. On vise donc le
 * bouton qui porte le nom du client, qui est la ligne elle-même.
 */
function ligneDe(nom: string) {
  return screen.getByText(nom).closest('button') as HTMLElement;
}

function ilYA(jours: number) {
  return new Date(Date.now() - jours * 86_400_000).toISOString();
}

function mise(id: string, nom: string, jours: number, montant = 1000) {
  return {
    id,
    nature: 'mise' as const,
    clientId: `cli-${nom}`,
    clientNom: nom,
    survenuLe: ilYA(jours),
    montant,
    mise: montant,
  };
}

const CLOTURE = {
  id: 'cloture-k1',
  nature: 'cloture' as const,
  carteId: 'k1',
  clientId: 'cli-Aya',
  clientNom: 'Aya Koffi',
  survenuLe: ilYA(5),
  montant: 93_000,
  mise: 3000,
  cycle: { misesEncaissees: 31, ouverteLe: ilYA(47) },
};

beforeEach(() => {
  historiqueCarte.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  viderCache();
  journal.mockReset();
  historiqueCarte.mockReset();
});

function rendre() {
  return render(<Recus revision={0} onRetour={vi.fn()} />);
}

describe('le journal réunit ce qui était éparpillé', () => {
  it('montre une carte close à côté des mises, et la nomme', async () => {
    journal.mockResolvedValue([mise('m1', 'Awa Traoré', 1), CLOTURE]);

    rendre();

    expect(await screen.findByText('Awa Traoré')).toBeTruthy();
    expect(screen.getByText('Aya Koffi')).toBeTruthy();
    // La nature se lit sur la ligne fermée : sans elle, deux montants côte à
    // côte ne diraient pas que l'un est un versement et l'autre un cycle entier.
    expect(within(ligneDe('Aya Koffi')).getByText('Carte clôturée')).toBeTruthy();
    expect(within(ligneDe('Awa Traoré')).getByText('Mise')).toBeTruthy();
  });

  it('groupe par jour, et nomme aujourd’hui et hier plutôt que leur date', async () => {
    journal.mockResolvedValue([
      mise('m1', 'Awa Traoré', 0),
      mise('m2', 'Moussa Bamba', 1),
      mise('m3', 'Aminata Koné', 7),
    ]);

    rendre();

    expect(await screen.findByText("Aujourd'hui")).toBeTruthy();
    expect(screen.getByText('Hier')).toBeTruthy();
    // Au-delà d'hier, le jour reprend sa date. On ne l'écrit pas en clair —
    // ce serait réécrire `toLocaleDateString` dans l'épreuve — mais il doit
    // exister, et faire un troisième groupe.
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });
});

describe('les filtres', () => {
  it('ne garde que la nature choisie, et la rend à un second appui', async () => {
    journal.mockResolvedValue([mise('m1', 'Awa Traoré', 1), CLOTURE]);

    rendre();
    await screen.findByText('Awa Traoré');

    fireEvent.click(screen.getByRole('button', { name: 'Carte clôturée' }));

    expect(screen.queryByText('Awa Traoré')).toBeNull();
    expect(screen.getByText('Aya Koffi')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Carte clôturée' }));

    expect(screen.getByText('Awa Traoré')).toBeTruthy();
  });

  it('coupe sur la période, et le dit dans le sous-titre', async () => {
    journal.mockResolvedValue([
      mise('m1', 'Awa Traoré', 1),
      mise('m2', 'Moussa Bamba', 120),
    ]);

    rendre();
    await screen.findByText('Awa Traoré');

    fireEvent.click(screen.getByRole('button', { name: '7 jours' }));

    expect(screen.queryByText('Moussa Bamba')).toBeNull();
    // Le compte filtré **et** le compte total : une liste qui rétrécit sans
    // dire de combien laisse croire qu'on a perdu des lignes.
    expect(screen.getByText('1 sur 2 événements')).toBeTruthy();
  });

  it('cherche par nom de client, sans se soucier de la casse', async () => {
    journal.mockResolvedValue([
      mise('m1', 'Awa Traoré', 1),
      mise('m2', 'Moussa Bamba', 1),
    ]);

    rendre();
    await screen.findByText('Awa Traoré');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Chercher un client' }), {
      target: { value: 'moussa' },
    });

    expect(screen.queryByText('Awa Traoré')).toBeNull();
    expect(screen.getByText('Moussa Bamba')).toBeTruthy();
  });

  it('trouve un nom accentué tapé sans accent', async () => {
    journal.mockResolvedValue([mise('m1', 'Awa Traoré', 1), mise('m2', 'Moussa Bamba', 1)]);

    rendre();
    await screen.findByText('Awa Traoré');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Chercher un client' }), {
      target: { value: 'traore' },
    });

    // Ce champ comparait en minuscules seulement : « Traoré » y était
    // introuvable dès qu’on tapait sans accent, ce que personne ne fait sur
    // un clavier de téléphone. Le repli vit maintenant dans `../recherche`.
    expect(screen.getByText('Awa Traoré')).toBeTruthy();
    expect(screen.queryByText('Moussa Bamba')).toBeNull();
  });

  it('part avec la recherche déjà remplie quand on vient d’une fiche', async () => {
    journal.mockResolvedValue([
      mise('m1', 'Awa Traoré', 1),
      mise('m2', 'Moussa Bamba', 1),
    ]);

    render(<Recus revision={0} onRetour={vi.fn()} rechercheInitiale="Moussa Bamba" />);

    expect(await screen.findByText('Moussa Bamba')).toBeTruthy();
    expect(screen.queryByText('Awa Traoré')).toBeNull();
  });

  it('dit quoi faire quand les filtres ne laissent rien', async () => {
    journal.mockResolvedValue([mise('m1', 'Awa Traoré', 1)]);

    rendre();
    await screen.findByText('Awa Traoré');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Chercher un client' }), {
      target: { value: 'personne' },
    });

    // Et non « Aucun encaissement » : le collecteur en conclurait qu'il n'a
    // rien encaissé, alors qu'il a mal cherché.
    expect(screen.getByText('Rien avec ces filtres')).toBeTruthy();
    expect(screen.queryByText('Aucun encaissement')).toBeNull();
  });
});

describe('la pagination', () => {
  it('ne montre pas de pages tant que tout tient sur une', async () => {
    journal.mockResolvedValue([mise('m1', 'Awa Traoré', 1)]);

    rendre();
    await screen.findByText('Awa Traoré');

    expect(screen.queryByRole('button', { name: 'Page suivante' })).toBeNull();
  });

  it('coupe au-delà de quinze lignes, et la suite est sur la page d’après', async () => {
    journal.mockResolvedValue(
      Array.from({ length: 18 }, (_, i) =>
        mise(`m${i}`, `Client ${String(i).padStart(2, '0')}`, 1),
      ),
    );

    rendre();
    await screen.findByText('Client 00');

    expect(screen.queryByText('Client 17')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));

    expect(screen.getByText('Client 17')).toBeTruthy();
    expect(screen.queryByText('Client 00')).toBeNull();
  });

  /**
   * Le compte à côté d'un jour dit la journée, pas la page.
   *
   * Le regroupement se fait après la pagination, donc une journée chargée se
   * retrouve à cheval sur deux pages. Si le compte se prenait sur les lignes
   * affichées, l'écran écrirait « 15 lignes » sous un jour qui en porte
   * dix-huit — et un collecteur qui répond à un client qui conteste son
   * décompte lirait ce chiffre-là comme le décompte du jour.
   */
  it('dit la journée entière quand la page la coupe en deux', async () => {
    journal.mockResolvedValue(
      Array.from({ length: 18 }, (_, i) =>
        mise(`m${i}`, `Client ${String(i).padStart(2, '0')}`, 1),
      ),
    );

    rendre();
    await screen.findByText('Client 00');

    expect(screen.getByText('15 sur 18 lignes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));

    // Page 2 : trois lignes affichées, toujours dix-huit ce jour-là.
    expect(screen.getByText('3 sur 18 lignes')).toBeTruthy();
  });

  it('ne dit « sur » que lorsque la page coupe vraiment', async () => {
    journal.mockResolvedValue([mise('m1', 'Awa Traoré', 1), mise('m2', 'Moussa Bamba', 1)]);

    rendre();
    await screen.findByText('Awa Traoré');

    expect(screen.getByText('2 lignes')).toBeTruthy();
  });

  it('revient en page 1 quand un filtre rétrécit la liste', async () => {
    journal.mockResolvedValue(
      Array.from({ length: 18 }, (_, i) =>
        mise(`m${i}`, `Client ${String(i).padStart(2, '0')}`, 1),
      ),
    );

    rendre();
    await screen.findByText('Client 00');
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Chercher un client' }), {
      target: { value: 'Client 0' },
    });

    // Sans ce retour, on resterait sur une page 2 devenue vide, et l'écran
    // dirait « rien trouvé » alors que les lignes sont une page en arrière.
    expect(screen.getByText('Client 00')).toBeTruthy();
  });
});

describe('le dépli', () => {
  it('montre le numéro de reçu d’un versement, et pas avant', async () => {
    journal.mockResolvedValue([mise('abcdef1234', 'Awa Traoré', 1)]);

    rendre();
    await screen.findByText('Awa Traoré');

    expect(screen.queryByText('ABCDEF12')).toBeNull();

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('ABCDEF12')).toBeTruthy();
  });

  it('va chercher le détail d’une carte close à l’ouverture, et pas avant', async () => {
    journal.mockResolvedValue([CLOTURE]);
    historiqueCarte.mockResolvedValue([
      {
        id: 'mv1',
        genre: 'mise',
        montant: 3000,
        date: ilYA(40),
        estCommission: false,
      },
    ]);

    rendre();
    await screen.findByText('Aya Koffi');

    // La lecture est une requête par carte : dix cartes closes à l'écran ne
    // doivent pas faire dix allers-retours pour un détail que personne n'a
    // demandé.
    expect(historiqueCarte).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    await vi.waitFor(() => expect(historiqueCarte).toHaveBeenCalledWith('k1'));

    expect(await screen.findByText('Le détail de cette carte (1)')).toBeTruthy();
  });

  it('dit que le détail demande le réseau plutôt que de montrer une carte vide', async () => {
    journal.mockResolvedValue([CLOTURE]);
    historiqueCarte.mockRejectedValue(new Error('hors ligne'));

    rendre();
    await screen.findByText('Aya Koffi');
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    // « Aucun versement » sur une carte qui en a trente-et-un serait le pire
    // mensonge possible sur un écran d'historique.
    expect(await screen.findByText('Le détail de cette carte demande le réseau.')).toBeTruthy();
  });
});

describe('à qui revient la commission', () => {
  it('se lit sur la ligne fermée, sans avoir à déplier', async () => {
    journal.mockResolvedValue([
      {
        ...mise('m1', 'Awa Traoré', 1),
        nature: 'commission' as const,
      },
    ]);

    rendre();
    await screen.findByText('Awa Traoré');

    // Sur la ligne, et pas seulement dans la pastille de filtre : c'est la
    // ligne que le collaborateur parcourt.
    expect(within(ligneDe('Awa Traoré')).getByText('Commission')).toBeTruthy();
  });
});

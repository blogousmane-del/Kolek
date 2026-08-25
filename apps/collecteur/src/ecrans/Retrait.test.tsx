import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * L'écran de retrait : son vocabulaire, ses deux portes, et son filtre.
 *
 * ## Le vocabulaire
 *
 * L'écran s'appelle Retrait, écrit dans `retraits`, et proposait « Clôturer
 * cette carte ». Deux mots pour un geste, dans le même écran. Le mot qui reste
 * est **retrait** — c'est l'acte, et c'est le fait du point de vue du client :
 * on lui rend son argent. La clôture en est la conséquence, et la confirmation
 * porte les deux, parce que les deux comptent.
 *
 * Le code et la base ne bougent pas : `cloturerCarte`, `statut = 'cloturee'`.
 * Renommer à moitié coûterait plus cher que les deux vocabulaires actuels.
 *
 * ## Les deux portes
 *
 * Une carte au bout de ses 31 mises n'oblige à rien. Le client peut reprendre
 * son argent, ou le laisser et repartir sur une carte de plus. Le collecteur est
 * devant lui, l'argent à la main, au moment où il choisit : la seconde porte
 * doit être ici, pas deux écrans plus loin.
 *
 * ## Le filtre
 *
 * Arrivé depuis la ligne d'un client précis, le collecteur ne doit pas atterrir
 * sur la liste de toutes les cartes de tous ses clients. Il vient de désigner
 * une carte ; la lui faire retrouver à la main, dans un marché, avant un geste
 * irréversible, c'est fabriquer l'erreur qu'on veut éviter.
 */

const cloturerCarte = vi.fn();
const ouvrirCarte = vi.fn();
const rafraichir = vi.fn();
let donnees: unknown = null;
let erreurLecture: string | null = null;

vi.mock('../cache', () => ({
  useDonnees: () => ({ donnees, erreur: erreurLecture, rafraichir }),
}));

vi.mock('../ecritures-ecrans', () => ({
  cloturerCarte: (...args: unknown[]) => cloturerCarte(...args),
}));

vi.mock('../lectures-ecrans', () => ({
  chargerCartesCloturables: vi.fn(),
}));

vi.mock('../ecritures', () => ({
  ouvrirCarte: (...args: unknown[]) => ouvrirCarte(...args),
}));

vi.mock('../supabase', () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) } },
}));

const { Retrait } = await import('./Retrait');

/** Hj tient deux cartes : une pleine, une en cours. Ka en tient une pleine. */
const CARTE_PLEINE_HJ = {
  carteId: 'k1',
  clientId: 'cli1',
  clientNom: 'Hj',
  mise: 1000,
  misesEncaissees: 31,
  restituable: 30000,
  cycleComplet: true,
};

const CARTE_EN_COURS_HJ = {
  carteId: 'k2',
  clientId: 'cli1',
  clientNom: 'Hj',
  mise: 5000,
  misesEncaissees: 4,
  restituable: 15000,
  cycleComplet: false,
};

const CARTE_PLEINE_KA = {
  carteId: 'k3',
  clientId: 'cli2',
  clientNom: 'Ka',
  mise: 2000,
  misesEncaissees: 31,
  restituable: 60000,
  cycleComplet: true,
};

/** Le client sur lequel on réduit la liste. Son nom voyage avec son
    identifiant : l'écran le déduisait des cartes lues, donc le perdait en même
    temps qu'elles. */
const HJ = { id: 'cli1', nom: 'Hj' };

function rendre(supplement: Record<string, unknown> = {}) {
  return render(
    <Retrait
      revision={0}
      collecteurId="col1"
      onRetour={vi.fn()}
      onEcriture={vi.fn()}
      {...supplement}
    />,
  );
}

beforeEach(() => {
  donnees = [CARTE_PLEINE_HJ, CARTE_EN_COURS_HJ, CARTE_PLEINE_KA];
  erreurLecture = null;
  cloturerCarte.mockResolvedValue({ ok: true, montantRestitue: 30000 });
  ouvrirCarte.mockResolvedValue({ ok: true, carteId: 'neuve' });
});

afterEach(() => {
  cleanup();
  cloturerCarte.mockReset();
  ouvrirCarte.mockReset();
  rafraichir.mockReset();
});

describe('vocabulaire de l’écran de retrait', () => {
  it('ne dit plus « clôturer » sur le bouton principal', () => {
    rendre();

    expect(screen.getAllByRole('button', { name: 'Faire le retrait' })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Clôturer cette carte' })).toBeNull();
  });

  it('nomme les deux faits dans la confirmation', () => {
    rendre();

    fireEvent.click(screen.getAllByRole('button', { name: 'Faire le retrait' })[0]!);

    const texte = screen.getByText(/Confirmer le retrait/).textContent ?? '';
    expect(texte).toContain('30 000');
    // La carte se clôture, et c'est définitif. Le taire serait pire que le dire.
    expect(texte).toContain('clôture');
  });
});

describe('les deux portes de la fin de cycle', () => {
  it('propose d’activer une carte à côté de celle qui est pleine', () => {
    rendre();

    const ligne = screen.getByText('30 000').closest('div.p-4');
    expect(ligne).not.toBeNull();
    // Le collecteur est devant le client, l'argent à la main, quand celui-ci dit
    // « garde-le ». La porte doit être là.
    expect(within(ligne as HTMLElement).getByRole('button', { name: 'Activer une carte' })).toBeTruthy();
  });

  it('ne la propose pas sur une carte encore en cours', () => {
    donnees = [CARTE_EN_COURS_HJ];
    rendre();

    // Rien n'est terminé : proposer d'en ouvrir une seconde ici prélèverait une
    // commission que le client n'a pas demandée.
    expect(screen.queryByRole('button', { name: 'Activer une carte' })).toBeNull();
  });
});

describe('le filtre par client', () => {
  it('ne montre que les cartes du client demandé', () => {
    rendre({ client: HJ });

    // Hj en a deux, Ka n'a rien à faire ici : le collecteur vient de désigner
    // une carte, on ne le renvoie pas la chercher.
    expect(screen.getAllByRole('button', { name: 'Faire le retrait' })).toHaveLength(2);
    expect(screen.queryByText('Ka')).toBeNull();
  });

  it('dit sur quel client il est filtré', () => {
    rendre({ client: HJ });

    // Une liste tronquée sans explication se lit comme des cartes disparues.
    expect(screen.getByText(/Cartes de Hj/)).toBeTruthy();
  });

  it('laisse revenir à toutes les cartes', () => {
    const onToutesLesCartes = vi.fn();
    rendre({ client: HJ, onToutesLesCartes });

    fireEvent.click(screen.getByRole('button', { name: 'Voir toutes les cartes' }));

    expect(onToutesLesCartes).toHaveBeenCalled();
  });

  it('laisse sortir du filtre même quand ce client n’a plus de carte', () => {
    // Cas atteint juste après son dernier retrait : la liste réduite est vide.
    // Le bandeau se déduisait des cartes qu'on venait de lire, donc il
    // disparaissait avec elles — et il portait la seule sortie du filtre. Ne
    // restait que la flèche vers l'accueil.
    donnees = [CARTE_PLEINE_KA];
    const onToutesLesCartes = vi.fn();
    rendre({ client: HJ, onToutesLesCartes });

    expect(screen.getByText(/Cartes de Hj/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir toutes les cartes' }));
    expect(onToutesLesCartes).toHaveBeenCalled();
  });

  it('ne filtre rien quand aucun client n’est demandé', () => {
    rendre();

    expect(screen.getAllByRole('button', { name: 'Faire le retrait' })).toHaveLength(3);
    expect(screen.queryByText(/Cartes de/)).toBeNull();
  });
});

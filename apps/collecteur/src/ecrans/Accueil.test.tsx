import { formatMontant } from '@kolek/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

// Le profil décide d'un outil (« Équipe ») : il se règle ici plutôt que par
// une lecture du téléphone que ce banc ne simule pas.
let estTitulaire = false;
vi.mock('./commission', () => ({ useEstTitulaire: () => estTitulaire }));

const { Accueil } = await import('./Accueil');
const { viderCache } = await import('../cache');

const TABLEAU = {
  clients: 3,
  cartesActives: 2,
  encaisseAujourdhui: 5000,
  misesAujourdhui: 1,
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
  estTitulaire = false;
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
      {...supplement}
    />,
  );
}

describe('les commandes sous la carte à finir en premier', () => {
  it('encaisse sur la carte affichée, et non sur une liste à parcourir', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onEncaisser = vi.fn();
    rendre({ onEncaisser });

    // Le nom complet, montant compris : la barre du bas porte une touche
    // « Encaisser » qui ouvre la liste des cartes. Deux commandes homonymes sur
    // un écran, c'est un piège pour le test comme pour l'oreille.
    fireEvent.click(
      await screen.findByRole('button', {
        name: /^Encaisser 5\s000 FCFA sur la carte de Mariam$/,
      }),
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
    expect(screen.queryByRole('button', { name: /sur la carte de/ })).toBeNull();
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

describe('ce que l’accueil signale de la file (§8.4, §8.7, §8.8)', () => {
  it('mène aux refus par un bandeau qui ne bloque rien', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({ file: { ...FILE_VIDE, refusees: 2 } });
    const onNaviguer = vi.fn();
    rendre({ onNaviguer });

    fireEvent.click(await screen.findByRole('button', { name: '2 opérations refusées, à voir' }));

    expect(onNaviguer).toHaveBeenCalledWith('alertes');
  });

  it('prévient quand le plus ancien geste attend depuis 75 jours ou plus', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({
      file: {
        ...FILE_VIDE,
        mises: 1,
        enAttente: 1,
        // Une seconde de plus que 76 jours : la division ne tombe pas sur la frontière.
        plusAncienne: new Date(Date.now() - 76 * 86_400_000 - 1000).toISOString(),
        plusAncienneType: 'mise',
      },
    });
    rendre();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Une mise attend depuis 76 jours. Retrouve du réseau avant 90 jours.',
    );
  });

  it('dit une fois par lancement que le stockage n’est pas garanti', async () => {
    // La seule épreuve du fichier qui passe par `non_garanti` : le drapeau
    // « déjà dit » vit dans le module, pour toute la durée du lancement.
    const PHRASE =
      'Ce téléphone peut effacer les données de Kolek s’il manque de place. Garde l’application installée et envoie dès que possible.';
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({ stockage: 'non_garanti' });

    rendre();
    expect(await screen.findByText(PHRASE)).toBeTruthy();

    // Retour sur l'accueil pendant le même lancement.
    cleanup();
    rendre();
    expect(await screen.findByRole('button', { name: /sur la carte de Mariam$/ })).toBeTruthy();
    expect(screen.queryByText(PHRASE)).toBeNull();
  });
});

/** Attendre que le tableau soit lu : la carte et ses commandes en dépendent. */
async function tableauLu() {
  await screen.findByRole('button', { name: /sur la carte de Mariam$/ });
}

describe('l’en-tête du billet', () => {
  it('dit le total du jour et le nombre de mises qui le font', async () => {
    chargerTableauCollecteur.mockResolvedValue({ ...TABLEAU, misesAujourdhui: 3 });
    rendre();
    await tableauLu();
    expect(screen.getByText(/^Encaissé aujourd’hui/).textContent).toBe(
      'Encaissé aujourd’hui · 3 mises',
    );
  });

  it('accorde « mise » au singulier', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.getByText(/^Encaissé aujourd’hui/).textContent).toBe(
      'Encaissé aujourd’hui · 1 mise',
    );
  });

  it('pose les trois chiffres en relevé, nommés', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual([
      'Clients',
      'Cartes actives',
      'Encours, FCFA',
    ]);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual([
      '3',
      '2',
      formatMontant(120000),
    ]);
  });

  it('ne porte plus de bouton de déconnexion : il vit dans le profil', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
  });

  it('mène au profil par l’avatar', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onNaviguer = vi.fn();
    rendre({ onNaviguer });
    await tableauLu();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir mon profil' }));
    expect(onNaviguer).toHaveBeenCalledWith('profil');
  });
});

describe('la carte à finir en premier', () => {
  /**
   * Le titre existe depuis le 2026-08-23 : un collecteur a cru que son compte
   * appartenait au client affiché. La maquette B l'avait perdu ; il vit
   * désormais dans la carte, au-dessus du nom.
   */
  it('dit ce qu’elle est, pour qu’on ne la prenne pas pour le compte', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.getByText(/^À finir en premier/).textContent).toBe(
      'À finir en premier · la plus avancée de tes 2 cartes actives',
    );
  });

  it('mène à toutes les cartes', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onNaviguer = vi.fn();
    rendre({ onNaviguer });
    await tableauLu();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes les cartes' }));
    expect(onNaviguer).toHaveBeenCalledWith('clients');
  });

  it('ne dit pas de cycle qu’elle ne connaît pas', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.queryByText(/^Cycle/)).toBeNull();
  });
});

describe('les outils', () => {
  function outils() {
    return within(screen.getByRole('region', { name: 'Outils' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
  }

  it('rangent les écrans, sans Encaisser ni Bilan que la barre porte déjà', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(outils()).toEqual(['Souscrire', 'Retrait', 'Rapprochement', 'Reçus', 'Alertes', 'Avis', 'Plus']);
  });

  it('ajoutent l’équipe pour le titulaire', async () => {
    estTitulaire = true;
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(outils()).toEqual([
      'Souscrire',
      'Retrait',
      'Rapprochement',
      'Reçus',
      'Alertes',
      'Avis',
      'Équipe',
      'Plus',
    ]);
  });

  it('mènent où on les touche', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onNaviguer = vi.fn();
    const onSouscrire = vi.fn();
    rendre({ onNaviguer, onSouscrire });
    await tableauLu();
    fireEvent.click(screen.getByRole('button', { name: 'Rapprochement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Souscrire' }));
    expect(onNaviguer).toHaveBeenCalledWith('rapprochement');
    expect(onSouscrire).toHaveBeenCalledOnce();
  });
});

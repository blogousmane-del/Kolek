import { formatMontant } from '@kolek/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { operationMise } from '../hors-ligne/fabriques';

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
/** Le profil que `useEstCollaborateur` lit sous la clé `profil`. `null` : un collecteur seul. */
let profilLu: unknown = null;

// Répond selon la clé, comme le vrai : la liste des cartes sous `cartes-cloturables`,
// le profil sous `profil`. Un bouchon qui rendait les cartes pour les deux faisait
// lire à `useEstCollaborateur` un tableau à la place d'un profil.
vi.mock('../cache', () => ({
  useDonnees: (cle: string) =>
    cle === 'profil'
      ? { donnees: profilLu, erreur: null, rafraichir }
      : { donnees, erreur: erreurLecture, rafraichir },
}));

vi.mock('../ecritures-ecrans', () => ({
  cloturerCarte: (...args: unknown[]) => cloturerCarte(...args),
}));

/**
 * `useEstCollaborateur` lit le profil : depuis les collaborateurs, ces écrans
 * en dépendent. Un collecteur seul par défaut — c'est ce que ces suites
 * testaient déjà, sans avoir eu à le dire.
 */
const chargerProfil = vi.fn(() =>
  Promise.resolve({
    nom: 'Collecteur',
    telephone: '+2250700000000',
    zone: null,
    palier: 'pro',
    abonnementStatut: 'actif',
    abonnementEcheance: null,
    clients: 0,
    cartesActives: 0,
    titulaireId: null,
  }),
);

vi.mock('../lectures-ecrans', () => ({
  chargerCartesCloturables: vi.fn(),
  chargerProfil: () => chargerProfil(),
}));

vi.mock('../ecritures', () => ({
  ouvrirCarte: (...args: unknown[]) => ouvrirCarte(...args),
}));

vi.mock('../supabase', () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) } },
}));

/** La file du téléphone, telle que l'écran la lit. Vide par défaut. */
let operationsEnFile: unknown[] = [];
/** Le compte de la file, lue par défaut. `null` : le téléphone ne l'a pas encore lue. */
const FILE_LUE = {
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
let fileLue: unknown = FILE_LUE;
vi.mock('../hors-ligne/useHorsLigne', () => ({
  useHorsLigne: () => ({
    operations: operationsEnFile,
    refus: [],
    tournee: null,
    file: fileLue,
    stockage: 'inconnu',
  }),
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

/** Les lignes de la liste : une par carte, chacune un bouton qui se déplie.
    Le bouton est l'enfant direct du `<li>` : un `aria-expanded` posé plus bas, dans
    le dépli (la commande d'`ActiverCarte`, un jour), n'en ferait pas une ligne. */
function lignes() {
  return screen.queryAllByRole('button').filter((b) => b.matches('li > button[aria-expanded]'));
}

/** Déplie la ligne d'un client. `rang` choisit parmi ses cartes, dans l'ordre de l'écran. */
function ouvrir(nom: string, rang = 0) {
  const ligne = lignes().filter((b) => b.textContent?.startsWith(nom))[rang];
  if (!ligne) throw new Error(`Pas de ligne pour ${nom} (rang ${rang})`);
  fireEvent.click(ligne);
}

/** Déplie la ligne, puis demande le retrait. */
function faireLeRetrait(nom: string, rang = 0) {
  ouvrir(nom, rang);
  fireEvent.click(screen.getByRole('button', { name: 'Faire le retrait' }));
}

// Le témoin de `window.scrollTo`, que jsdom n'implémente pas : sans lui, la vue
// clôturée écrit « Not implemented » dans la sortie, et rien ne dit si l'écran
// remonte. Un neuf par épreuve.
let scrollTo = vi.fn();

beforeEach(() => {
  donnees = [CARTE_PLEINE_HJ, CARTE_EN_COURS_HJ, CARTE_PLEINE_KA];
  erreurLecture = null;
  profilLu = null;
  cloturerCarte.mockResolvedValue({ ok: true, montantRestitue: 30000 });
  ouvrirCarte.mockResolvedValue({ ok: true, carteId: 'neuve' });
  scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
});

afterEach(() => {
  cleanup();
  cloturerCarte.mockReset();
  ouvrirCarte.mockReset();
  rafraichir.mockReset();
  operationsEnFile = [];
  fileLue = FILE_LUE;
  vi.unstubAllGlobals();
  delete (window.navigator as unknown as { onLine?: boolean }).onLine;
});

describe('vocabulaire de l’écran de retrait', () => {
  it('ne dit plus « clôturer » sur le bouton principal', () => {
    rendre();
    ouvrir('Hj');

    expect(screen.getByRole('button', { name: 'Faire le retrait' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clôturer cette carte' })).toBeNull();
  });

  it('nomme les deux faits dans la confirmation', () => {
    rendre();

    faireLeRetrait('Hj');

    // Ce qu'on rend, dans le titre ; ce que la carte devient, juste dessous. Le
    // taire serait pire que le dire.
    const feuille = screen.getByRole('dialog', { name: /^Rendre 30\s000 FCFA\s\?$/ });
    expect(
      within(feuille).getByText(
        'La carte se clôture. C’est définitif : le retrait ne pourra pas être défait.',
      ),
    ).toBeTruthy();
  });
});

describe('les deux portes de la fin de cycle', () => {
  it('propose d’activer une carte à côté de celle qui est pleine', () => {
    rendre();
    ouvrir('Hj');

    const depli = document.getElementById('depli-k1') as HTMLElement;
    // Le collecteur est devant le client, l'argent à la main, quand celui-ci dit
    // « garde-le ». La porte doit être là.
    expect(within(depli).getByRole('button', { name: 'Activer une carte' })).toBeTruthy();
  });

  it('ne la propose pas sur une carte encore en cours', () => {
    donnees = [CARTE_EN_COURS_HJ];
    rendre();
    ouvrir('Hj');

    // Rien n'est terminé : proposer d'en ouvrir une seconde ici prélèverait une
    // commission que le client n'a pas demandée.
    expect(screen.getByRole('button', { name: 'Faire le retrait' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Activer une carte' })).toBeNull();
  });
});

describe('le filtre par client', () => {
  it('ne montre que les cartes du client demandé', () => {
    rendre({ client: HJ });

    // Hj en a deux, Ka n'a rien à faire ici : le collecteur vient de désigner
    // une carte, on ne le renvoie pas la chercher.
    expect(lignes()).toHaveLength(2);
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

  it('ne dit pas qu’un client n’a plus de carte quand la lecture a échoué', () => {
    // Hors ligne, la lecture lève : l'écran n'a rien lu. « Ses cartes ont toutes
    // été clôturées » à côté de l'alerte serait faux, et pousserait à lui ouvrir
    // une carte de plus (spec J2b §8.9).
    donnees = null;
    erreurLecture = 'Cet écran demande le réseau.';
    rendre({ client: HJ });

    expect(screen.getByText('Cet écran demande le réseau.')).toBeTruthy();
    expect(screen.queryByText('Aucune carte active pour ce client')).toBeNull();
  });

  it('ne dit pas qu’un client n’a plus de carte pendant la lecture', () => {
    donnees = null;
    rendre({ client: HJ });

    expect(screen.queryByText('Aucune carte active pour ce client')).toBeNull();
  });

  it('ne filtre rien quand aucun client n’est demandé', () => {
    rendre();

    expect(lignes()).toHaveLength(3);
    expect(screen.queryByText(/Cartes de/)).toBeNull();
  });
});

describe('le retrait attend la file et le réseau (§7)', () => {
  it('refuse le retrait d’une carte dont une mise attend l’envoi, et le dit', () => {
    // Le montant rendu est recalculé au serveur depuis les mises qu'il a
    // reçues. Tant qu'une mise de la carte est sur le téléphone, le client
    // repartirait avec moins que son dû.
    operationsEnFile = [operationMise(1, { carteId: 'k1' })];
    rendre();

    ouvrir('Hj');
    expect(
      (screen.getByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText('1 mise de cette carte pas encore envoyée.')).toBeTruthy();

    // Les autres cartes n'attendent rien : leur retrait reste possible.
    ouvrir('Ka');
    expect(
      (screen.getByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('demande le réseau pour rendre l’argent', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    rendre();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(lignes()[i]!);
      expect(
        (screen.getByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(screen.getByText('Le retrait demande le réseau.')).toBeTruthy();
    }
  });

  it('ne laisse pas valider une confirmation ouverte quand une mise de la carte entre en file', () => {
    // La confirmation a été ouverte sur une carte sans attente. Une mise de cette
    // carte arrive ensuite dans la file : le serveur clôturerait sans elle.
    const { rerender } = rendre();
    faireLeRetrait('Hj');

    operationsEnFile = [operationMise(1, { carteId: 'k1' })];
    rerender(<Retrait revision={0} collecteurId="col1" onRetour={vi.fn()} onEcriture={vi.fn()} />);

    const valider = screen.getByRole('button', { name: /^Oui, rendre/ }) as HTMLButtonElement;
    expect(valider.disabled).toBe(true);
    // Dite deux fois, dans le dépli derrière et dans la feuille : c'est la
    // feuille qui compte, elle porte le bouton.
    expect(
      within(screen.getByRole('dialog')).getByText('1 mise de cette carte pas encore envoyée.'),
    ).toBeTruthy();
    fireEvent.click(valider);
    expect(cloturerCarte).not.toHaveBeenCalled();
  });

  it('ne laisse pas valider une confirmation ouverte quand le réseau tombe', () => {
    rendre();
    faireLeRetrait('Hj');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    const valider = screen.getByRole('button', { name: /^Oui, rendre/ }) as HTMLButtonElement;
    expect(valider.disabled).toBe(true);
    fireEvent.click(valider);
    expect(cloturerCarte).not.toHaveBeenCalled();
  });

  it('attend que le téléphone ait lu sa file : une file pas lue ne vaut pas une file vide', () => {
    fileLue = null;
    rendre();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(lignes()[i]!);
      expect(
        (screen.getByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(screen.getByText('Opérations du téléphone pas encore vérifiées.')).toBeTruthy();
    }
  });

  it('relie la raison d’un retrait bloqué à son bouton, juste en dessous de lui', () => {
    operationsEnFile = [operationMise(1, { carteId: 'k1' })];
    rendre();
    ouvrir('Hj');

    // Un bouton éteint ne prend pas le focus : sans ce lien, le lecteur d'écran
    // ne dit pas pourquoi il est éteint.
    const bouton = screen.getByRole('button', { name: 'Faire le retrait' });
    const raison = document.getElementById(bouton.getAttribute('aria-describedby') ?? '');
    expect(raison?.textContent).toBe('1 mise de cette carte pas encore envoyée.');
    // Sur un téléphone étroit « Activer une carte » passe à la ligne : la raison
    // reste collée à son bouton, et ne se lit pas sous l'autre.
    expect(bouton.nextElementSibling).toBe(raison);

    // Les autres cartes n'attendent rien : leur bouton ne renvoie vers aucune raison.
    ouvrir('Ka');
    expect(
      screen.getByRole('button', { name: 'Faire le retrait' }).hasAttribute('aria-describedby'),
    ).toBe(false);
  });

  it('relie aussi la raison à la confirmation quand une mise de la carte entre en file', () => {
    const { rerender } = rendre();
    faireLeRetrait('Hj');

    operationsEnFile = [operationMise(1, { carteId: 'k1' })];
    rerender(<Retrait revision={0} collecteurId="col1" onRetour={vi.fn()} onEcriture={vi.fn()} />);

    const valider = screen.getByRole('button', { name: /^Oui, rendre/ });
    const raison = document.getElementById(valider.getAttribute('aria-describedby') ?? '');
    expect(raison?.textContent).toBe('1 mise de cette carte pas encore envoyée.');
  });
});

/**
 * La recherche par nom, posée le 2026-09-19.
 *
 * La liste des cartes à clôturer est la plus longue du produit : elle porte
 * une ligne par carte ouverte, de tous les clients. Retrouver quelqu'un en la
 * faisant défiler, debout dans un marché, avant un geste qui ne se défait pas,
 * c'est le même défaut que celui qui a fait naître le filtre par client — en
 * plus lent.
 */
describe('la recherche par nom', () => {
  const CARTE_TRAORE = {
    carteId: 'k4',
    clientId: 'cli3',
    clientNom: 'Awa Traoré',
    mise: 1000,
    misesEncaissees: 3,
    restituable: 2000,
    cycleComplet: false,
  };

  function champ() {
    return screen.getByRole('textbox', { name: 'Rechercher un client' }) as HTMLInputElement;
  }

  it('ne pose pas de champ quand il n’y a rien à chercher', () => {
    donnees = [CARTE_PLEINE_HJ];

    rendre();

    // Un champ au-dessus d'une liste d'un seul élément est du décor, et il
    // pousse la seule carte plus bas sous le pouce.
    expect(screen.queryByRole('textbox', { name: 'Rechercher un client' })).toBeNull();
  });

  it('pose le champ dès qu’il y a plus d’une carte', () => {
    rendre();

    expect(champ()).toBeTruthy();
  });

  /*
    Le dessin de l'écran Clients, et chacun de ses choix, parce que chacun
    répond à un défaut constaté là-bas. `text` et non `search` : WebKit dessine
    sur `search` sa propre croix, et l'iPhone en montrait deux, dont une de
    20 px. Ni majuscule ni correcteur automatiques : le correcteur d'iOS
    réécrit un nom ivoirien en mot français au deuxième caractère.
  */
  it('porte le dessin de la recherche de l’écran Clients', () => {
    rendre();

    expect(champ().type).toBe('text');
    expect(champ().placeholder).toBe('Nom du client…');
    expect(champ().getAttribute('autocapitalize')).toBe('none');
    expect(champ().getAttribute('autocorrect')).toBe('off');
    expect(champ().getAttribute('spellcheck')).toBe('false');
  });

  it('a quitté l’en-tête pour le corps de l’écran, comme sur Clients', () => {
    rendre();

    // Le sous-titre reste celui de l'écran : le compte de la recherche vit
    // désormais sous le champ, dans sa région d'annonce.
    expect(screen.getByText('Clôturer une carte et rendre le solde')).toBeTruthy();
  });

  it('ne pose pas de champ sous un filtre client', () => {
    rendre({ client: HJ });

    // La liste ne porte déjà qu'une personne : un second filtre par-dessus ne
    // retrancherait rien qu'on cherche.
    expect(screen.queryByRole('textbox', { name: 'Rechercher un client' })).toBeNull();
  });

  it('retrouve un client sans son accent ni sa majuscule', () => {
    donnees = [CARTE_PLEINE_HJ, CARTE_PLEINE_KA, CARTE_TRAORE];

    rendre();
    fireEvent.change(champ(), { target: { value: 'traore' } });

    // Personne ne compose un accent sur un clavier de téléphone au marché.
    expect(screen.getByText('Awa Traoré')).toBeTruthy();
    expect(screen.queryByText('Hj')).toBeNull();
    expect(screen.queryByText('Ka')).toBeNull();
  });

  it('dit combien de cartes la recherche laisse, et sur combien', () => {
    rendre();
    fireEvent.change(champ(), { target: { value: 'ka' } });

    // Une liste qui rétrécit sans dire de combien laisse croire qu'on a perdu
    // des cartes — sur l'écran qui fait sortir l'argent, c'est le doute le
    // plus cher. Et dans une région d'annonce, pour que le lecteur d'écran le
    // dise sans voler le focus au champ.
    const annonce = screen.getByText('1 sur 3 cartes');
    expect(annonce.getAttribute('role')).toBe('status');
  });

  it('garde la région d’annonce montée avant toute recherche', () => {
    rendre();

    // Un lecteur d'écran n'annonce que les changements d'une région qu'il
    // observe déjà. Insérée avec son texte, elle resterait muette.
    const region = champ().closest('div')?.parentElement?.querySelector('[role="status"]');
    expect(region).toBeTruthy();
    expect(region?.textContent).toBe('');
  });

  it('efface le terme à la croix', () => {
    rendre();
    fireEvent.change(champ(), { target: { value: 'ka' } });

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));

    expect(champ().value).toBe('');
    expect(screen.getAllByText('Hj')).toHaveLength(2);
  });

  it('efface le terme à la touche Échap', () => {
    rendre();
    fireEvent.change(champ(), { target: { value: 'ka' } });

    // Le seul geste qui ne demande pas de viser : la main qui tape n'a pas à
    // retrouver la croix.
    fireEvent.keyDown(champ(), { key: 'Escape' });

    expect(champ().value).toBe('');
  });

  it('ne montre pas de croix tant que le champ est vide', () => {
    rendre();

    expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).toBeNull();
  });

  it('ne dit pas que les cartes sont clôturées quand c’est le nom qui ne tombe pas', () => {
    rendre();
    fireEvent.change(champ(), { target: { value: 'personne' } });

    expect(screen.getByText('Aucune carte à ce nom')).toBeTruthy();
    // « Aucune carte active » ferait conclure au collecteur que tout a été
    // clôturé, alors qu'il a mal tapé un nom.
    expect(screen.queryByText('Aucune carte active')).toBeNull();
  });

  it('cesse de filtrer dès que le champ disparaît', () => {
    const { rerender } = rendre();
    fireEvent.change(champ(), { target: { value: 'ka' } });
    expect(screen.queryAllByText('Hj')).toHaveLength(0);

    rerender(
      <Retrait revision={0} collecteurId="col1" onRetour={vi.fn()} onEcriture={vi.fn()} client={HJ} />,
    );

    // Le terme survit dans l'état, mais plus personne ne peut le voir ni
    // l'effacer. Sans cette garde, arriver ici depuis la fiche d'un client
    // masquerait ses cartes par un filtre devenu invisible.
    expect(screen.getAllByText('Hj')).toHaveLength(2);
  });
});

/**
 * Les filtres de la liste — le même rang de puces que l'écran Clients.
 *
 * Trois et pas davantage, parce que les données n'en portent pas plus : une
 * carte est au bout de son cycle, ou elle ne l'est pas. Les deux cas appellent
 * deux gestes différents — au bout, rendre l'argent ou repartir sur une carte
 * de plus ; en cours, un retrait anticipé dont le montant ne se fait pas de
 * tête.
 */
describe('les filtres', () => {
  function puce(nom: string) {
    return screen.getByRole('button', { name: nom });
  }

  it('propose trois filtres, « Toutes » choisi à l’arrivée', () => {
    rendre();

    // `aria-pressed` : sans lui, le lecteur d'écran lit trois boutons et ne
    // dit pas lequel est choisi — la couleur seule le disait.
    expect(puce('Toutes').getAttribute('aria-pressed')).toBe('true');
    expect(puce('Cycle terminé').getAttribute('aria-pressed')).toBe('false');
    expect(puce('En cours').getAttribute('aria-pressed')).toBe('false');
  });

  it('ne garde que les cartes au bout de leur cycle', () => {
    rendre();

    fireEvent.click(puce('Cycle terminé'));

    expect(lignes()).toHaveLength(2);
    expect(puce('Cycle terminé').getAttribute('aria-pressed')).toBe('true');
  });

  it('ne garde que les cartes en cours', () => {
    rendre();

    fireEvent.click(puce('En cours'));

    expect(lignes()).toHaveLength(1);
    expect(screen.queryByText('Ka')).toBeNull();
  });

  it('se combine à la recherche', () => {
    rendre();
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: 'hj' },
    });

    fireEvent.click(puce('Cycle terminé'));

    // Hj tient une carte pleine et une en cours : seule la pleine reste.
    expect(lignes()).toHaveLength(1);
    expect(screen.getAllByText('Hj')).toHaveLength(1);
  });

  it('dit que c’est le filtre qui cache, quand la recherche a bien trouvé', () => {
    rendre();
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: 'ka' },
    });

    fireEvent.click(puce('En cours'));

    // Le pire mensonge possible ici : « aucune carte à ce nom », quand le nom
    // est juste et que c'est le filtre qui la cache. Le collecteur en
    // conclurait que la carte a déjà été clôturée.
    expect(screen.getByText('1 carte trouvée, masquée par le filtre « En cours »')).toBeTruthy();
    expect(screen.queryByText('Aucune carte à ce nom')).toBeNull();
  });

  it('dit combien le filtre en cache, quand il en laisse', () => {
    rendre();
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: 'hj' },
    });

    fireEvent.click(puce('En cours'));

    expect(screen.getByText('1 sur 2, dont 1 masquée par le filtre « En cours »')).toBeTruthy();
  });

  it('nomme le vide d’un filtre, et ne dit pas que tout est clôturé', () => {
    donnees = [CARTE_PLEINE_HJ, CARTE_PLEINE_KA];
    rendre();

    fireEvent.click(puce('En cours'));

    expect(screen.getByText('Aucune carte en cours')).toBeTruthy();
    expect(screen.queryByText('Aucune carte active')).toBeNull();
  });

  it('nomme le vide de l’autre filtre', () => {
    donnees = [CARTE_EN_COURS_HJ, { ...CARTE_EN_COURS_HJ, carteId: 'k9', clientNom: 'Zé' }];
    rendre();

    fireEvent.click(puce('Cycle terminé'));

    expect(screen.getByText('Aucun cycle terminé')).toBeTruthy();
  });

  it('ne pose pas de filtres sous un filtre client', () => {
    rendre({ client: HJ });

    expect(screen.queryByRole('button', { name: 'En cours' })).toBeNull();
  });

  it('ne pose pas de filtres quand il n’y a qu’une carte', () => {
    donnees = [CARTE_PLEINE_HJ];
    rendre();

    expect(screen.queryByRole('button', { name: 'Toutes' })).toBeNull();
  });

  it('cesse de filtrer dès que les filtres disparaissent', () => {
    const { rerender } = rendre();
    fireEvent.click(puce('En cours'));

    rerender(
      <Retrait revision={0} collecteurId="col1" onRetour={vi.fn()} onEcriture={vi.fn()} client={HJ} />,
    );

    // Même garde que pour la recherche, et pour la même raison : arrivé
    // depuis la fiche de Hj avec « En cours » resté choisi, sa carte pleine
    // serait cachée par un filtre que plus rien n'affiche.
    expect(screen.getAllByText('Hj')).toHaveLength(2);
  });

  it('referme une confirmation ouverte quand la liste change', () => {
    rendre();
    faireLeRetrait('Hj');
    expect(screen.getByRole('button', { name: /^Oui, rendre/ })).toBeTruthy();

    fireEvent.click(puce('En cours'));
    fireEvent.click(puce('Toutes'));

    // Un geste qui ne se défait pas, à un appui de distance, sur une carte qui
    // vient de reparaître sans qu'on l'ait redemandée. La confirmation se
    // rouvre au doigt, jamais d'elle-même.
    expect(screen.queryByRole('button', { name: /^Oui, rendre/ })).toBeNull();
  });
});

/**
 * La pagination — vingt cartes par page, le seuil de l'écran Clients.
 *
 * `LIGNES_AFFICHEES_PAR_PAGE`, et non une valeur à part : deux écrans voisins
 * qui découpent leur liste à deux tailles différentes, c'est une règle que le
 * collecteur doit réapprendre en changeant d'onglet.
 */
describe('la pagination', () => {
  function cartes(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      carteId: `p${i}`,
      clientId: `c${i}`,
      clientNom: `Client ${String(i + 1).padStart(2, '0')}`,
      mise: 1000,
      misesEncaissees: 5,
      restituable: 4000,
      cycleComplet: false,
    }));
  }

  function suivante() {
    return screen.getByRole('button', { name: 'Page suivante' });
  }

  it('ne pagine pas jusqu’à vingt cartes', () => {
    donnees = cartes(20);

    rendre();

    expect(lignes()).toHaveLength(20);
    expect(screen.queryByRole('button', { name: 'Page suivante' })).toBeNull();
  });

  it('montre vingt cartes par page au-delà', () => {
    donnees = cartes(25);

    rendre();

    expect(lignes()).toHaveLength(20);
    expect(screen.getByText('Client 01')).toBeTruthy();
    expect(screen.queryByText('Client 21')).toBeNull();

    fireEvent.click(suivante());

    expect(lignes()).toHaveLength(5);
    expect(screen.getByText('Client 21')).toBeTruthy();
  });

  it('repart de la première page à chaque recherche', () => {
    donnees = cartes(45);
    rendre();
    fireEvent.click(suivante());
    fireEvent.click(suivante());
    expect(screen.getByText('Client 41')).toBeTruthy();

    // « client » trouve les quarante-cinq : trois pages, donc la troisième
    // resterait valide. Sans le retour au début, la recherche répondrait par
    // le quarante et unième résultat, les quarante premiers invisibles.
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: 'client' },
    });

    expect(screen.getByText('Client 01')).toBeTruthy();
    expect(screen.queryByText('Client 41')).toBeNull();
  });

  it('repart de la première page à chaque filtre', () => {
    donnees = cartes(45);
    rendre();
    fireEvent.click(suivante());
    fireEvent.click(suivante());

    fireEvent.click(screen.getByRole('button', { name: 'En cours' }));

    expect(screen.getByText('Client 01')).toBeTruthy();
  });

  it('pagine ce qui reste après la recherche, pas la liste entière', () => {
    donnees = cartes(45);
    rendre();

    // « 0 » ne retient que Client 01 à Client 09, Client 10, 20, 30 et 40 :
    // treize cartes, donc une seule page. Découper avant de chercher aurait
    // laissé la commande de page sur une liste qui n'en a plus besoin.
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: '0' },
    });

    expect(lignes()).toHaveLength(13);
    expect(screen.queryByRole('button', { name: 'Page suivante' })).toBeNull();
  });

  it('referme une confirmation ouverte quand on change de page', () => {
    donnees = cartes(25);
    rendre();
    faireLeRetrait('Client 01');

    fireEvent.click(suivante());
    fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));

    expect(screen.queryByRole('button', { name: /^Oui, rendre/ })).toBeNull();
  });
});

/**
 * Une ligne par carte, le détail quand on le demande (2026-10-02).
 *
 * L'écran montrait des cartes de 240 px, la même phrase de commission répétée
 * sur chacune, et une carte à 0 FCFA aussi grosse qu'une carte à rendre. Neuf
 * lignes tiennent là où tenaient trois cartes.
 */
describe('la liste en lignes', () => {
  function titres() {
    return screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);
  }

  function nomsDesLignes() {
    return lignes().map((l) => l.textContent?.match(/^\D+/)?.[0]);
  }

  function depliees() {
    return lignes().filter((l) => l.getAttribute('aria-expanded') === 'true');
  }

  function comptes() {
    return ['Toutes', 'Cycle terminé', 'En cours'].map(
      (nom) => screen.getByRole('button', { name: nom }).textContent,
    );
  }

  it('range les cycles terminés devant, sous deux titres comptés', () => {
    rendre();

    expect(titres()).toEqual(['Cycle terminé 2', 'En cours 1']);
    expect(nomsDesLignes()).toEqual(['Hj', 'Ka', 'Hj']);
  });

  it('montre le montant à rendre sur la ligne, et la commission seulement dépliée', () => {
    rendre();

    expect(lignes()[0]?.textContent).toMatch(/30\s000\s?FCFA\s?à rendre/);
    expect(screen.queryByText(/qui est ta commission/)).toBeNull();

    ouvrir('Hj');

    expect(screen.getAllByText(/qui est ta commission/)).toHaveLength(1);
  });

  it('ne déplie qu’une ligne à la fois, et la replie au second toucher', () => {
    rendre();

    ouvrir('Hj');
    ouvrir('Ka');

    expect(depliees()).toHaveLength(1);
    expect(depliees()[0]?.textContent).toMatch(/^Ka/);

    ouvrir('Ka');
    expect(depliees()).toHaveLength(0);
  });

  it('relie la ligne à son dépli', () => {
    rendre();
    ouvrir('Hj');

    expect(lignes()[0]?.getAttribute('aria-controls')).toBe('depli-k1');
    expect(document.getElementById('depli-k1')).not.toBeNull();
  });

  it('compte chaque segment sur ce que la recherche a trouvé', () => {
    rendre();

    expect(comptes()).toEqual(['Toutes3', 'Cycle terminé2', 'En cours1']);

    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: 'hj' },
    });

    expect(comptes()).toEqual(['Toutes2', 'Cycle terminé1', 'En cours1']);
  });

  it('ne titre pas les groupes sous un filtre : le segment le dit déjà', () => {
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Cycle terminé' }));

    expect(titres()).toEqual([]);
    expect(lignes()).toHaveLength(2);
  });

  it('replie la ligne quand la liste change', () => {
    rendre();
    ouvrir('Hj');
    expect(depliees()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'En cours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toutes' }));

    // Les trois lignes sont revenues : une liste vide ne prouverait pas le repli.
    expect(lignes()).toHaveLength(3);
    expect(depliees()).toHaveLength(0);
  });

  it('referme la confirmation en changeant de ligne : elle ne reparaît pas au retour', () => {
    rendre();
    faireLeRetrait('Hj');

    ouvrir('Ka');
    ouvrir('Hj');

    // Un geste qui ne se défait pas ne se rouvre pas tout seul : revenir sur la
    // ligne rend la première porte, jamais la confirmation d'avant.
    expect(screen.getByRole('button', { name: 'Faire le retrait' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Oui, rendre/ })).toBeNull();
  });

  it('referme le dépli quand la recherche change', () => {
    rendre();
    ouvrir('Hj');
    expect(depliees()).toHaveLength(1);

    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: 'hj' },
    });

    // Les deux lignes de Hj sont toujours là : c'est bien le dépli qui s'est refermé.
    expect(lignes()).toHaveLength(2);
    expect(depliees()).toHaveLength(0);
  });

  it('range les cycles terminés devant avant de couper en pages', () => {
    // Vingt-cinq cartes, les cinq terminées en dernier : sans le tri, la page 1
    // n'en montrerait aucune, et le collecteur irait chercher à rendre en page 2.
    donnees = Array.from({ length: 25 }, (_, i) => ({
      carteId: `t${i}`,
      clientId: `c${i}`,
      clientNom: `Client ${String(i + 1).padStart(2, '0')}`,
      mise: 1000,
      misesEncaissees: i >= 20 ? 31 : 5,
      restituable: i >= 20 ? 30000 : 4000,
      cycleComplet: i >= 20,
    }));
    rendre();

    expect(lignes()).toHaveLength(20);
    expect(titres()).toEqual(['Cycle terminé 5', 'En cours 20']);
    expect(lignes()[0]?.textContent).toMatch(/^Client 21/);
  });

  it('compte les segments après la recherche et avant le filtre', () => {
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'En cours' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: 'hj' },
    });

    // Chaque segment dit ce qu'il montrerait si on le choisissait : « En cours »
    // choisi, « Cycle terminé » ne tombe pas à zéro pour autant.
    expect(comptes()).toEqual(['Toutes2', 'Cycle terminé1', 'En cours1']);
  });

  it('nomme chaque titre de groupe par son libellé seul : le compte est muet', () => {
    rendre();

    expect(screen.getByRole('heading', { level: 2, name: 'Cycle terminé' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'En cours' })).toBeTruthy();
  });

  /** La phrase de la règle, dans le dépli de la carte `k2` (Hj, 5 000 par jour). On
      la lit par `textContent` : les nombres sont dans leurs propres spans, et
      `getByText` ne lit que les nœuds texte directs d'un élément. */
  function phraseDuDepli() {
    return (document.getElementById('depli-k2') as HTMLElement).querySelector('p') as HTMLElement;
  }

  it('accorde la phrase de la commission au singulier pour une seule mise', () => {
    donnees = [{ ...CARTE_EN_COURS_HJ, misesEncaissees: 1, restituable: 0 }];
    rendre();
    ouvrir('Hj');

    expect(phraseDuDepli().textContent).toBe(
      `1 mise encaissée, moins la première, qui est ta commission (${formatMontant(5000)} FCFA).`,
    );
  });

  it('pose les nombres de la phrase en Plex Mono : le compte de mises et la mise, pas la phrase', () => {
    // Plex Mono pour tout nombre qu'on compte, jamais pour une phrase entière : le
    // compte et la mise sont dans leur span, le reste est en Instrument Sans.
    donnees = [CARTE_EN_COURS_HJ];
    rendre();
    ouvrir('Hj');

    const phrase = phraseDuDepli();
    expect(phrase.textContent).toBe(
      `4 mises encaissées, moins la première, qui est ta commission (${formatMontant(5000)} FCFA).`,
    );
    const nombres = [...phrase.querySelectorAll('span.font-mono')];
    expect(nombres.map((s) => s.textContent)).toEqual(['4', formatMontant(5000)]);
    // L'unité reste dehors, dans la police du texte, comme partout dans l'écran.
    expect(phrase.classList.contains('font-mono')).toBe(false);
    expect(phrase.textContent).toContain(`${formatMontant(5000)} FCFA`);
    expect(nombres.some((s) => s.textContent?.includes('FCFA'))).toBe(false);
  });

  it('dit que la première mise revient au titulaire, pour un collaborateur', () => {
    profilLu = { titulaireId: 'tit1' };
    donnees = [CARTE_EN_COURS_HJ];
    rendre();
    ouvrir('Hj');

    expect(phraseDuDepli().textContent).toBe(
      `4 mises encaissées, moins la première, qui revient à ton titulaire (${formatMontant(5000)} FCFA).`,
    );
  });

  it('dit qu’il n’y a rien à rendre ni à garder quand aucune mise n’est encaissée', () => {
    donnees = [{ ...CARTE_EN_COURS_HJ, misesEncaissees: 0, restituable: 0 }];
    rendre();
    ouvrir('Hj');

    expect(screen.getByText('Aucune mise encaissée : rien à rendre, rien à garder.')).toBeTruthy();
  });
});

/**
 * Le décompte, avant le geste qui ne se défait pas (2026-10-02).
 *
 * La confirmation était une phrase : « Confirmer le retrait de 30 000 FCFA
 * pour Hj ? ». Elle devient un décompte de caisse, que le collecteur peut lire
 * au client avant de payer : les mises, la commission, le total sous un double
 * filet.
 */
describe('le décompte', () => {
  /** « − » puis l'espace fine insécable : la retenue telle que `Decompte` l'écrit. */
  const MOINS = String.fromCharCode(0x2212, 0x202f);

  function feuille() {
    return screen.getByRole('dialog', { name: /^Rendre 30\s000 FCFA\s\?$/ });
  }

  it('compte les mises, retire la commission, et tombe sur le total à rendre', () => {
    rendre();
    faireLeRetrait('Hj');

    expect(within(feuille()).getByText('à Hj')).toBeTruthy();
    expect(within(feuille()).getAllByRole('term').map((t) => t.textContent)).toEqual([
      `31 mises × ${formatMontant(1000)}`,
      'Ta commission, case 1',
      'À rendre',
    ]);
    expect(within(feuille()).getAllByRole('definition').map((d) => d.textContent)).toEqual([
      formatMontant(31000),
      `${MOINS}${formatMontant(1000)}`,
      `${formatMontant(30000)} FCFA`,
    ]);
  });

  it('compte une carte en cours : quatre mises de 5 000, la commission, 15 000 à rendre', () => {
    // Une carte qui ne ressemble pas à 31 × 1 000 : les trois nombres de la
    // feuille (20 000, 5 000, 15 000) sont distincts, et aucun n'est la mise ou
    // le total d'une autre ligne. La ligne et son total viennent chacun de leur
    // règle, ils ne se copient pas l'un sur l'autre.
    rendre();
    faireLeRetrait('Hj', 1);

    const d = screen.getByRole('dialog', { name: /^Rendre 15\s000 FCFA\s\?$/ });
    expect(within(d).getAllByRole('term').map((t) => t.textContent)).toEqual([
      `4 mises × ${formatMontant(5000)}`,
      'Ta commission, case 1',
      'À rendre',
    ]);
    expect(within(d).getAllByRole('definition').map((x) => x.textContent)).toEqual([
      formatMontant(20000),
      `${MOINS}${formatMontant(5000)}`,
      `${formatMontant(15000)} FCFA`,
    ]);
  });

  it('compte une carte à une seule mise : la commission l’épuise, il n’y a rien à rendre', () => {
    // La limite basse du retrait anticipé : une mise encaissée, et c'est la
    // commission. Le décompte le montre, ligne à ligne, jusqu'à zéro.
    donnees = [{ ...CARTE_PLEINE_HJ, misesEncaissees: 1, restituable: 0, cycleComplet: false }];
    rendre();
    faireLeRetrait('Hj');

    const d = screen.getByRole('dialog', { name: /^Rendre 0 FCFA\s\?$/ });
    expect(within(d).getAllByRole('term').map((t) => t.textContent)).toEqual([
      `1 mise × ${formatMontant(1000)}`,
      'Ta commission, case 1',
      'À rendre',
    ]);
    expect(within(d).getAllByRole('definition').map((x) => x.textContent)).toEqual([
      formatMontant(1000),
      `${MOINS}${formatMontant(1000)}`,
      `${formatMontant(0)} FCFA`,
    ]);
  });

  it('nomme la part du titulaire, et non une commission, pour un collaborateur', () => {
    // La première mise ne revient pas à celui qui encaisse : le décompte lu au
    // client ne doit pas la lui promettre.
    profilLu = { titulaireId: 'tit1' };
    rendre();
    faireLeRetrait('Hj');

    expect(within(feuille()).getAllByRole('term').map((t) => t.textContent)).toEqual([
      `31 mises × ${formatMontant(1000)}`,
      'Part de ton titulaire, case 1',
      'À rendre',
    ]);
  });

  it('répète le montant sur le bouton : on sait ce qu’on confirme', () => {
    rendre();
    faireLeRetrait('Hj');

    expect(
      within(feuille()).getByRole('button', { name: /^Oui, rendre 30\s000 FCFA$/ }),
    ).toBeTruthy();
  });

  it('se referme par « Annuler » sans rien écrire', () => {
    rendre();
    faireLeRetrait('Hj');

    fireEvent.click(within(feuille()).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cloturerCarte).not.toHaveBeenCalled();
  });

  it('ne se referme pas pendant que le retrait part', async () => {
    let repondre: (valeur: unknown) => void = () => {};
    cloturerCarte.mockReturnValue(new Promise((r) => (repondre = r)));
    rendre();
    faireLeRetrait('Hj');

    fireEvent.click(within(feuille()).getByRole('button', { name: /^Oui, rendre/ }));
    fireEvent.keyDown(window, { key: 'Escape' });

    // Fermer ici cacherait la réponse du serveur : le collecteur ne saurait pas
    // s'il doit rendre l'argent.
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => repondre({ ok: true, montantRestitue: 30000 }));
  });

  it('referme la feuille sur un refus, montre sa raison, et lui donne le focus', async () => {
    // Un refus peut dire que la carte a été clôturée ailleurs entre-temps : rien
    // n'a été rendu ici. La feuille ne reste pas ouverte sur un geste refusé, la
    // raison est dite, et la liste se relit pour ne plus proposer cette carte.
    cloturerCarte.mockResolvedValue({
      ok: false,
      echec: { code: 'CARTE_CLOTUREE', message: 'Cette carte vient d’être clôturée.' },
    });
    const onEcriture = vi.fn();
    rendre({ onEcriture });
    faireLeRetrait('Hj');

    fireEvent.click(within(feuille()).getByRole('button', { name: /^Oui, rendre/ }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Cette carte vient d’être clôturée.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rafraichir).toHaveBeenCalledTimes(1);
    // Rien n'est écrit, rien n'est à remettre : ni vue clôturée, ni liste à relire
    // par la coquille.
    expect(onEcriture).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Remets/)).toBeNull();
    // L'alerte est le premier enfant de la page, la feuille vient de disparaître :
    // le focus l'amène à l'écran, et un lecteur d'écran la lit. `waitFor` : l'effet
    // suit l'insertion.
    await waitFor(() => expect(document.activeElement).toBe(alerte));
  });

  it('referme la feuille, prévient, et ne reste pas verrouillée quand la clôture est sans réponse', async () => {
    // Un rejet ne dit pas si le retrait a été écrit avant : le message le dit, et
    // dit de relire. Surtout, la feuille refuse de se fermer tant qu'un envoi est
    // en vol — sans `finally`, un rejet laissait « Oui, rendre » éteint pour de bon.
    cloturerCarte.mockRejectedValue(new Error('panne'));
    const onEcriture = vi.fn();
    rendre({ onEcriture });
    faireLeRetrait('Hj');

    fireEvent.click(within(feuille()).getByRole('button', { name: /^Oui, rendre/ }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toMatch(/pas pu être confirmé/);
    expect(alerte.textContent).toMatch(/il a pu être inscrit/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rafraichir).toHaveBeenCalledTimes(1);
    expect(onEcriture).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Remets/)).toBeNull();

    // Le verrou est levé : la feuille se rouvre, son bouton est allumé.
    fireEvent.click(screen.getByRole('button', { name: 'Faire le retrait' }));
    const valider = within(feuille()).getByRole('button', { name: /^Oui, rendre/ });
    expect((valider as HTMLButtonElement).disabled).toBe(false);
  });
});

/** Clôturée : le tampon, et ce qu'il reste à faire de la main. */
describe('la carte clôturée', () => {
  async function retirer(nom: string, rang = 0) {
    faireLeRetrait(nom, rang);
    fireEvent.click(screen.getByRole('button', { name: /^Oui, rendre/ }));
    return screen.findByText(/^Remets/);
  }

  it('dit ce qu’il reste à faire : remettre l’argent, en main propre', async () => {
    const onEcriture = vi.fn();
    rendre({ onEcriture });

    expect((await retirer('Hj')).textContent).toMatch(/^Remets 30\s000 FCFA à Hj, en main propre\.$/);
    expect(
      screen.getByText('Le retrait est inscrit au journal. Il ne peut plus être défait.'),
    ).toBeTruthy();
    expect(screen.getByText('Carte clôturée')).toBeTruthy();
    expect(cloturerCarte).toHaveBeenCalledWith('k1');
    expect(onEcriture).toHaveBeenCalledOnce();
  });

  it('pose le tampon CLÔTURÉE sur la carte rendue', async () => {
    rendre();
    await retirer('Hj');

    expect(document.querySelector('[data-tampon]')?.getAttribute('data-tampon')).toBe('Clôturée');
    expect(screen.getByText('Rendu au client')).toBeTruthy();
  });

  it('propose une carte de plus après un cycle complet, avec la phrase d’après le retrait', async () => {
    rendre();
    await retirer('Hj');

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));

    expect(
      screen.getByText('La carte précédente est close. La nouvelle repart de la case 1.'),
    ).toBeTruthy();
    expect(screen.queryByText(/son solde reste dû/)).toBeNull();
  });

  it('ne propose pas de carte de plus après un retrait anticipé, ni de case à venir', async () => {
    cloturerCarte.mockResolvedValue({ ok: true, montantRestitue: 15000 });
    rendre();
    await retirer('Hj', 1);

    expect(screen.queryByRole('button', { name: 'Activer une carte' })).toBeNull();
    // Close à 4/31 : sa cinquième case n'attend plus rien.
    expect(document.querySelectorAll('[data-etat]')).toHaveLength(31);
    expect(document.querySelectorAll('[data-etat="prochaine"]')).toHaveLength(0);
  });

  it('revient aux cartes', async () => {
    rendre();
    await retirer('Hj');

    fireEvent.click(screen.getByRole('button', { name: 'Retour aux cartes' }));

    expect(lignes()).toHaveLength(3);
  });

  it('remonte en haut et donne le focus à ce qu’il reste à faire de la main', async () => {
    // La vue clôturée remplace la liste sans changer de page : la coquille ne
    // remonte pas, et un collecteur qui venait de toucher « Oui, rendre » au bas
    // d'une longue liste la lisait de son milieu. Et le bouton qui avait le focus
    // vient de disparaître avec la feuille : sans ce geste, il tomberait sur
    // <body>, et le `role="status"`, monté déjà rempli, resterait muet.
    rendre();
    expect(scrollTo).not.toHaveBeenCalled();

    const remets = await retirer('Hj');
    const etat = remets.closest('[role="status"]');

    expect(etat, 'les mots « Remets… » sont dans la région d’état').toBeTruthy();
    expect(scrollTo.mock.calls).toEqual([[0, 0]]);
    // `waitFor` : l'effet suit l'insertion de la vue.
    await waitFor(() => expect(document.activeElement).toBe(etat));
  });

  it('confirme la carte ouverte après le retrait, et ne propose plus de l’ouvrir', async () => {
    // Avant : l'ouverture réussie repliait le bloc, sans un mot, et laissait le
    // bouton « Activer une carte » à sa place — un second appui ouvrait une
    // seconde carte, donc une seconde commission.
    const onEcriture = vi.fn();
    rendre({ onEcriture });
    await retirer('Hj');

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));

    const phrase = await screen.findByText('Nouvelle carte ouverte. Elle repart de la case 1.');
    expect(phrase.getAttribute('role')).toBe('status');
    expect(screen.queryByRole('button', { name: 'Activer une carte' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ouvrir la carte' })).toBeNull();
    // Une seule ouverture, à la mise de la carte rendue ; deux écritures en tout,
    // la clôture puis l'ouverture, dont la liste doit se relire.
    expect(ouvrirCarte.mock.calls).toEqual([['col1', 'cli1', 1000]]);
    expect(onEcriture).toHaveBeenCalledTimes(2);
    // Le bloc qui portait le focus a disparu : la phrase le reçoit, pour être lue.
    await waitFor(() => expect(document.activeElement).toBe(phrase));
    // Et le focus de la vue clôturée ne se rejoue pas : `scrollTo` n'est appelé
    // qu'une fois, à l'arrivée de la vue.
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('propose de nouveau d’ouvrir une carte sur le retrait suivant', async () => {
    // « Retour aux cartes » remet la confirmation à zéro : la carte ouverte
    // après le retrait de Hj ne parle pas de celui de Ka.
    rendre();
    await retirer('Hj');
    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
    await screen.findByText('Nouvelle carte ouverte. Elle repart de la case 1.');

    fireEvent.click(screen.getByRole('button', { name: 'Retour aux cartes' }));
    await retirer('Ka');

    expect(screen.queryByText('Nouvelle carte ouverte. Elle repart de la case 1.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Activer une carte' })).toBeTruthy();
  });
});

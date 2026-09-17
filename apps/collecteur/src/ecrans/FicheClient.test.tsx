import { formatMontant, MISES_PAR_CYCLE } from '@kolek/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { operationClientCarte, operationMise } from '../hors-ligne/fabriques';

/**
 * La fiche client, qui n'affichait qu'une carte sur plusieurs.
 *
 * `chargerFicheClient` rendait déjà la liste complète, triée par date
 * d'ouverture ; c'est l'écran qui n'en gardait qu'une, par un `.find()`. D'où son
 * titre « Carte en cours », au singulier — le défaut se lisait dans le libellé.
 */

const chargerFicheClient = vi.fn();

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
  chargerFicheClient: (id: string) => chargerFicheClient(id),
  chargerProfil: () => chargerProfil(),
  // Monte avec l'historique complet. Le niveau 1 ne l'appelle pas, mais le
  // module doit l'exporter : sans elle, l'import de `HistoriqueClient` lève.
  chargerHistoriqueCarte: () => Promise.resolve([]),
}));

const enregistrerMise = vi.fn();
const annulerMise = vi.fn();
const avancerEnvoi = vi.fn();
const modifierClient = vi.fn();

vi.mock('../ecritures', () => ({
  definirConsentementAvis: vi.fn(),
  ouvrirCarte: vi.fn(),
  enregistrerMise: (...args: unknown[]) => enregistrerMise(...args),
  annulerMise: (...args: unknown[]) => annulerMise(...args),
  avancerEnvoi: (...args: unknown[]) => avancerEnvoi(...args),
  modifierClient: (id: string, correction: unknown, origine: unknown) =>
    modifierClient(id, correction, origine),
}));

/** La file du téléphone, telle que la fiche la lit. Vide par défaut. */
let operationsEnFile: unknown[] = [];
vi.mock('../hors-ligne/useHorsLigne', () => ({
  useHorsLigne: () => ({
    operations: operationsEnFile,
    refus: [],
    tournee: null,
    file: null,
    stockage: 'inconnu',
  }),
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

/** Une seule carte active, loin d'être pleine. Le cas le plus courant. */
const FICHE_UNE_CARTE_EN_COURS = {
  id: 'cli7',
  nom: 'Koné',
  telephone: null,
  marche: null,
  activite: null,
  avisActifs: false,
  cartes: [
    {
      id: 'seule',
      mise: 1000,
      statut: 'active' as const,
      misesEncaissees: 12,
      ouverteLe: '2026-08-14T08:00:00.000Z',
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

/** Une carte active à un pas de la fin de son cycle. */
const FICHE_CARTE_PRESQUE_COMPLETE = {
  id: 'cli6',
  nom: 'Sidibe',
  telephone: null,
  marche: null,
  activite: null,
  avisActifs: false,
  cartes: [
    {
      id: 'kC',
      mise: 3000,
      statut: 'active' as const,
      misesEncaissees: MISES_PAR_CYCLE - 1,
      ouverteLe: '2026-08-01T08:00:00.000Z',
      clotureeLe: null,
    },
  ],
  mises: [],
};

/**
 * Un client joignable **et** consentant : le seul cas où corriger le numéro
 * coupe quelque chose. Les sept autres fiches de ce fichier ont
 * `avisActifs: false` — relevé en relisant le plan, le 2026-09-10 : sans cette
 * fiche, l'épreuve de l'avertissement passerait au vert sans rien voir.
 */
const FICHE_AVEC_AVIS = {
  ...FICHE_UNE_CARTE_EN_COURS,
  id: 'cli8',
  nom: 'Konaté',
  telephone: '0709201790' as string | null,
  marche: 'BLE ZOKOU' as string | null,
  avisActifs: true,
};

beforeEach(() => {
  annulerMise.mockResolvedValue('annulee');
  avancerEnvoi.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  chargerFicheClient.mockReset();
  enregistrerMise.mockReset();
  annulerMise.mockReset();
  avancerEnvoi.mockReset();
  operationsEnFile = [];
  delete (window.navigator as unknown as { onLine?: boolean }).onLine;
  vi.useRealTimers();
});

/**
 * Les noms des boutons d'encaissement portent l'insécable de `formatMontant`,
 * et `findByRole` compare le nom accessible sans normaliser les espaces. Ils se
 * construisent donc, ils ne se tapent pas.
 */
const ENCAISSER_6000 = `Encaisser ${formatMontant(6000)} FCFA`;
const ENCAISSER_2000 = `Encaisser ${formatMontant(2000)} FCFA`;
const ENCAISSER_3000 = `Encaisser ${formatMontant(3000)} FCFA`;

const MISE_ENREGISTREE = { ok: true, miseId: 'mise-1', operationId: 'op-1' };

/**
 * Laisse l'enregistrement simulé rendre la main : des promesses, aucun minuteur.
 * Utilisable sous minuteurs simulés, où `waitFor` resterait suspendu.
 */
const laisserEcrire = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

function rendreFiche(proprietes: Partial<Parameters<typeof FicheClient>[0]> = {}) {
  return render(
    <FicheClient
      clientId="cli3"
      revision={0}
      collecteurId="col1"
      onFermer={vi.fn()}
      onEcriture={vi.fn()}
      onRetrait={vi.fn()}
      {...proprietes}
    />,
  );
}

describe('fiche d’un client à plusieurs cartes', () => {
  it('montre les deux cartes en cours, pas une', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Cartes en cours/)).toBeTruthy();

    // On compte les blocs de carte, et non les occurrences d'un montant : le
    // bouton d'encaissement porte lui aussi la mise, et un `getByText` sur
    // « 1 000 » en trouve désormais deux sans qu'une seule carte de plus soit
    // rendue. « Mise / jour » n'appartient qu'à `CarteCollecte`.
    const enTetes = await screen.findAllByText('Mise / jour');
    expect(enTetes).toHaveLength(2);

    // Et ce sont bien deux cartes distinctes : deux montants, pas le même deux fois.
    const montants = enTetes.map((n) => n.nextElementSibling?.textContent ?? '');
    expect(montants.some((t) => /5\s*000/.test(t))).toBe(true);
    expect(montants.some((t) => /1\s*000/.test(t))).toBe(true);
  });

  it('offre les deux portes sur la carte au bout de son cycle', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // Un choix offert à un endroit et pas aux autres se lit comme un défaut.
    expect(await screen.findByRole('button', { name: 'Aller au retrait' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Activer une carte' })).toBeTruthy();
  });

  it('propose d’ouvrir une carte de plus sans attendre la fin du cycle', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_UNE_CARTE_EN_COURS);

    render(
      <FicheClient
        clientId="cli7"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // `cartes_multiples` nomme deux besoins, pas un : « un client épargne pour
    // deux choses à deux rythmes » autant que « un client qui a rempli sa carte
    // veut continuer ». L'interface n'ouvrait la porte que sur le second, et un
    // client à 12/31 n'avait aucun chemin vers une seconde carte.
    expect(await screen.findByRole('button', { name: 'Activer une carte' })).toBeTruthy();

    // Mais rien qui parle de fin de cycle : la carte n'est pas pleine.
    expect(screen.queryByRole('button', { name: 'Aller au retrait' })).toBeNull();
    expect(screen.queryByText(/Cycle terminé/)).toBeNull();

    // Et le panneau déplié non plus. Il annonçait « La carte pleine reste
    // ouverte » — vrai au bout d'un cycle, faux à 12/31, et c'est précisément
    // ce cas que ce bloc vient d'ouvrir. Le plan du 2026-08-25 avait relevé le
    // piège et l'avait contourné en ne posant pas le bloc ici ; le contournement
    // ne tient plus, donc la phrase est vérifiée.
    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    expect(screen.queryByText(/pleine/)).toBeNull();
    expect(screen.getByText(/Ce qui est déjà ouvert ne bouge pas/)).toBeTruthy();
  });

  it('ne promet plus que la nouvelle carte attend le retrait', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByText(/Cartes en cours/);
    // « La nouvelle carte s'ouvre ensuite » était la règle d'une seule carte
    // active. Elle est tombée avec l'index.
    expect(screen.queryByText(/s’ouvre ensuite/)).toBeNull();
  });

  it('porte le montant de sa propre carte sur le bouton de la carte choisie', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // La mise est immuable : le bouton qui la déclenche doit dire ce qu'il
    // encaisse. Il est dans la carte, donc il n'y en a qu'un — celui de la
    // carte choisie.
    expect(await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Encaisser 2 000 FCFA' })).toBeNull();

    // Et il suit la carte : le point de la seconde l'amène en face.
    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));

    expect(await screen.findByRole('button', { name: 'Encaisser 2 000 FCFA' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Encaisser 6 000 FCFA' })).toBeNull();
  });

  it('met la mise sur le téléphone dès l’appui, sur la bonne carte, envoyable dans six secondes', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche();

    // Le tri met la plus avancée en premier : kB (20 mises) est en face, kA
    // (5 mises) est sa voisine. On amène la voisine, et c'est elle qu'on
    // touche — encaisser sur la mauvaise carte ne se rattrape pas.
    expect(await screen.findByRole('button', { name: ENCAISSER_6000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));
    fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_2000 }));

    // Plus de minuteur avant l'écriture (spec J2b §7) : l'opération est sur le
    // disque dès l'appui, et c'est son échéance qui porte le sursis. Un
    // rechargement pendant les six secondes ne la perd plus (écart 4).
    await waitFor(() => expect(enregistrerMise).toHaveBeenCalledTimes(1));
    const [collecteur, carte, montant, quand, options] = enregistrerMise.mock.calls[0]!;
    expect([collecteur, carte, montant]).toEqual(['col1', 'kA', 2000]);
    expect(quand).toBeInstanceOf(Date);
    expect(options).toEqual({ sursisMs: 6000 });
  });

  it('ne compte le jour qu’une fois la mise sur le téléphone', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    let ecrire: (valeur: unknown) => void = () => {};
    enregistrerMise.mockImplementation(
      () =>
        new Promise((resoudre) => {
          ecrire = resoudre;
        }),
    );
    rendreFiche();

    // kB est en face : 20 mises sur 31.
    expect(await screen.findByText('20/31 j · 65 %')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));

    // Rien n'est montré comme fait avant d'être sur le disque (§4.1).
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();

    await act(async () => {
      ecrire(MISE_ENREGISTREE);
    });
    await laisserEcrire();

    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
  });

  it('n’enregistre qu’une mise sur un double appui', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    let ecrire: (valeur: unknown) => void = () => {};
    enregistrerMise.mockImplementationOnce(
      () =>
        new Promise((resoudre) => {
          ecrire = resoudre;
        }),
    );
    rendreFiche();

    const bouton = await screen.findByRole('button', { name: ENCAISSER_6000 });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await act(async () => {
      ecrire(MISE_ENREGISTREE);
    });
    await laisserEcrire();

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('« Annuler » retire la mise du téléphone, et la case se revide', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    annulerMise.mockResolvedValue('annulee');
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    // Les minuteurs sont gelés **avant** l'appui : le sursis se pose dès que
    // l'écriture rend la main, et un minuteur né sous l'horloge réelle ne
    // répond pas à `advanceTimersByTime`.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await laisserEcrire();

    // L'opération n'était jamais partie : la retirer de la file suffit, et rien
    // n'a touché le serveur.
    expect(annulerMise).toHaveBeenCalledWith('col1', 'op-1');
    expect(screen.getByRole('button', { name: ENCAISSER_6000 })).toBeTruthy();
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();
  });

  it('retire « Annuler » à la fin du sursis, et garde la mise', async () => {
    // Passé l'échéance, le synchroniseur peut l'envoyer. Laisser « Annuler » à
    // l'écran promettrait un retour arrière que la base refuse.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(annulerMise).not.toHaveBeenCalled();
  });

  it('ne promet rien quand « Annuler » arrive après l’échéance', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    // L'horloge du téléphone a dépassé l'échéance entre l'affichage et l'appui.
    annulerMise.mockResolvedValue('partie');
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await laisserEcrire();

    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
  });

  it('efface la mise annulée même si l’arrière-plan l’a fait partir pendant l’annulation', async () => {
    // L'annulation attend la base quelques millisecondes. Si l'application passe
    // en arrière-plan à ce moment, la purge remplace l'attente par la même mise
    // marquée partie. L'annulation a pourtant réussi : l'écran ne doit laisser
    // ni « encaissé » ni un jour de plus sur une mise qui n'existe plus.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    let rendreAnnulation: (issue: 'annulee') => void = () => {};
    annulerMise.mockImplementation(
      () =>
        new Promise<'annulee'>((resoudre) => {
          rendreAnnulation = resoudre;
        }),
    );
    const onEcriture = vi.fn();
    rendreFiche({ onEcriture });
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    onEcriture.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    delete (document as unknown as { visibilityState?: DocumentVisibilityState }).visibilityState;

    await act(async () => {
      rendreAnnulation('annulee');
    });
    await laisserEcrire();

    expect(screen.queryByText(/FCFA encaissé/)).toBeNull();
    expect(screen.getByRole('button', { name: ENCAISSER_6000 })).toBeTruthy();
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();
    expect(onEcriture).toHaveBeenCalledTimes(1);
  });

  it('laisse le bandeau sur sa carte quand on en choisit une autre', async () => {
    // Le décompte court pendant que le collecteur va regarder l'autre carnet —
    // c'est même le geste que la rangée existe pour rendre facile. La mise qui
    // attend ne peut pas disparaître de l'écran à ce moment-là.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));

    // kA est désormais la carte choisie et porte son bouton — et le bandeau de
    // kB est toujours là, avec son « Annuler ».
    expect(screen.getByRole('button', { name: ENCAISSER_2000 })).toBeTruthy();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('fait partir tout de suite la mise en sursis quand on encaisse une autre carte', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise
      .mockResolvedValueOnce(MISE_ENREGISTREE)
      .mockResolvedValueOnce({ ok: true, miseId: 'mise-2', operationId: 'op-2' });
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(avancerEnvoi).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_2000 }));
    await laisserEcrire();

    // Une seule attente à la fois. Celle qu'on abandonne ne se perd pas : elle
    // est déjà sur le disque, elle part maintenant au lieu de dans quatre secondes.
    expect(avancerEnvoi).toHaveBeenCalledWith('col1', 'op-1');
    expect(enregistrerMise).toHaveBeenCalledTimes(2);
    expect(enregistrerMise.mock.calls[1]!.slice(0, 3)).toEqual(['col1', 'kA', 2000]);
  });

  it('laisse la case vide sur un refus du téléphone, et « Réessayer » refait un appui', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValueOnce({
      ok: false,
      echec: {
        code: 'STOCKAGE',
        message:
          'Enregistrement impossible sur ce téléphone : rien n’a été compté. Libère de la place, puis réessaie.',
      },
    });
    rendreFiche();

    fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_6000 }));

    expect(await screen.findByText(/rien n’a été compté/)).toBeTruthy();
    // Rien n'est sur le disque : la case le dit, et il n'y a rien à annuler.
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();

    enregistrerMise.mockResolvedValueOnce(MISE_ENREGISTREE);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(enregistrerMise).toHaveBeenCalledTimes(2));
    expect(enregistrerMise.mock.calls[1]!.slice(0, 3)).toEqual(['col1', 'kB', 6000]);
  });
});

/**
 * Le sursis est une échéance, pas une promesse d'oubli.
 *
 * Depuis J2b, la mise est sur le disque dès l'appui : ni une fiche refermée, ni
 * une application tuée en arrière-plan ne peuvent la perdre. Ce qui reste à
 * garantir, c'est qu'elle n'attende pas six secondes pour rien quand plus
 * personne ne regarde « Annuler ».
 */
describe('ce qui attend part quand on cesse de regarder', () => {
  it('avance l’envoi quand la fiche se referme pendant le sursis', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    const { rerender } = rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(avancerEnvoi).not.toHaveBeenCalled();

    // `clientId` à `null` referme la feuille, qui ne rend plus rien.
    act(() => {
      rerender(
        <FicheClient
          clientId={null}
          revision={0}
          collecteurId="col1"
          onFermer={vi.fn()}
          onEcriture={vi.fn()}
          onRetrait={vi.fn()}
        />,
      );
    });

    expect(avancerEnvoi).toHaveBeenCalledTimes(1);
    expect(avancerEnvoi).toHaveBeenCalledWith('col1', 'op-1');
  });

  it('avance l’envoi quand l’application passe en arrière-plan', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // `visibilityState` est un accesseur de `Document.prototype`, pas une
    // propriété propre du document : `vi.spyOn` n'a rien à remplacer dessus.
    // On pose l'accesseur sur l'instance, et on le retire ensuite.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    delete (document as unknown as { visibilityState?: DocumentVisibilityState }).visibilityState;

    expect(avancerEnvoi).toHaveBeenCalledTimes(1);
    expect(avancerEnvoi).toHaveBeenCalledWith('col1', 'op-1');
  });

  it('n’avance rien quand le sursis est déjà passé', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    const { rerender } = rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    act(() => {
      rerender(
        <FicheClient
          clientId={null}
          revision={0}
          collecteurId="col1"
          onFermer={vi.fn()}
          onEcriture={vi.fn()}
          onRetrait={vi.fn()}
        />,
      );
    });

    expect(avancerEnvoi).not.toHaveBeenCalled();
    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('garde le bandeau et « Annuler » quand la fiche se relit pendant le sursis', async () => {
    // Le geste signale un changement, la coquille fait monter `revision`, la
    // fiche se relit — et compte déjà la mise, puisque la tournée lue porte la
    // file. Jusqu'à J2b la fiche repassait par « Lecture… » et démontait le
    // bandeau : « Annuler » aurait disparu sous le doigt.
    const ficheRelue = {
      ...FICHE_DEUX_CARTES_ENCAISSABLES,
      cartes: FICHE_DEUX_CARTES_ENCAISSABLES.cartes.map((c) =>
        c.id === 'kB' ? { ...c, misesEncaissees: 21 } : c,
      ),
    };
    chargerFicheClient.mockResolvedValueOnce(FICHE_DEUX_CARTES_ENCAISSABLES).mockResolvedValue(ficheRelue);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    const { rerender } = rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      rerender(
        <FicheClient
          clientId="cli3"
          revision={1}
          collecteurId="col1"
          onFermer={vi.fn()}
          onEcriture={vi.fn()}
          onRetrait={vi.fn()}
        />,
      );
    });
    await laisserEcrire();

    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    // Compté une fois : la relecture et l'attente disent le même jour.
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
    expect(screen.queryByText(/22\/31 j/)).toBeNull();
  });
});

describe('numéro de cycle : l’ancienneté, jamais l’avancement', () => {
  it('numérote depuis la date d’ouverture, pas depuis le tri d’affichage', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_CYCLE_ET_AVANCEMENT);

    render(
      <FicheClient
        clientId="cli2"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
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
    //
    // Le montant se lit sur le panneau « Mise / jour » et non par un motif
    // libre dans toute la carte : depuis que le bouton d'encaissement vit dans
    // la carte choisie, il répète la même mise, et `getByText` y trouverait
    // deux correspondances.
    const carteAncienne = screen.getByText('Cycle 1').closest('.rounded-xl') as HTMLElement;
    expect(within(carteAncienne).getByText('Mise / jour').nextElementSibling?.textContent).toMatch(
      /4\s*000/,
    );

    // La carte récente est la seconde ouverte : cycle 2, même si elle est moins
    // avancée et se retrouve donc affichée en second (tri par avancement).
    const carteRecente = screen.getByText('Cycle 2').closest('.rounded-xl') as HTMLElement;
    expect(within(carteRecente).getByText('Mise / jour').nextElementSibling?.textContent).toMatch(
      /2\s*000/,
    );
  });
});

describe('client sans carte active : le bloc d’ouverture reste atteignable', () => {
  it('propose d’ouvrir une première carte au client qui n’en a jamais eu', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_SANS_CARTE);

    render(
      <FicheClient
        clientId="cli4"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
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
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    expect(await screen.findByText('Ouvrir une nouvelle carte')).toBeTruthy();
    expect(screen.queryByText('Ouvrir sa première carte')).toBeNull();
  });
});

describe('fiche absente du téléphone', () => {
  it('dit que la fiche manque sur ce téléphone, sans accuser le réseau', async () => {
    // Depuis J2b, la fiche se lit sur le téléphone : une lecture qui échoue
    // veut dire que la tournée n'y a jamais été chargée, pas que le réseau manque.
    chargerFicheClient.mockRejectedValue(new Error('tournée absente'));
    rendreFiche({ clientId: 'cli1' });

    expect(
      await screen.findByText(
        'Fiche indisponible sur ce téléphone. Connecte-toi une fois au réseau pour la charger.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Vérifie le réseau/)).toBeNull();
  });

  /**
   * `chargerFicheClient` rend `null` pour deux raisons qu'on ne distingue pas
   * ici : le client a été supprimé, ou cette tournée n'a jamais été chargée sur
   * ce téléphone. Hors ligne, seule la seconde est plausible — et dire
   * « supprimée » à un collecteur qui a le client sous les yeux lui apprend que
   * l'écran se trompe.
   */
  it('hors ligne, une fiche absente dit qu’elle n’est pas chargée, pas qu’elle est supprimée', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    chargerFicheClient.mockResolvedValue(null);
    rendreFiche({ clientId: 'cli1' });

    expect(
      await screen.findByText(
        'Fiche indisponible sur ce téléphone. Connecte-toi une fois au réseau pour la charger.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/peut-être été supprimée/)).toBeNull();
  });

  it('en ligne, une fiche absente dit qu’elle a peut-être été supprimée', async () => {
    chargerFicheClient.mockResolvedValue(null);
    rendreFiche({ clientId: 'cli1' });

    expect(await screen.findByText('Fiche introuvable. Elle a peut-être été supprimée.')).toBeTruthy();
  });
});

/**
 * La carte choisie vit dans `FicheClient`, pas dans `CartesEnCours` : voir le
 * commentaire posé sur ce `useState`. Une relecture ne doit jamais ramener le
 * choix sur la carte la plus avancée — même quand ce n'est pas celle qu'on
 * vient de payer.
 */
describe('la carte choisie survit à la relecture qui suit un encaissement', () => {
  it('reste sur la carte la moins avancée après le sursis et la relecture qui suit', async () => {
    const ficheApresEcriture = {
      ...FICHE_DEUX_CARTES_ENCAISSABLES,
      cartes: FICHE_DEUX_CARTES_ENCAISSABLES.cartes.map((c) =>
        c.id === 'kA' ? { ...c, misesEncaissees: 6 } : c,
      ),
    };
    chargerFicheClient
      .mockResolvedValueOnce(FICHE_DEUX_CARTES_ENCAISSABLES)
      .mockResolvedValue(ficheApresEcriture);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    const { rerender } = rendreFiche();

    // kB (20 mises) est en tête ; on amène kA (5 mises), la moins avancée.
    await screen.findByRole('button', { name: ENCAISSER_6000 });
    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));
    const bouton = await screen.findByRole('button', { name: ENCAISSER_2000 });

    vi.useFakeTimers();
    fireEvent.click(bouton);
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // La coquille relit la fiche en changeant `revision`.
    act(() => {
      rerender(
        <FicheClient
          clientId="cli3"
          revision={1}
          collecteurId="col1"
          onFermer={vi.fn()}
          onEcriture={vi.fn()}
          onRetrait={vi.fn()}
        />,
      );
    });
    await laisserEcrire();

    // kA est toujours la carte choisie : c'est son bouton, qui porte sa propre
    // mise, qui est à l'écran — pas une position de carrousel qui coïnciderait
    // par hasard avec le tri par avancement.
    expect(screen.getByRole('button', { name: ENCAISSER_2000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: ENCAISSER_6000 })).toBeNull();
  });
});

/**
 * `mises` est append-only : une mise encore annulable n'est pas actée, donc le
 * panneau de fin de cycle — qui propose de rendre l'argent — ne doit pas
 * apparaître tant qu'elle peut encore l'être.
 */
describe('fin de cycle : le panneau attend que la mise ne soit plus annulable', () => {
  it('ne montre pas « Cycle terminé » tant que la mise du jour peut encore être annulée', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_CARTE_PRESQUE_COMPLETE);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche({ clientId: 'cli6' });

    const bouton = await screen.findByRole('button', { name: ENCAISSER_3000 });

    vi.useFakeTimers();
    fireEvent.click(bouton);
    await laisserEcrire();

    // La case affiche 31/31, et la mise peut encore être retirée de la file :
    // le panneau de fin de cycle ne doit pas apparaître à côté du bandeau.
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aller au retrait' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // Le sursis est passé : la mise n'est plus annulable, le panneau peut enfin
    // proposer de rendre l'argent ou d'ouvrir une carte de plus.
    expect(screen.getByRole('button', { name: 'Aller au retrait' })).toBeTruthy();
  });
});

/**
 * Le rappel du composant appelant n'a rien à voir avec le succès de
 * l'enregistrement : un rejet qui y prend naissance ne doit pas se faire passer
 * pour un échec — avec un « Réessayer » qui écrirait une seconde mise.
 */
describe('un rappel qui lève après coup ne doit pas se faire passer pour un échec d’écriture', () => {
  it('ne montre aucune erreur si onEcriture lève après un enregistrement réussi', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);

    const onEcriture = vi.fn(() => {
      throw new Error('boom');
    });

    // `onEcriture` est hors de tout `try` : son rejet synchrone devient un rejet
    // de promesse « non gérée » au sens de Node — attendu ici, puisque c'est le
    // rappel qui lève exprès. Vitest ignore un rejet non géré dès qu'un second
    // écouteur existe sur l'événement (voir `listenForErrors` dans son
    // runtime) : ce test en pose un, pour la seule durée du test.
    //
    // Ce seuil est un détail d'implémentation de Vitest, pas un contrat. Si une
    // montée de version casse ce test, c'est la bonne direction — il passera au
    // rouge, jamais au vert silencieux.
    //
    // `process` n'a pas de types ici : `tsconfig.app.json` ne charge que
    // `vite/client`, pas `@types/node`.
    const proc = (
      globalThis as unknown as {
        process: {
          on: (evenement: string, ecouteur: () => void) => void;
          off: (evenement: string, ecouteur: () => void) => void;
        };
      }
    ).process;
    const surRejetAttendu = () => {};
    proc.on('unhandledRejection', surRejetAttendu);

    try {
      rendreFiche({ onEcriture });

      fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_6000 }));

      await waitFor(() => expect(onEcriture).toHaveBeenCalledTimes(1));

      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
      // Le sursis est bien posé : « Annuler » est là.
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
      expect(enregistrerMise).toHaveBeenCalledTimes(1);
    } finally {
      proc.off('unhandledRejection', surRejetAttendu);
    }
  });
});

describe('quand l’enregistrement ne rend rien du tout', () => {
  it('ouvre une sortie sans rien promettre quand l’enregistrement lève', async () => {
    // `enregistrerMise` rend `{ ok: false }` sur tout refus connu. Un rejet ne
    // devrait jamais arriver ; s'il arrive, rien ne dit si l'opération a été
    // écrite avant. Sans filet, l'écran resterait figé, sans sortie.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockRejectedValue(new Error('disque'));
    rendreFiche();

    fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_6000 }));

    expect(await screen.findByText(/Vérifie la carte avant de réessayer/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('le dit tout de suite quand la session manque, sans rien écrire', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    rendreFiche({ collecteurId: null });

    fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_6000 }));

    expect(enregistrerMise).not.toHaveBeenCalled();
    expect(screen.getByText(/Session perdue/)).toBeTruthy();
  });
});

/**
 * Les gestes restés en ligne, et leurs garde-fous (spec J2b §7).
 *
 * La clôture recalcule au serveur ce qui est rendu : tant qu'une opération de la
 * carte est sur le téléphone, ce calcul en manquerait une. La correction de
 * fiche et le consentement sont des modifications : sans réseau, ou sur un
 * client que le serveur ne connaît pas encore, ils partiraient dans le vide.
 */
describe('les gestes restés en ligne attendent la file et le réseau', () => {
  it('n’offre pas le retrait tant qu’une mise de la carte attend l’envoi', async () => {
    operationsEnFile = [operationMise(1, { carteId: 'k1' })];
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);
    rendreFiche({ clientId: 'cli1' });

    const retrait = (await screen.findByRole('button', { name: 'Aller au retrait' })) as HTMLButtonElement;

    expect(retrait.disabled).toBe(true);
    expect(screen.getByText('1 mise de cette carte pas encore envoyée.')).toBeTruthy();
  });

  it('offre le retrait quand la seule opération de la carte est un refus à consigner', async () => {
    // Refusée par le serveur, elle ne partira jamais : la clôture calcule juste
    // sans elle, et « pas encore envoyée » mentirait.
    operationsEnFile = [
      operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' }),
    ];
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);
    rendreFiche({ clientId: 'cli1' });

    const retrait = (await screen.findByRole('button', { name: 'Aller au retrait' })) as HTMLButtonElement;

    expect(retrait.disabled).toBe(false);
    expect(screen.queryByText('1 mise de cette carte pas encore envoyée.')).toBeNull();
  });

  it('demande le réseau pour le retrait, la correction de fiche et les avis', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    chargerFicheClient.mockResolvedValue({
      ...FICHE_DEUX_CARTES,
      telephone: '0709201790',
      avisActifs: true,
    });
    rendreFiche({ clientId: 'cli1' });

    const retrait = (await screen.findByRole('button', { name: 'Aller au retrait' })) as HTMLButtonElement;

    expect(retrait.disabled).toBe(true);
    expect(screen.getByText('Le retrait demande le réseau.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Corriger la fiche' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Ne plus prévenir' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Corriger la fiche ou les avis demande le réseau.')).toBeTruthy();
  });

  it('ne laisse pas corriger un client pas encore envoyé', async () => {
    operationsEnFile = [operationClientCarte(1, { clientId: 'cli8', carteId: 'seule' })];
    chargerFicheClient.mockResolvedValue(FICHE_AVEC_AVIS);
    rendreFiche({ clientId: 'cli8' });

    const corriger = (await screen.findByRole('button', { name: 'Corriger la fiche' })) as HTMLButtonElement;

    expect(corriger.disabled).toBe(true);
    expect(
      screen.getByText('Client pas encore envoyé : sa fiche se corrige une fois arrivé au serveur.'),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Ne plus prévenir' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marque « pas encore envoyée » la mise en file, et elle seule, dans les derniers versements', async () => {
    operationsEnFile = [operationMise(1, { carteId: 'seule' })];
    chargerFicheClient.mockResolvedValue({
      ...FICHE_UNE_CARTE_EN_COURS,
      mises: [
        { id: 'mise-1', montant: 1000, encaisseLe: '2026-09-13T09:00:00.000Z', estCommission: false },
        { id: 'ancienne', montant: 1000, encaisseLe: '2026-09-12T09:00:00.000Z', estCommission: false },
      ],
    });
    rendreFiche({ clientId: 'cli7' });

    expect(await screen.findByText('1 mise de cette carte pas encore envoyée.')).toBeTruthy();
    expect(screen.getAllByText(/· pas encore envoyée$/)).toHaveLength(1);
  });
});

/**
 * L'historique complet, et la pilule dessinée à la main qui le précédait.
 *
 * ## Ce que la section « Cartes précédentes » cachait
 *
 * Elle vivait sous un `fiche.cartes.length > 1` — donc invisible pour un client
 * qui n'a qu'une carte, c'est-à-dire la majorité. Un historique court reste un
 * historique, et le cacher surprend le jour où il compte.
 *
 * ## La pilule
 *
 * Elle était dessinée à la main, avec ses propres classes et ses propres mots :
 * « Cycle tenu » et « Rendue avant la fin ». Ni l'un ni l'autre n'est dans
 * l'union `Statut`, et la règle 4.11 du système de design dit « une seule
 * table ». Le compte X/31, à deux centimètres de là, porte déjà la nuance que
 * « Rendue avant la fin » voulait dire.
 */
describe('la porte vers l’historique complet', () => {
  it('mène à l’écran de toutes les cartes', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_TOUTES_CLOTUREES);

    render(
      <FicheClient
        clientId="cli5"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /historique complet/i }));

    expect(await screen.findByText(/toutes les cartes/i)).toBeTruthy();
  });

  it('propose cette porte même à un client qui n’a qu’une carte', async () => {
    // Le défaut d'origine : la section entière était sous `cartes.length > 1`.
    chargerFicheClient.mockResolvedValue(FICHE_CARTE_PRESQUE_COMPLETE);

    render(
      <FicheClient
        clientId="cli6"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: /historique complet/i })).toBeTruthy();
  });

  it('revient à la fiche sans la refermer', async () => {
    // La flèche de l'historique remonte d'un cran. `onFermer` de la fiche ne
    // doit pas être appelé : le collecteur perdrait le client qu'il consultait.
    const fermetures: number[] = [];
    chargerFicheClient.mockResolvedValue(FICHE_TOUTES_CLOTUREES);

    render(
      <FicheClient
        clientId="cli5"
        revision={0}
        collecteurId="col1"
        onFermer={() => fermetures.push(1)}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /historique complet/i }));
    await screen.findByText(/toutes les cartes/i);

    fireEvent.click(screen.getByLabelText('Revenir à la fiche'));

    expect(await screen.findByRole('button', { name: /historique complet/i })).toBeTruthy();
    expect(fermetures).toEqual([]);
  });

  it('n’écrit plus « Rendue avant la fin » — le statut vient de BadgeStatut', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_TOUTES_CLOTUREES);

    render(
      <FicheClient
        clientId="cli5"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByText(/Cartes précédentes/);

    expect(screen.queryByText(/rendue avant la fin/i)).toBeNull();
    expect(screen.queryByText(/cycle tenu/i)).toBeNull();
  });

  it('dit les mots de la table commune, et eux seuls', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_TOUTES_CLOTUREES);

    render(
      <FicheClient
        clientId="cli5"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    const section = (await screen.findByText(/Cartes précédentes/)).parentElement!;

    // k9 : 31/31, donc « Cycle terminé ». k8 : 10/31, donc « Clôturée ».
    expect(within(section).getByText('Cycle terminé')).toBeTruthy();
    expect(within(section).getByText('Clôturée')).toBeTruthy();
  });
});

/**
 * Le défilement du fond, pendant que l'historique est ouvert.
 *
 * `Feuille` pose `document.body.style.overflow = 'hidden'` et le restaure en se
 * démontant. L'historique **remplace** la `Feuille` — c'est un plein écran, et
 * l'imbriquer empilerait deux en-têtes — donc son ouverture rendait le
 * défilement au document derrière l'écran. Sur un téléphone, ça se voit tout de
 * suite : on fait défiler l'historique, on arrive au bout, et c'est la liste des
 * clients qui se met à bouger dessous.
 *
 * Défaut introduit par le plein écran, corrigé au même endroit. `jsdom`
 * n'applique pas les styles, mais il tient bien la propriété — c'est elle que
 * ces deux épreuves lisent.
 */
describe('l’historique ne rend pas le défilement au fond', () => {
  it('bloque le document pendant qu’il est ouvert', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_TOUTES_CLOTUREES);

    render(
      <FicheClient
        clientId="cli5"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /historique complet/i }));
    await screen.findByText(/toutes les cartes/i);

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('le rend en revenant à la fiche, et pas avant', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_TOUTES_CLOTUREES);

    const { unmount } = render(
      <FicheClient
        clientId="cli5"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /historique complet/i }));
    await screen.findByText(/toutes les cartes/i);
    fireEvent.click(screen.getByLabelText('Revenir à la fiche'));

    // Toujours bloqué : la `Feuille` est revenue, et c'est elle qui bloque.
    await screen.findByRole('button', { name: /historique complet/i });
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});

/**
 * La correction d'une fiche.
 *
 * Une faute de frappe faite au marché était définitive jusqu'au 2026-09-11 :
 * le collecteur n'écrivait dans `clients` qu'à l'inscription, et aucun écran
 * d'administration ne touche cette table.
 *
 * Le formulaire est un `<form>` nommé, et ces épreuves visent ses boutons par
 * `within`. La fiche porte d'autres « Annuler » — celui du sursis
 * d'encaissement, notamment — et une requête sur tout l'écran pourrait cliquer
 * le mauvais.
 */
describe('corriger la fiche d’un client', () => {
  beforeEach(() => {
    modifierClient.mockReset().mockResolvedValue({ ok: true, ecrit: true });
  });

  const formulaire = () => within(screen.getByRole('form', { name: 'Corriger la fiche' }));

  async function ouvrirLeFormulaire(
    fiche: typeof FICHE_UNE_CARTE_EN_COURS | typeof FICHE_AVEC_AVIS = FICHE_UNE_CARTE_EN_COURS,
  ) {
    const onEcriture = vi.fn();
    chargerFicheClient.mockResolvedValue(fiche);
    render(
      <FicheClient
        clientId={fiche.id}
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={onEcriture}
        onRetrait={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Corriger la fiche' }));
    return { onEcriture };
  }

  it('ouvre les quatre champs, remplis de ce qui est en base', async () => {
    await ouvrirLeFormulaire(FICHE_AVEC_AVIS);

    expect((formulaire().getByLabelText('Nom') as HTMLInputElement).value).toBe('Konaté');
    expect((formulaire().getByLabelText('Téléphone') as HTMLInputElement).value).toBe('0709201790');
    expect((formulaire().getByLabelText('Marché') as HTMLInputElement).value).toBe('BLE ZOKOU');
    expect((formulaire().getByLabelText('Activité') as HTMLInputElement).value).toBe('');
  });

  it('envoie la correction et la valeur d’origine', async () => {
    await ouvrirLeFormulaire(FICHE_AVEC_AVIS);

    fireEvent.change(formulaire().getByLabelText('Nom'), { target: { value: 'Konaté Ali' } });
    fireEvent.click(formulaire().getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(modifierClient).toHaveBeenCalledTimes(1));
    const [id, correction, origine] = modifierClient.mock.calls[0]!;
    expect(id).toBe('cli8');
    expect(correction).toMatchObject({ nom: 'Konaté Ali', telephone: '0709201790' });
    expect(origine).toEqual({
      nom: 'Konaté',
      telephone: '0709201790',
      marche: 'BLE ZOKOU',
      activite: '',
    });
  });

  it('referme le formulaire et relit la fiche après l’enregistrement', async () => {
    const { onEcriture } = await ouvrirLeFormulaire(FICHE_AVEC_AVIS);
    const lecturesAvant = chargerFicheClient.mock.calls.length;

    fireEvent.change(formulaire().getByLabelText('Nom'), { target: { value: 'Konaté Ali' } });
    fireEvent.click(formulaire().getByRole('button', { name: 'Enregistrer' }));

    // La fiche relue est la seule preuve à l'écran que la correction a pris :
    // sans relecture, le titre garderait l'ancien nom au-dessus d'un
    // formulaire refermé.
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Corriger la fiche' })).toBeNull(),
    );
    expect(chargerFicheClient.mock.calls.length).toBeGreaterThan(lecturesAvant);
    expect(onEcriture).toHaveBeenCalled();
  });

  it('prévient que les avis seront coupés, avant d’enregistrer', async () => {
    // Le collecteur doit savoir qu'il devra redemander le consentement. Le lui
    // apprendre après coup, c'est le laisser croire que les avis continuent.
    // 68 clients sur 81 ont les avis actifs en production : c'est le message
    // que cet écran affichera le plus souvent.
    await ouvrirLeFormulaire(FICHE_AVEC_AVIS);

    fireEvent.change(formulaire().getByLabelText('Téléphone'), { target: { value: '0700000009' } });

    expect(formulaire().getByText(/avis seront coupés/i)).toBeTruthy();
    expect(modifierClient).not.toHaveBeenCalled();
  });

  it('ne prévient pas quand seul le nom change', async () => {
    await ouvrirLeFormulaire(FICHE_AVEC_AVIS);

    fireEvent.change(formulaire().getByLabelText('Nom'), { target: { value: 'Konaté Ali' } });

    expect(formulaire().queryByText(/avis seront coupés/i)).toBeNull();
  });

  it('ne prévient pas un client qui n’avait pas accepté les avis', async () => {
    // Rien à couper : annoncer une coupure serait une phrase fausse, et sur cet
    // écran une phrase fausse coûte un appel au client pour rien.
    await ouvrirLeFormulaire();

    fireEvent.change(formulaire().getByLabelText('Téléphone'), { target: { value: '0700000009' } });

    expect(formulaire().queryByText(/avis seront coupés/i)).toBeNull();
  });

  it('montre le refus du serveur et garde la saisie', async () => {
    modifierClient.mockResolvedValue({
      ok: false,
      echec: {
        code: 'RIEN_ECRIT',
        message: 'Le serveur n’a rien changé. Reconnecte-toi et réessaie.',
      },
    });
    await ouvrirLeFormulaire(FICHE_AVEC_AVIS);

    fireEvent.change(formulaire().getByLabelText('Nom'), { target: { value: 'Konaté Ali' } });
    fireEvent.click(formulaire().getByRole('button', { name: 'Enregistrer' }));

    expect(await formulaire().findByRole('alert')).toBeTruthy();
    // La saisie reste : la retaper au marché, debout, serait la seconde erreur.
    expect((formulaire().getByLabelText('Nom') as HTMLInputElement).value).toBe('Konaté Ali');
  });

  it('revient à la fiche sans écrire quand on annule', async () => {
    await ouvrirLeFormulaire(FICHE_AVEC_AVIS);

    fireEvent.change(formulaire().getByLabelText('Nom'), { target: { value: 'Perdu' } });
    fireEvent.click(formulaire().getByRole('button', { name: 'Annuler' }));

    expect(modifierClient).not.toHaveBeenCalled();
    expect(screen.queryByRole('form', { name: 'Corriger la fiche' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Corriger la fiche' })).toBeTruthy();
  });

  it('donne aux deux boutons une cible de 44 px', async () => {
    await ouvrirLeFormulaire();

    for (const nom of ['Enregistrer', 'Annuler']) {
      expect(formulaire().getByRole('button', { name: nom }).className).toMatch(/min-h-11/);
    }
  });
});

/**
 * Deux défauts trouvés en relisant la tâche 3, le 2026-09-11.
 *
 * ## La saisie qui s'efface sous les doigts
 *
 * `CartesEnCours` enregistrait la mise six secondes après l'appui, puis
 * appelait `onEcriture`. La coquille faisait alors monter `revision`, et
 * jusqu'à J2b la fiche repassait par `null` avant de se relire, démontant tout
 * le bloc `{fiche && (…)}`.
 *
 * La scène est celle où l'on corrige : le collecteur encaisse, le client dit
 * « au fait, mon numéro a changé », le collecteur ouvre la correction et tape.
 * Six secondes plus tard, un brouillon logé dans le formulaire disparaissait.
 * `visibleId` a été remonté d'un cran pour la même raison ; le brouillon aussi.
 *
 * ## L'avertissement muet
 *
 * Une région vive n'annonce que ce qui change **après** son apparition :
 * insérée dans le document en même temps que son texte, elle reste muette.
 * C'est la leçon de `Pagination.tsx`. L'avertissement sur les avis était
 * inséré avec son texte ; la région qui le porte est désormais montée avec le
 * formulaire.
 */
describe('la correction résiste à ce qui se passe autour', () => {
  beforeEach(() => {
    modifierClient.mockReset().mockResolvedValue({ ok: true, ecrit: true });
  });

  it('garde la saisie quand la fiche est relue pendant la correction', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_AVEC_AVIS);
    const proprietes = {
      clientId: FICHE_AVEC_AVIS.id,
      collecteurId: 'col1',
      onFermer: vi.fn(),
      onEcriture: vi.fn(),
      onRetrait: vi.fn(),
    };
    const { rerender } = render(<FicheClient {...proprietes} revision={0} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Corriger la fiche' }));
    const formulaire = () => within(screen.getByRole('form', { name: 'Corriger la fiche' }));
    fireEvent.change(formulaire().getByLabelText('Téléphone'), { target: { value: '0700000009' } });

    // Ce que fait la coquille quand la mise différée vient de partir.
    rerender(<FicheClient {...proprietes} revision={1} />);

    const champ = (await screen.findByRole('form', { name: 'Corriger la fiche' })).querySelector(
      'input[type="tel"]',
    ) as HTMLInputElement;
    expect(champ.value).toBe('0700000009');
  });

  it('annonce l’avertissement par une région vive montée avant lui', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_AVEC_AVIS);
    render(
      <FicheClient
        clientId={FICHE_AVEC_AVIS.id}
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Corriger la fiche' }));
    const form = screen.getByRole('form', { name: 'Corriger la fiche' });

    // Avant toute saisie : la région existe déjà, vide.
    const region = form.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region!.textContent).toBe('');

    fireEvent.change(within(form).getByLabelText('Téléphone'), { target: { value: '0700000009' } });

    // Après : c'est bien dans **cette** région, et non dans une nouvelle, que
    // l'avertissement arrive.
    expect(form.querySelector('[aria-live="polite"]')).toBe(region);
    expect(region!.textContent).toMatch(/avis seront coupés/i);
  });
});

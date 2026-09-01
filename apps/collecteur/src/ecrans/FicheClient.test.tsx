import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

const enregistrerMise = vi.fn();

vi.mock('../ecritures', () => ({
  definirConsentementAvis: vi.fn(),
  ouvrirCarte: vi.fn(),
  enregistrerMise: (collecteurId: string, carteId: string, montant: number) =>
    enregistrerMise(collecteurId, carteId, montant),
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
  enregistrerMise.mockReset();
  vi.useRealTimers();
});

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

  it('n’écrit rien avant la fin du sursis, et écrit la bonne carte après', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

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

    // Le tri met la plus avancée en premier : kB (20 mises) est en face, kA
    // (5 mises) est sa voisine. On amène la voisine, et c'est elle qu'on
    // touche — encaisser sur la mauvaise carte ne se rattrape pas.
    expect(await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));

    // Le `findBy` passe avant les minuteurs simulés : `waitFor` s'appuie sur
    // les mêmes minuteurs, et l'attendre après les avoir gelés le suspendrait
    // jusqu'au délai de garde.
    const bouton = await screen.findByRole('button', { name: 'Encaisser 2 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(bouton);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(enregistrerMise).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(enregistrerMise).toHaveBeenCalledTimes(1);
    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'kA', 2000);
  });

  it('remplit la case tout de suite, avant même que rien ne soit parti', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

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

    // kB est en face : 20 mises sur 31.
    expect(await screen.findByText('20/31 j · 65 %')).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));

    // Rien n'est parti, et pourtant le jour est compté. C'est ce que le
    // collecteur vient de faire ; l'écran le dit avant la base.
    expect(enregistrerMise).not.toHaveBeenCalled();
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
  });

  it('n’écrit jamais quand on annule pendant le sursis', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

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

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Une mise écrite ne se defait pas. Annuler ne peut donc rien effacer : il
    // empêche. Le bouton d'encaissement est revenu, la case s'est revidée.
    expect(enregistrerMise).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' })).toBeTruthy();
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();
  });

  it('retire « Annuler » dès que la mise est partie', async () => {
    // Passé le sursis, l'insertion est en vol. Laisser « Annuler » à l'écran
    // promettrait un retour arrière que la base refuse.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

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

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
  });

  it('laisse le bandeau sur sa carte quand on en choisit une autre', async () => {
    // Le décompte court pendant que le collecteur va regarder l'autre carnet —
    // c'est même le geste que la rangée existe pour rendre facile. La mise qui
    // part ne peut pas disparaître de l'écran à ce moment-là.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

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

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));

    // kA est désormais la carte choisie et porte son bouton — et le bandeau de
    // kB est toujours là, avec son « Annuler ».
    expect(screen.getByRole('button', { name: 'Encaisser 2 000 FCFA' })).toBeTruthy();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('fait partir la mise en attente quand on encaisse une autre carte', async () => {
    // Une seule attente à la fois. Celle qu'on abandonne ne doit pas se perdre
    // pour autant : deux mises le même jour sont acceptées par le serveur, ce
    // n'est pas à cet écran de les interdire.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

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

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(enregistrerMise).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 2 000 FCFA' }));

    // kB part maintenant, kA prend sa place dans le sursis.
    expect(enregistrerMise).toHaveBeenCalledTimes(1);
    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'kB', 6000);

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(enregistrerMise).toHaveBeenCalledTimes(2);
    expect(enregistrerMise).toHaveBeenLastCalledWith('col1', 'kA', 2000);
  });

  it('laisse la case remplie quand le serveur refuse, et propose de réessayer', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({
      ok: false,
      echec: { code: 'RESEAU', message: 'Réseau indisponible. Réessaie.' },
    });

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

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    // Les minuteurs sont gelés **avant** l'appui : celui-ci pose le `setTimeout`
    // du sursis, et un minuteur né sous l'horloge réelle ne répond pas à
    // `advanceTimersByTime`.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    // Rendus à l'horloge réelle avant le `findBy` qui suit : il attend une
    // promesse d'écriture, et `waitFor` s'appuie sur les mêmes minuteurs.
    vi.useRealTimers();

    // La case reste remplie : elle dit ce que le collecteur croit avoir
    // encaissé. Le message dit que la base ne le sait pas encore. L'effacer
    // ferait le contraire des deux.
    expect(await screen.findByText('Réseau indisponible. Réessaie.')).toBeTruthy();
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('renvoie la même mise, sur la même carte, quand on réessaie', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({
      ok: false,
      echec: { code: 'RESEAU', message: 'Réseau indisponible. Réessaie.' },
    });

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

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    vi.useRealTimers();

    const reessayer = await screen.findByRole('button', { name: 'Réessayer' });
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm2' });
    fireEvent.click(reessayer);

    expect(enregistrerMise).toHaveBeenCalledTimes(2);
    expect(enregistrerMise).toHaveBeenLastCalledWith('col1', 'kB', 6000);
  });
});

/**
 * Le sursis est un délai, pas une promesse d'oubli.
 *
 * Le système peut tuer une application masquée sans prévenir, et une fiche
 * refermée n'a plus personne pour regarder le décompte. Dans les deux cas
 * l'écriture part maintenant.
 */
describe('ce qui attend part quand on cesse de regarder', () => {
  it('écrit tout de suite quand la fiche se referme pendant le sursis', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    const { rerender } = render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(enregistrerMise).not.toHaveBeenCalled();

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

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'kB', 6000);
  });

  it('écrit tout de suite quand l’application passe en arrière-plan', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

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

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
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

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'kB', 6000);
  });

  it('n’écrit pas deux fois quand la fiche se referme après le sursis', async () => {
    // La relecture qui suit une écriture réussie démonte cette section — la
    // fiche repasse par « Lecture… ». Sans la garde `envoyee`, ce démontage
    // renverrait la mise, et rien en base ne la retirerait.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    const { rerender } = render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(enregistrerMise).toHaveBeenCalledTimes(1);

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

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
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

describe('quand l’écriture ne rend rien du tout', () => {
  it('ouvre une sortie même sur une promesse rejetée', async () => {
    // `enregistrerMise` rend `{ ok: false }` sur les refus du serveur, mais une
    // coupure franche fait rejeter la promesse. Sans filet, le bandeau reste
    // vert et figé : « Annuler » a disparu, « Réessayer » n'arrive jamais, et
    // le collecteur n'a plus aucune sortie.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockRejectedValue(new Error('Failed to fetch'));

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

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    vi.useRealTimers();

    // Le message ne promet rien : l'écriture a pu aboutir avant que la réponse
    // ne se perde.
    expect(await screen.findByText(/Vérifie la carte avant de réessayer/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
  });

  it('le dit plutôt que de laisser un bandeau vert sur rien', async () => {
    // Sans identifiant de collecteur, aucune insertion ne peut partir. Le
    // bandeau vert prétendrait qu'une mise est en vol.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId={null}
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    vi.useRealTimers();

    expect(enregistrerMise).not.toHaveBeenCalled();
    expect(await screen.findByText(/Session perdue/)).toBeTruthy();
  });
});

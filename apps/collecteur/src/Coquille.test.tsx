import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La barre du bas, et l'endroit où elle est accrochée.
 *
 * ## Deux pannes, deux jours de suite
 *
 * **Le 24.** La barre démarrait en flux à `y = hauteur du viewport`, son
 * rectangle identique à celui de son parent — un `<div className="lg:hidden">`
 * glissé autour d'elle. Un élément `sticky` est confiné à sa boîte englobante ;
 * quand cette boîte l'épouse au pixel, la course de collage est nulle et
 * `position: sticky` ne fait plus rien.
 *
 * **Le 25.** Le collage retrouvé ne suffisait toujours pas. `sticky bottom-0`
 * ne colle que tant que la boîte englobante déborde du champ de vision : sur un
 * accueil court, la barre se posait au milieu de l'écran, là où le contenu
 * s'arrête, et remontait avec le document au premier défilement. Une barre de
 * navigation mobile ne bouge jamais — c'est ce qui la rend atteignable au pouce
 * sans regarder.
 *
 * D'où `position: fixed`, qui ne dépend plus d'aucune boîte. Ce que ce test
 * garde a donc changé de nature : ce n'est plus la course du collage, c'est
 * **ce que `fixed` fait payer**. Un élément fixe sort du flux, donc le document
 * ne réserve plus sa place, donc la dernière ligne d'une liste passe dessous —
 * et cette dernière ligne porte le bouton « Encaisser » du dernier client de la
 * tournée. La marge compensatoire n'est pas un détail de style.
 *
 * jsdom ne calcule aucune mise en page. Mais les deux causes sont
 * structurelles, et celles-là il les voit.
 */

const getUser = vi.fn();
const maybeSingle = vi.fn();
const signOut = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: () => getUser(),
      signOut: () => signOut(),
    },
    from: () => ({ select: () => ({ maybeSingle: () => maybeSingle() }) }),
  },
}));

vi.mock('./cache', () => ({ viderCache: vi.fn() }));

// Les dix écrans sont remplacés par des témoins : ce test porte sur la
// coquille, pas sur ce qu'elle affiche.
const temoin = (nom: string) => ({ [nom]: () => <div>écran {nom}</div> });
vi.mock('./ecrans/Alertes', () => temoin('Alertes'));
vi.mock('./ecrans/Avis', () => temoin('Avis'));
vi.mock('./ecrans/Bilan', () => temoin('Bilan'));
vi.mock('./ecrans/Plus', () => temoin('Plus'));
vi.mock('./ecrans/Rapprochement', () => temoin('Rapprochement'));
vi.mock('./ecrans/Recus', () => temoin('Recus'));

// L'écran d'encaissement, bavard : il dit ce que la coquille lui donne. C'est
// exactement ce que le vrai fait — tout son corps est sous `{!carte ? … : …}`.
//
// **`Encaisser` est délibérément absent de la liste des témoins muets
// ci-dessus.** Il y figurait, et ce doublon a tenu la suite en échec :
// `vi.mock` garde la **première** inscription pour un chemin donné, si bien que
// le témoin muet écrasait celui-ci. Le symptôme est trompeur — deux tests
// échouent sur un texte introuvable, `carte k7 · jour 17`, comme si la coquille
// ne transmettait plus la carte, alors que c'est le témoin qui ne l'affiche
// pas. Rien dans la sortie de Vitest ne signale la simulation en double.
vi.mock('./ecrans/Encaisser', () => ({
  Encaisser: ({
    carte,
    onEncaisse,
    onNaviguer,
  }: {
    carte: { carteId: string; misesEncaissees: number } | null;
    onEncaisse: () => void;
    onNaviguer: (cle: string) => void;
  }) => (
    <>
      <div>écran Encaisser</div>
      {carte ? (
        <div>carte {carte.carteId} · jour {carte.misesEncaissees}</div>
      ) : (
        <div>Aucune carte choisie.</div>
      )}
      <button type="button" onClick={onEncaisse}>
        confirmer
      </button>
      <button type="button" onClick={() => onNaviguer('clients')}>
        revenir aux clients
      </button>
    </>
  ),
}));

// Trois témoins bavards : le chemin qui pose le filtre de retrait, celui qui
// devrait le lever, et l'écran qui en subit l'état. Les autres restent muets.
vi.mock('./ecrans/Accueil', () => ({
  Accueil: ({ onNaviguer }: { onNaviguer: (cle: string) => void }) => (
    <>
      <div>écran Accueil</div>
      <button type="button" onClick={() => onNaviguer('retrait')}>
        tuile Retrait
      </button>
    </>
  ),
}));

vi.mock('./ecrans/Clients', () => ({
  Clients: ({
    onRetrait,
    onEncaisser,
  }: {
    onRetrait: (c: { id: string; nom: string }) => void;
    onEncaisser: (carte: {
      carteId: string;
      clientNom: string;
      mise: number;
      misesEncaissees: number;
    }) => void;
  }) => (
    <>
      <div>écran Clients</div>
      <button type="button" onClick={() => onRetrait({ id: 'cli9', nom: 'Sy' })}>
        retirer pour Sy
      </button>
      <button
        type="button"
        onClick={() =>
          onEncaisser({ carteId: 'k7', clientNom: 'Sy', mise: 5000, misesEncaissees: 17 })
        }
      >
        encaisser k7
      </button>
    </>
  ),
}));

vi.mock('./ecrans/Retrait', () => ({
  Retrait: ({
    client,
    onRetour,
  }: {
    client: { id: string; nom: string } | null;
    onRetour: () => void;
  }) => (
    <>
      <div>écran Retrait</div>
      <div>filtre : {client ? client.id : 'aucun'}</div>
      <button type="button" onClick={onRetour}>
        retour accueil
      </button>
    </>
  ),
}));

const { Coquille } = await import('./Coquille');

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: 'collecteur-1' } } });
  maybeSingle.mockResolvedValue({ data: { nom: 'Awa' } });
  // `window.scrollTo` n'existe pas dans jsdom : sans ce témoin, chaque rendu
  // écrit une erreur « Not implemented » dans la sortie du test.
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  // `@testing-library/react` ne branche son nettoyage qu'avec les globales de
  // vitest, que ce dépôt n'active pas. Même raison que `Portillon.test.tsx`.
  cleanup();
  vi.unstubAllGlobals();
  getUser.mockReset();
  maybeSingle.mockReset();
  signOut.mockReset();
});

describe('ce que la coquille fait de la carte encaissée', () => {
  it('garde la carte sous les yeux après la mise, et compte le jour de plus', async () => {
    // Le défaut signalé le 2026-08-26 : « lorsqu'on encaisse, la carte se
    // ferme ». Elle ne se ferme pas — la coquille remettait `carteChoisie` à
    // `null` dans le même rendu que le message de réussite, et tout le corps de
    // l'écran d'encaissement vit sous `{!carte ? … : …}`. La confirmation, la
    // carte et le bouton disparaissaient à la seconde où la mise partait.
    //
    // Le geste est répété trente fois par jour, debout, devant une cliente.
    // L'écran doit dire « c'est fait », pas « va chercher un client ».
    render(<Coquille onDeconnexion={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'encaisser k7' }));
    // `findBy` et non `getBy` : sous quatre espaces de travail qui tournent
    // ensemble, le rendu qui suit le clic n'est pas toujours retombé quand
    // l'assertion s'exécute. Attendre n'affaiblit rien — ce qui doit paraître
    // paraît, ou le test échoue quand même — et un échec qui dépend de la
    // charge de la machine finit par être lu comme du bruit.
    expect(await screen.findByText('carte k7 · jour 17')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'confirmer' }));

    // La case fraîchement remplie se voit : c'est le moment signature du
    // produit, jusqu'ici démonté avant d'avoir pu se montrer.
    expect(await screen.findByText('carte k7 · jour 18')).toBeTruthy();
    expect(screen.queryByText('Aucune carte choisie.')).toBeNull();
  });

  it('oublie la carte en quittant l’écran, pour ne pas la rouvrir par l’onglet', async () => {
    // Le `null` qu'on retire du succès doit reparaître ailleurs : sans lui,
    // l'onglet « Encaisser » de la barre du bas rouvrirait la carte du client
    // précédent, et un appui de trop écrirait une seconde mise sur elle.
    render(<Coquille onDeconnexion={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'encaisser k7' }));
    fireEvent.click(screen.getByRole('button', { name: 'revenir aux clients' }));

    const barre = screen.getByRole('navigation', { name: 'Navigation principale' });
    fireEvent.click(within(barre).getByRole('button', { name: 'Encaisser' }));

    expect(await screen.findByText('Aucune carte choisie.')).toBeTruthy();
  });
});

describe('coquille du collecteur', () => {
  it('fixe la barre du bas au champ de vision, pas au document', () => {
    render(<Coquille onDeconnexion={vi.fn()} />);

    const barre = screen.getByRole('navigation', { name: 'Navigation principale' });

    expect(barre.className).toContain('fixed');
    expect(barre.className).toContain('bottom-0');
    // `sticky` a été essayé deux jours et n'a jamais tenu la promesse : sur un
    // écran court il n'a pas de course, et la barre repart avec le document.
    expect(barre.className).not.toContain('sticky');
    // Le masquage sur bureau vit sur le même nœud que le positionnement.
    // Séparer les deux, c'est réintroduire la boîte intermédiaire du 24.
    expect(barre.className).toContain('lg:hidden');
  });

  it('reproduit le plafond de la colonne, la barre n’héritant plus de rien', () => {
    render(<Coquille onDeconnexion={vi.fn()} />);

    const barre = screen.getByRole('navigation', { name: 'Navigation principale' });

    // Entre 640 et 1023 px, la colonne est plafonnée à 520 px et centrée. Une
    // barre fixe pleine fenêtre sous un contenu de 520 px se lit comme deux
    // mises en page superposées.
    expect(barre.className).toContain('max-w-mobile');
    expect(barre.className).toContain('left-1/2');
    expect(barre.className).toContain('-translate-x-1/2');
  });

  it('réserve dans la colonne la hauteur que la barre n’occupe plus', () => {
    render(<Coquille onDeconnexion={vi.fn()} />);

    const colonne = screen.getByText('écran Clients').parentElement;

    // Sans `pb-nav`, la dernière ligne d'une liste passe sous la barre. C'est
    // là que se trouve le bouton d'encaissement du dernier client de la
    // tournée : la seule commande qu'on ne peut pas se permettre de cacher.
    expect(colonne?.className).toContain('pb-nav');
    // Sur bureau la barre n'existe pas : la marge non plus, sinon l'écran
    // porte 84 px de vide en bas sans raison.
    expect(colonne?.className).toContain('lg:pb-0');
  });
});

describe('le filtre de l’écran de retrait', () => {
  it('emporte le client désigné quand on part d’une de ses cartes', () => {
    render(<Coquille onDeconnexion={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'retirer pour Sy' }));

    expect(screen.getByText('filtre : cli9')).toBeTruthy();
  });

  it('rend la liste entière à toute autre navigation', () => {
    render(<Coquille onDeconnexion={vi.fn()} />);

    // Le filtre appartient au geste qui l'a posé. La tuile « Retrait » de
    // l'accueil demande la liste complète : sans remise à zéro, elle rouvrait
    // l'écran encore réduit au client de la visite précédente — qui n'a
    // parfois plus aucune carte, donc un écran vide et sans explication.
    fireEvent.click(screen.getByRole('button', { name: 'retirer pour Sy' }));
    fireEvent.click(screen.getByRole('button', { name: 'retour accueil' }));
    fireEvent.click(screen.getByRole('button', { name: 'tuile Retrait' }));

    expect(screen.getByText('filtre : aucun')).toBeTruthy();
  });
});

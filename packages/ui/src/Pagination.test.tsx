import { formatMontant } from '@kolek/core';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

// Sans ça, les rendus s'empilent dans le même document et `getByRole` trouve
// plusieurs régions vives. Le symptôme accuse le composant ; la cause est le
// harnais.
afterEach(cleanup);

import { Pagination, TAILLE_PAGE, usePagination } from './Pagination';

/**
 * La pagination d'affichage.
 *
 * ## Ce qu'elle est, et ce qu'elle n'est pas
 *
 * Elle découpe une liste **déjà chargée**. Elle ne va rien chercher au serveur.
 *
 * C'est le choix retenu le 2026-09-09, et il découle du produit : le collecteur
 * travaille hors ligne, et sa recherche filtre le tableau qu'il a en main. Une
 * pagination qui demanderait une page au serveur irait chercher ce qu'il n'a
 * pas — c'est-à-dire rien, dans un marché sans réseau. Les lignes sont donc
 * toutes chargées (voir `apps/collecteur/src/pagination.ts`), et seule leur
 * **restitution** est découpée.
 *
 * Ce que ça gagne : mille deux cents clients ne font plus mille deux cents
 * lignes dans le DOM sur un téléphone d'entrée de gamme.
 *
 * ## Le piège qui a dicté le dessin
 *
 * On est page 5, on tape une recherche, il ne reste que trois résultats. Si la
 * page courante était simplement gardée, l'écran deviendrait **vide** — et le
 * collecteur en conclurait qu'il n'a rien trouvé, alors que les trois résultats
 * sont là, une page plus loin en arrière.
 *
 * La page n'est donc jamais stockée hors bornes : elle est ramenée dans la
 * plage à chaque rendu, à partir du nombre d'éléments reçus.
 */
describe('usePagination', () => {
  const liste = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('rend tout quand il y a moins d’une page', () => {
    const { result } = renderHook(() => usePagination(liste(10)));

    expect(result.current.visibles).toHaveLength(10);
    expect(result.current.pages).toBe(1);
    expect(result.current.page).toBe(1);
  });

  it('découpe en pages de la taille demandée', () => {
    const { result } = renderHook(() => usePagination(liste(120)));

    expect(result.current.pages).toBe(Math.ceil(120 / TAILLE_PAGE));
    expect(result.current.visibles).toHaveLength(TAILLE_PAGE);
    expect(result.current.visibles[0]).toBe(0);
  });

  it('avance et recule', () => {
    const { result } = renderHook(() => usePagination(liste(120)));

    act(() => result.current.allerA(2));
    expect(result.current.visibles[0]).toBe(TAILLE_PAGE);

    act(() => result.current.allerA(1));
    expect(result.current.visibles[0]).toBe(0);
  });

  it('rend une dernière page incomplète', () => {
    const { result } = renderHook(() => usePagination(liste(TAILLE_PAGE + 3)));

    act(() => result.current.allerA(2));
    expect(result.current.visibles).toHaveLength(3);
  });

  it('ramène la page dans les bornes quand la liste rétrécit', () => {
    // Le cas qui compte : page 3, puis une recherche ne laisse que deux
    // résultats. Garder la page 3 afficherait un écran vide, et le collecteur
    // conclurait qu'il n'a rien trouvé.
    const { result, rerender } = renderHook(({ n }) => usePagination(liste(n)), {
      initialProps: { n: 300 },
    });

    act(() => result.current.allerA(3));
    expect(result.current.page).toBe(3);

    rerender({ n: 2 });

    expect(result.current.page).toBe(1);
    expect(result.current.visibles).toHaveLength(2);
  });

  it('refuse une page hors plage plutôt que de rendre du vide', () => {
    const { result } = renderHook(() => usePagination(liste(120)));

    act(() => result.current.allerA(99));
    expect(result.current.page).toBe(result.current.pages);

    act(() => result.current.allerA(0));
    expect(result.current.page).toBe(1);
  });

  it('compte une page même sur une liste vide', () => {
    // `pages = 0` ferait afficher « page 1 sur 0 », et une division par zéro
    // guette dans tout calcul qui suivrait.
    const { result } = renderHook(() => usePagination([]));

    expect(result.current.pages).toBe(1);
    expect(result.current.visibles).toEqual([]);
  });
});

describe('Pagination', () => {
  it('ne s’affiche pas quand tout tient sur une page', () => {
    // Deux flèches inertes sous une liste de six lignes sont du bruit.
    const { container } = render(
      <Pagination page={1} pages={1} total={6} onAller={() => {}} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('dit où on en est, en toutes lettres', () => {
    render(<Pagination page={2} pages={5} total={240} onAller={() => {}} />);

    expect(screen.getByText(/Page 2 sur 5/)).toBeDefined();
    expect(screen.getByText(/240/)).toBeDefined();
  });

  /**
   * Les nombres suivent `formatMontant`, comme partout ailleurs dans le produit.
   *
   * Relevé par l'auto-audit du 2026-09-09 : sur l'écran Clients, le bandeau de
   * recoupement écrit « 1 240 clients enregistrés » — il passe par
   * `formatMontant`, y compris pour un simple compte de personnes — et la
   * pagination écrivait « 1240 au total » juste en dessous. Deux écritures du
   * même nombre sur le même écran.
   *
   * `textContent` et non `getByText` : le séparateur de milliers est une espace
   * **insécable** (U+00A0), et le normalisateur de Testing Library l'écrase en
   * espace ordinaire avant la comparaison. L'assertion passerait alors même si
   * le composant écrivait une espace ordinaire — c'est-à-dire sur le défaut
   * qu'elle doit voir.
   */
  it('groupe les milliers, comme le reste du produit', () => {
    render(<Pagination page={1} pages={25} total={1240} onAller={() => {}} />);

    expect(screen.getByRole('status').textContent).toContain(formatMontant(1240));
  });

  it('groupe aussi le numéro de page, qui se compte dans la même phrase', () => {
    // « Page 1240 sur 1 240 » se lirait comme deux nombres différents.
    render(<Pagination page={1240} pages={1240} total={62_000} onAller={() => {}} />);

    const dit = screen.getByRole('status').textContent ?? '';
    expect(dit).toContain(`Page ${formatMontant(1240)} sur ${formatMontant(1240)}`);
    expect(dit).toContain(formatMontant(62_000));
  });

  it('annonce le changement de page au lecteur d’écran', () => {
    // Sans région vive, un utilisateur au lecteur d'écran clique « Suivante »
    // et n'entend rien : le tableau a changé hors de son champ.
    render(<Pagination page={2} pages={5} total={240} onAller={() => {}} />);

    expect(screen.getByRole('status')).toBeDefined();
  });

  it('appelle onAller avec la page voulue', () => {
    const vues: number[] = [];
    render(<Pagination page={2} pages={5} total={240} onAller={(p) => vues.push(p)} />);

    fireEvent.click(screen.getByRole('button', { name: /suivante/i }));
    fireEvent.click(screen.getByRole('button', { name: /précédente/i }));

    expect(vues).toEqual([3, 1]);
  });

  /**
   * ## Pourquoi `aria-disabled` et non `disabled`
   *
   * Le composant a porté un vrai `disabled` du 2026-09-09 au soir. L'auto-audit
   * du même jour a relevé ce que ça coûte : **dans un vrai navigateur, un
   * élément qui reçoit `disabled` alors qu'il a le focus perd le focus**, et
   * celui-ci retombe sur `<body>`.
   *
   * Le geste est banal — on tabule jusqu'à « Suivante », on appuie sur Entrée
   * plusieurs fois de suite pour descendre la liste. Au dernier appui, le bouton
   * s'éteint sous le doigt : l'utilisateur au clavier se retrouve au début du
   * document, et celui au lecteur d'écran perd sa place dans le tableau qu'il
   * était en train de parcourir.
   *
   * `aria-disabled` dit l'indisponibilité au lecteur d'écran sans retirer
   * l'élément de l'ordre de tabulation. Le focus ne bouge donc jamais. En
   * contrepartie, le navigateur ne bloque plus le clic : c'est au gestionnaire
   * de refuser, et le test suivant l'exige.
   *
   * ## Ce que cette suite ne peut pas garder
   *
   * `jsdom` ne modélise pas la perte de focus sur `disabled` — une sonde écrite
   * pour l'audit montre le focus qui reste sur le bouton désactivé. Aucun test
   * de ce dépôt ne peut donc voir le défaut d'origine, ni empêcher qu'on y
   * revienne en remettant `disabled`. Ces deux tests-ci gardent le **moyen**
   * choisi, faute de pouvoir garder la fin.
   */
  it('signale la flèche qui ne mène nulle part sans la retirer du clavier', () => {
    render(<Pagination page={1} pages={5} total={240} onAller={() => {}} />);

    const precedente = screen.getByRole('button', { name: /précédente/i });
    // `getAttribute` et non `toHaveAttribute` : ce dépôt ne charge pas les
    // matchers de jest-dom, et l'assertion serait `undefined` à l'exécution.
    expect(precedente.getAttribute('aria-disabled')).toBe('true');
    // Et surtout : pas de vrai `disabled`, sinon le focus s'en va.
    expect(precedente).toHaveProperty('disabled', false);

    const suivante = screen.getByRole('button', { name: /suivante/i });
    expect(suivante.getAttribute('aria-disabled')).toBe('false');
  });

  it('refuse le geste depuis une flèche en bout de course', () => {
    // Le navigateur ne bloque plus le clic, puisque le bouton n'est plus
    // `disabled`. Sans ce refus, cliquer « Précédente » à la page 1 demanderait
    // la page 0 — que le crochet ramènerait à 1, donc rien de visible, mais la
    // région vive annoncerait un changement qui n'a pas eu lieu.
    const vues: number[] = [];
    render(<Pagination page={1} pages={5} total={240} onAller={(p) => vues.push(p)} />);

    fireEvent.click(screen.getByRole('button', { name: /précédente/i }));

    expect(vues).toEqual([]);
  });

  it('garde le focus sur la flèche qui vient de s’éteindre', () => {
    // Ce que `jsdom` sait montrer de la correction : le bouton reste dans
    // l'ordre de tabulation. Ce qu'il ne sait pas montrer — la perte de focus
    // qu'un vrai navigateur inflige à un `disabled` — est dit plus haut.
    const { rerender } = render(
      <Pagination page={4} pages={5} total={240} onAller={() => {}} />,
    );

    const suivante = screen.getByRole('button', { name: /suivante/i });
    suivante.focus();

    rerender(<Pagination page={5} pages={5} total={240} onAller={() => {}} />);

    expect(document.activeElement).toBe(suivante);
    expect(suivante.getAttribute('aria-disabled')).toBe('true');
  });

  it('donne aux flèches une cible de 44 px', () => {
    // Règle du dépôt : toute cible tactile fait au moins 44 px. Ces deux-là
    // sont côte à côte, et une flèche ratée fait sauter une page.
    render(<Pagination page={2} pages={5} total={240} onAller={() => {}} />);

    for (const nom of [/précédente/i, /suivante/i]) {
      const classe = screen.getByRole('button', { name: nom }).className;
      expect(classe).toMatch(/min-w-11/);
      expect(classe).toMatch(/min-h-11/);
    }
  });
});

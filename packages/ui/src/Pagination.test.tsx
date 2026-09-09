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

  it('éteint la flèche qui ne mène nulle part', () => {
    render(<Pagination page={1} pages={5} total={240} onAller={() => {}} />);

    expect(screen.getByRole('button', { name: /précédente/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /suivante/i })).toHaveProperty('disabled', false);
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

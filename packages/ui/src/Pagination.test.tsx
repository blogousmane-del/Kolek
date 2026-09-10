import { formatMontant } from '@kolek/core';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

// Sans ça, les rendus s'empilent dans le même document et `getByRole` trouve
// plusieurs régions vives. Le symptôme accuse le composant ; la cause est le
// harnais.
afterEach(cleanup);

import { fenetrePages, Pagination, TAILLE_PAGE, usePagination } from './Pagination';

/**
 * Ce que `usePagination` ne peut pas garder par un test, et qu'il faut donc
 * écrire.
 *
 * `allerA` rendait `setDemandee` tel quel, c'est-à-dire un
 * `Dispatch<SetStateAction<number>>`. Le type acceptait donc `allerA(p => p + 1)`
 * — et cet appel-là lirait `demandee`, **la page stockée non bornée**, et non
 * `page`, celle qui est affichée. Après un rétrécissement de liste les deux
 * diffèrent : c'est tout le sujet du crochet.
 *
 * La correction est une enveloppe qui n'accepte qu'un nombre. Elle est **de
 * typage seul** : à l'exécution, React traite n'importe quelle fonction reçue
 * par un `setState` comme une mise à jour fonctionnelle, enveloppe ou pas.
 * Aucun test ne peut donc démontrer la fermeture — seul le compilateur la voit.
 * Le test ci-dessous garde ce que l'enveloppe risquait de casser, faute de
 * pouvoir garder ce qu'elle apporte.
 */

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

  /**
   * Le compte total vient du crochet, et non de l'appelant.
   *
   * Relevé par l'auto-audit du 2026-09-09 : le composant réclamait un `total`
   * que le crochet connaissait déjà. Les six branchements étaient justes — ils
   * ont été vérifiés un par un — mais rien ne l'imposait. Paginer `listeFiltree`
   * et annoncer `collecteurs.length` compilait, passait les tests, et affichait
   * un compte qui ment.
   *
   * Le rendre ici ferme la question : l'appelant n'a plus de deuxième nombre à
   * fournir, donc plus de deuxième nombre à se tromper.
   */
  it('rend lui-même le compte total', () => {
    const { result } = renderHook(() => usePagination(liste(120)));

    expect(result.current.total).toBe(120);
  });

  it('compte tout ce qu’on lui donne, et non ce qu’il affiche', () => {
    const { result } = renderHook(() => usePagination(liste(120)));

    act(() => result.current.allerA(2));

    expect(result.current.visibles).toHaveLength(TAILLE_PAGE);
    expect(result.current.total).toBe(120);
  });

  /**
   * `allerA` garde son identité d'un rendu à l'autre.
   *
   * Ce test passe déjà avant le changement qu'il accompagne, et c'est voulu :
   * il ne cherche pas un défaut, il garde une propriété que la correction du
   * point D pourrait coûter. `allerA` était `setDemandee` tel quel — donc
   * stable, comme tout `setState`. L'envelopper pour fermer son type le rendrait
   * neuf à chaque rendu si l'enveloppe n'était pas mémoïsée, et cette identité
   * voyage jusqu'à la propriété `onAller` du composant.
   */
  it('garde la même fonction d’aller-à d’un rendu à l’autre', () => {
    const { result, rerender } = renderHook(({ n }) => usePagination(liste(n)), {
      initialProps: { n: 120 },
    });

    const avant = result.current.allerA;
    rerender({ n: 200 });

    expect(result.current.allerA).toBe(avant);
  });

  /**
   * Une taille de page absurde ne fait pas tomber l'écran.
   *
   * Trouvé en relisant la correction du point B, et c'est **elle** qui a créé le
   * danger. `taille` est un paramètre public du crochet ; à zéro,
   * `Math.ceil(n / 0)` vaut `Infinity`. Avant que les nombres passent par
   * `formatMontant`, ça donnait « Page 1 sur Infinity » — laid, mais l'écran
   * vivait. Depuis, `formatMontant` lève sur un nombre non fini :
   *
   *     Montant non fini : Infinity
   *
   * Mesuré par une sonde avant d'écrire ce test, et non déduit. Le résultat
   * n'est pas une pagination fautive, c'est l'écran entier qui tombe — sur le
   * téléphone d'un collecteur, au marché, c'est la pire des pannes.
   *
   * Aucun des six appelants ne passe `taille` aujourd'hui. Le paramètre est
   * exporté quand même, et un défaut qui attend le premier qui s'en servira est
   * un défaut.
   *
   * Le repli est `TAILLE_PAGE` plutôt que 1 : ramener à 1 donnerait cent vingt
   * pages d'une ligne, ce qui est vivant mais inutilisable. La valeur par défaut
   * rend un écran dont on peut se servir pendant qu'on cherche l'erreur.
   */
  it('se défend d’une taille de page inutilisable', () => {
    for (const absurde of [0, -10, Number.NaN]) {
      const { result } = renderHook(() => usePagination(liste(120), absurde));

      expect(Number.isFinite(result.current.pages)).toBe(true);
      expect(result.current.visibles).toHaveLength(TAILLE_PAGE);
      cleanup();
    }
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

/**
 * Ce que les six écrans appelants tiennent pour acquis.
 *
 * Épreuves de **caractérisation**, écrites le 2026-09-10 avant d’ajouter les
 * numéros et le sélecteur. Elles ne décrivent aucune intention nouvelle : elles
 * figent ce que `Clients`, `EncoursSoldes`, `Collecteurs`, `Abonnements`,
 * `Demandes` et `SuperAdmin` reçoivent aujourd’hui.
 *
 * Elles passent donc du premier coup, et c’est leur seul rôle acceptable — une
 * caractérisation qui échoue à l’écriture veut dire que le plan qui la commande
 * se trompe sur l’existant.
 */
describe('ce que les six écrans appelants tiennent pour acquis', () => {
  it('ne rend rien quand tout tient sur une page', () => {
    const { container } = render(<Pagination page={1} pages={1} total={12} onAller={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('garde les deux flèches et leurs libellés', () => {
    render(<Pagination page={2} pages={5} total={220} onAller={() => {}} />);
    expect(screen.getByLabelText('Page précédente')).toBeTruthy();
    expect(screen.getByLabelText('Page suivante')).toBeTruthy();
  });

  it('garde la région vive qui annonce le changement', () => {
    render(<Pagination page={2} pages={5} total={220} onAller={() => {}} />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    // `textContent` et non `getByText` : le séparateur est un U+00A0, que le
    // normaliseur de Testing Library écrase en espace ordinaire.
    expect(region.textContent).toContain(formatMontant(220));
  });

  it('mène à la page voisine par ses flèches', () => {
    const vues: number[] = [];
    render(<Pagination page={3} pages={5} total={220} onAller={(n) => vues.push(n)} />);
    fireEvent.click(screen.getByLabelText('Page précédente'));
    fireEvent.click(screen.getByLabelText('Page suivante'));
    expect(vues).toEqual([2, 4]);
  });
});

/**
 * La fenêtre de numéros — la fonction pure où vivent les erreurs de bornes.
 *
 * Elle est éprouvée seule, et non à travers le rendu, parce qu’un décalage d’un
 * rang se lit ici en une ligne et se cherche une heure dans un DOM.
 */
describe('fenetrePages', () => {
  it('rend tous les numéros quand ils tiennent', () => {
    expect(fenetrePages(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('coupe à droite quand on est au début', () => {
    expect(fenetrePages(1, 20)).toEqual([1, 2, 3, '…', 20]);
  });

  it('coupe à gauche quand on est à la fin', () => {
    expect(fenetrePages(20, 20)).toEqual([1, '…', 18, 19, 20]);
  });

  it('coupe des deux côtés au milieu', () => {
    expect(fenetrePages(10, 20)).toEqual([1, '…', 8, 9, 10, 11, 12, '…', 20]);
  });

  it('comble un trou d’une seule page plutôt que de le couper', () => {
    // `1 … 3` est plus long que `1 2 3` et cache une page atteignable.
    expect(fenetrePages(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('ne rend jamais deux coupures adjacentes', () => {
    for (let p = 1; p <= 12; p += 1) {
      const f = fenetrePages(p, 12);
      for (let i = 1; i < f.length; i += 1) {
        expect(f[i] === '…' && f[i - 1] === '…').toBe(false);
      }
    }
  });

  it('garde toujours le premier et le dernier', () => {
    for (let p = 1; p <= 40; p += 1) {
      const f = fenetrePages(p, 40);
      expect(f[0]).toBe(1);
      expect(f[f.length - 1]).toBe(40);
    }
  });

  it('n’invente jamais de page hors bornes', () => {
    for (let p = 1; p <= 40; p += 1) {
      for (const n of fenetrePages(p, 40)) {
        if (n !== '…') expect(n >= 1 && n <= 40).toBe(true);
      }
    }
  });

  it('rend une seule page quand il n’y en a qu’une', () => {
    // Le composant rend `null` dans ce cas, mais la fonction est publique et
    // ne doit pas rendre `[1, 1]` si quelqu’un l’appelle directement.
    expect(fenetrePages(1, 1)).toEqual([1]);
  });
});

/**
 * La bande numérotée.
 *
 * ## Pourquoi elle se cible par son libellé, jamais par un rôle nu
 *
 * `jsdom` n’applique pas les requêtes média. La bande porte `hidden sm:flex`,
 * et le sélecteur de la tâche suivante portera `sm:hidden` : dans ces épreuves
 * les deux sont montés **en même temps**, quelle que soit la largeur simulée.
 * Un `getByRole('button')` nu attraperait donc les deux présentations, et un
 * test vert ne dirait rien de ce que le collecteur voit.
 *
 * D’où le `<nav aria-label="Pages">` : il n’est pas là pour la sémantique
 * seule, il est là pour qu’une épreuve puisse désigner une présentation.
 */
describe('la bande numérotée', () => {
  const bande = () => screen.getByRole('navigation', { name: 'Pages' });

  it('rend un bouton par numéro de la fenêtre', () => {
    render(<Pagination page={1} pages={3} total={140} onAller={() => {}} />);

    expect(within(bande()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('marque la page courante pour le lecteur d’écran', () => {
    render(<Pagination page={2} pages={3} total={140} onAller={() => {}} />);

    expect(within(bande()).getByRole('button', { current: 'page' }).textContent).toBe('2');
  });

  it('mène à la page demandée', () => {
    const vues: number[] = [];
    render(<Pagination page={1} pages={3} total={140} onAller={(n) => vues.push(n)} />);

    fireEvent.click(within(bande()).getByRole('button', { name: 'Page 3' }));

    expect(vues).toEqual([3]);
  });

  it('refuse le geste sur la page où l’on est déjà', () => {
    // Sans ce refus, retaper sur le numéro courant redemanderait la même page :
    // rien ne bougerait à l'écran, mais la région vive annoncerait un
    // changement qui n'a pas eu lieu. Même raisonnement que les flèches en bout
    // de course.
    const vues: number[] = [];
    render(<Pagination page={2} pages={3} total={140} onAller={(n) => vues.push(n)} />);

    fireEvent.click(within(bande()).getByRole('button', { current: 'page' }));

    expect(vues).toEqual([]);
  });

  it('rend la coupure sans en faire une cible', () => {
    // Un bouton inerte apprend au lecteur d'écran à se méfier des autres.
    render(<Pagination page={1} pages={40} total={2000} onAller={() => {}} />);

    expect(bande().textContent).toContain('…');
    for (const b of within(bande()).getAllByRole('button')) {
      expect(b.textContent).not.toBe('…');
    }
  });

  it('groupe les milliers du numéro, comme le reste du produit', () => {
    // `formatMontant` et non un littéral : le séparateur est une espace
    // insécable (U+00A0), qu'un littéral écrit à la main rate une fois sur deux.
    render(<Pagination page={1200} pages={1200} total={60_000} onAller={() => {}} />);

    expect(within(bande()).getByRole('button', { current: 'page' }).textContent).toBe(
      formatMontant(1200),
    );
  });

  it('donne à chaque numéro une cible de 44 px', () => {
    // Règle du dépôt : toute cible tactile fait au moins 44 px. Les numéros
    // sont côte à côte, et un numéro raté fait sauter une page.
    render(<Pagination page={2} pages={5} total={240} onAller={() => {}} />);

    for (const b of within(bande()).getAllByRole('button')) {
      expect(b.className).toMatch(/min-w-11/);
      expect(b.className).toMatch(/min-h-11/);
    }
  });
});

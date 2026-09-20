import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// GSAP enregistre ScrollTrigger au chargement du module, et ScrollTrigger
// appelle `matchMedia`, que jsdom ne fournit pas.
//
// Les autres épreuves du site remplacent `./animation` par un doublon. Pas
// ici : ce fichier éprouve précisément que **l'arbre entier** se rend, ce qui
// est la condition du prérendu. Un doublon d'animation retirerait du rendu la
// moitié de ce qu'on veut voir aboutir. On pose donc le seul creux de jsdom,
// dans un `vi.hoisted` — il s'exécute avant les imports, donc avant que GSAP
// n'appelle `matchMedia`, ce qu'un `beforeAll` ferait trop tard.
vi.hoisted(() => {
  window.matchMedia = ((requete: string) => ({
    matches: false,
    media: requete,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

import App from './App';
import { ROUTES } from './vitrine/routes';

// `globals` n'est pas activé : sans cet appel, chaque rendu s'ajoute au
// précédent et les requêtes trouvent deux pages.
afterEach(cleanup);

beforeAll(() => {
  // jsdom n'implémente pas `IntersectionObserver`, et la barre de navigation en
  // construit un dès que le hero est présent — c'est-à-dire dès qu'on rend la
  // vitrine entière, ce que `Navbar.test.tsx` ne fait jamais. Le doublon ne
  // simule rien : il existe pour que le rendu aille au bout.
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
});

/**
 * Le routage doit pouvoir s'exécuter **sans navigateur**.
 *
 * `App` lisait `window.location.pathname` pendant son rendu. C'est ce qui
 * rendait le prérendu impossible : un rendu en chaîne, dans Node, n'a pas de
 * `window`, et les cinq routes se seraient rendues identiques.
 *
 * Le chemin devient donc une propriété. Le repli sur `window` reste, parce que
 * c'est lui que le navigateur emprunte — la propriété n'est passée que par
 * `scripts/prerendre.mjs`.
 */
describe('le routage du site public', () => {
  it('rend les conditions quand le chemin lui est donné', () => {
    render(<App chemin="/conditions" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Conditions générales' })).toBeTruthy();
  });

  it('rend les mentions légales quand le chemin lui est donné', () => {
    render(<App chemin="/mentions-legales" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Mentions légales' })).toBeTruthy();
  });

  it('rend la politique de confidentialité quand le chemin lui est donné', () => {
    render(<App chemin="/confidentialite" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Politique de confidentialité' }),
    ).toBeTruthy();
  });

  it('rend la vitrine pour la racine', () => {
    render(<App chemin="/" />);

    // Le titre du hero est le seul `h1` de la vitrine. Il est coupé en deux
    // `span`, donc on interroge le rôle plutôt que le texte exact.
    const titres = screen.getAllByRole('heading', { level: 1 });
    expect(titres).toHaveLength(1);
    expect(titres[0].textContent).toContain('précision');
  });

  it('rend la vitrine pour un chemin inconnu, comme avant', () => {
    render(<App chemin="/rien-de-connu" />);

    expect(screen.getAllByRole('heading', { level: 1 })[0].textContent).toContain('précision');
  });

  it('ignore la barre oblique finale', () => {
    render(<App chemin="/conditions/" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Conditions générales' })).toBeTruthy();
  });

  it('sert une page propre à chaque route de la table, sans repli muet', () => {
    // Le lien entre `routes.ts` et ce module. Une route ajoutée à la table et
    // oubliée dans `PAGES` rendrait la vitrine sous le titre et la canonique
    // d'une autre page — un doublon exact, qui est le défaut que tout ce
    // chantier corrige, et qu'aucune garde du prérendu n'attraperait.
    const titreDuHero = 'précision';

    for (const route of ROUTES) {
      if (route.chemin === '/') continue;

      cleanup();
      render(<App chemin={route.chemin} />);

      const titres = screen.getAllByRole('heading', { level: 1 });
      expect(titres[0].textContent, `${route.chemin} retombe sur la vitrine`).not.toContain(
        titreDuHero,
      );
    }
  });

  it('se rabat sur l’adresse du navigateur quand aucun chemin n’est donné', () => {
    window.history.pushState({}, '', '/confidentialite');

    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Politique de confidentialité' }),
    ).toBeTruthy();

    window.history.pushState({}, '', '/');
  });
});

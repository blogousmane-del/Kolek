import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Le mouvement est **accepté**. C'est le seul réglage sous lequel les entrées
// jouent, donc le seul sous lequel un texte peut s'effacer : en mouvement
// réduit, `useAnimations` ne construit rien et il n'y aurait rien à éprouver.
//
// Posé dans un `vi.hoisted` pour la raison écrite dans `App.test.tsx` : GSAP
// appelle `matchMedia` au chargement du module, avant tout `beforeAll`.
vi.hoisted(() => {
  window.matchMedia = ((requete: string) => ({
    matches: requete.includes('no-preference'),
    media: requete,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

import { Acces } from './Acces';
import { useAnimations } from './animation';
import { Hero } from './Hero';
import { Philosophie } from './Philosophie';
import { Tarification } from './Tarification';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Le `#root` que sert la page : marqué par `scripts/prerendre.mjs`, ou nu. */
function racine(prerendue: boolean): HTMLElement {
  const div = document.createElement('div');
  div.id = 'root';
  if (prerendue) div.setAttribute('data-prerendu', '');
  return document.body.appendChild(div);
}

/**
 * Toute boîte posée au bas exact de l'écran : sa première ligne n'y est pas
 * encore visible. jsdom ne calcule aucune mise en page et met toute boîte en
 * (0, 0), c'est-à-dire à l'écran ; c'est le cas par défaut des épreuves.
 */
function sousLaLigneDeFlottaison() {
  const haut = window.innerHeight;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: haut,
    bottom: haut + 400,
    left: 0,
    right: 400,
    width: 400,
    height: 400,
    x: 0,
    y: haut,
    toJSON: () => ({}),
  } as DOMRect);
}

/** Ce que laisse GSAP sur un élément qu'une entrée `from` vient de cacher. */
const efface = (e: HTMLElement | SVGElement) => e.style.opacity === '0';

/** Un nom lisible dans un message d'échec, plutôt qu'un nœud DOM entier. */
const nom = (e: Element) => `${e.tagName.toLowerCase()} "${(e.textContent ?? '').trim().slice(0, 40)}"`;

/**
 * Le contrat du socle : `construire` apprend si son conteneur était déjà à
 * l'écran quand le JavaScript est arrivé.
 */
describe('useAnimations dit ce qui était peint avant le JavaScript', () => {
  function Sonde({ noter }: { noter: (dejaPeint: boolean) => void }) {
    const ref = useAnimations<HTMLDivElement>((_, { dejaPeint }) => noter(dejaPeint));
    return <div ref={ref} />;
  }

  it('déjà peint : page prérendue, conteneur à l’écran', () => {
    const noter = vi.fn();
    render(<Sonde noter={noter} />, { container: racine(true) });

    expect(noter).toHaveBeenCalledWith(true);
  });

  it('pas encore peint : conteneur sous la ligne de flottaison, même prérendu', () => {
    sousLaLigneDeFlottaison();
    const noter = vi.fn();
    render(<Sonde noter={noter} />, { container: racine(true) });

    expect(noter).toHaveBeenCalledWith(false);
  });

  it('jamais peint sans prérendu : l’écran d’attente occupait la page', () => {
    const noter = vi.fn();
    render(<Sonde noter={noter} />, { container: racine(false) });

    expect(noter).toHaveBeenCalledWith(false);
  });
});

/**
 * Le défaut, mesuré le 2026-10-02 sur l'aperçu de la PR #19, dans Chrome, sur
 * un réseau 4G médiocre : le titre prérendu peint à 4,7 s, React reprend la
 * page à 5,8 s, et le titre retombe à 10 % d'opacité avant de remonter en
 * 0,7 s. Le visiteur qui avait commencé à lire voyait la phrase disparaître.
 *
 * Les entrées du hero partent toutes d'une opacité nulle. Elles ont été
 * écrites quand le hero n'existait qu'une fois le JavaScript arrivé : partir
 * de rien était alors partir de ce que le visiteur voyait. Le prérendu a
 * changé ce point de départ.
 */
describe('le hero d’une page prérendue', () => {
  it('laisse à l’écran le titre, la phrase, les boutons et le 31 déjà peints', () => {
    // Le filigrane n'est pas dans la liste : `Rosace` ne transmet pas l'attribut
    // `data-filigrane` à son `<svg>`, et aucun sélecteur ne l'atteint. Le
    // compter ici ferait croire à une protection qui ne porte sur rien.
    const { container } = render(<Hero />, { container: racine(true) });
    const peints = [...container.querySelectorAll<HTMLElement>('[data-entree], [data-faciale]')];

    expect(peints.length).toBeGreaterThan(0);
    expect(peints.filter(efface).map(nom)).toEqual([]);
  });

  it('joue encore son entrée quand rien n’était peint avant le JavaScript', () => {
    // Le témoin de la sonde. Sans lui, un `style.opacity` que GSAP ne poserait
    // jamais sous jsdom ferait passer l'épreuve précédente sans rien prouver.
    //
    // GSAP écrit ici « target [data-filigrane] not found » : c'est la même
    // cause, l'ouverture du filigrane n'a jamais joué. Défaut antérieur au
    // prérendu, sans effet sur ce qui est éprouvé ici.
    const { container } = render(<Hero />, { container: racine(false) });
    const titre = container.querySelector<HTMLElement>('h1 [data-entree]');

    expect(titre).not.toBeNull();
    expect(efface(titre!)).toBe(true);
  });
});

/**
 * Les sections révélées au défilement suivent la même règle.
 *
 * Une section n'est à l'écran à l'arrivée que si le visiteur vient d'un lien à
 * ancre, `kolek.cash/#tarifs` collé dans WhatsApp par exemple, ou s'il a
 * défilé avant que le JavaScript n'arrive. Il l'a alors déjà sous les yeux, et
 * l'effacer pour la révéler serait le clignement du hero.
 */
describe.each([
  ['Accès', Acces, '[data-porte]'],
  ['Philosophie', Philosophie, '[data-mot]'],
  ['Tarification', Tarification, '[data-palier]'],
] as const)('la section %s, sur une page prérendue', (_, Section, cibles) => {
  it('ne s’efface pas quand elle était déjà à l’écran', () => {
    const { container } = render(<Section />, { container: racine(true) });
    const elements = [...container.querySelectorAll<HTMLElement>(cibles)];

    expect(elements.length).toBeGreaterThan(0);
    expect(elements.filter(efface).map(nom)).toEqual([]);
  });

  it('garde son entrée quand le visiteur ne l’a pas encore vue', () => {
    // Le témoin, ici aussi : il prouve que la sonde voit une entrée au
    // défilement sous jsdom, et que la règle n'a pas éteint toutes les
    // entrées de la page.
    sousLaLigneDeFlottaison();
    const { container } = render(<Section />, { container: racine(true) });
    const elements = [...container.querySelectorAll<HTMLElement>(cibles)];

    expect(elements.length).toBeGreaterThan(0);
    expect(elements.every(efface)).toBe(true);
  });
});

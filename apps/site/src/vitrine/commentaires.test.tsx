import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Acces } from './Acces';
import { Fonctionnalites } from './Fonctionnalites';
import { Hero } from './Hero';
import { Inscription } from './Inscription';
import { Navbar } from './Navbar';
import { Philosophie } from './Philosophie';
import { PiedDePage } from './PiedDePage';
import { Protocole } from './Protocole';
import { Tarification } from './Tarification';

// GSAP enregistre ScrollTrigger au chargement du module et appelle `matchMedia`,
// que jsdom ne fournit pas. On ne teste pas l'animation ici.
vi.mock('./animation', () => ({
  gsap: { timeline: () => ({ from: () => ({}) }), to: () => ({}), fromTo: () => ({}) },
  entree: vi.fn(),
  useAnimations: () => ({ current: null }),
  useMouvementAccepte: () => false,
}));

afterEach(cleanup);

// Des fabriques et non des éléments : un tableau d'éléments JSX déclenche la
// règle `jsx-key` d'oxlint, qui a raison dans le cas général — ce tableau n'est
// simplement pas rendu comme une liste.
const SECTIONS: [string, () => ReactElement][] = [
  ['la barre de navigation', () => <Navbar />],
  ['le hero', () => <Hero />],
  ['les fonctionnalités', () => <Fonctionnalites />],
  ['le manifeste', () => <Philosophie />],
  ['le protocole', () => <Protocole />],
  ['la tarification', () => <Tarification />],
  ['les accès', () => <Acces />],
  ['le pied de page', () => <PiedDePage />],
  ['le formulaire d’ouverture', () => <Inscription />],
];

/**
 * Les trois textes juridiques, découverts plutôt qu'énumérés.
 *
 * La relecture finale de branche du 2026-09-18 a trouvé le défaut exact que
 * `SECTIONS` ci-dessus était censé prévenir : huit composants à la main, et
 * les trois pages légales — le plus long corps de JSX du site — n'y
 * figuraient pas. Une liste tenue à la main est la cause du défaut ; ce glob
 * la remplace pour ce dossier, pour qu'une quatrième page légale s'y ajoute
 * d'elle-même le jour où elle existe.
 *
 * `PageLegale.tsx` est exclu à la main : ce n'est pas une page, c'est
 * l'enveloppe commune des trois — `titre` et `miseAJour` y sont obligatoires,
 * et elle ne se rend jamais seule.
 */
const MODULES_LEGAUX = import.meta.glob('./legal/*.tsx', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

const SECTIONS_LEGALES: [string, () => ReactElement][] = Object.entries(MODULES_LEGAUX)
  .filter(([chemin]) => !chemin.endsWith('.test.tsx') && !chemin.endsWith('/PageLegale.tsx'))
  .map(([chemin, module]) => {
    const nom = chemin.replace('./legal/', '').replace('.tsx', '');
    const Composant = module[nom];
    if (typeof Composant !== 'function') {
      throw new Error(`${chemin} ne porte pas d'export nommé ${nom} : le glob ne sait pas la rendre.`);
    }
    const PageLegaleTrouvee = Composant as () => ReactElement;
    return [`la page légale ${nom}`, () => <PageLegaleTrouvee />];
  });

/**
 * Le 2026-09-02, envelopper le `nav` dans un fragment a laissé un commentaire
 * `//` **à l'intérieur** du JSX. En JSX, `// …` n'est pas un commentaire : c'est
 * du texte. Trois lignes de commentaire se seraient affichées en clair en haut
 * de la page, et rien ne l'aurait signalé — le fichier compile, les types
 * passent, oxlint se tait, et les tests de la barre de navigation vérifiaient un
 * panneau, pas l'absence de texte parasite.
 *
 * Ce fichier est le filet. La vitrine n'affiche jamais d'accent grave ni de
 * délimiteur de commentaire ; leur apparition ne peut vouloir dire qu'une chose.
 */
describe('aucun commentaire ne fuit dans le rendu', () => {
  it('trouve bien les trois pages légales par le glob', () => {
    // Sans cette garde, un renommage de dossier ou un motif qui cesse de
    // correspondre rendrait `SECTIONS_LEGALES` silencieusement vide — la
    // suite resterait verte en ne couvrant plus rien, exactement le défaut
    // que ce fichier existe pour empêcher.
    expect(SECTIONS_LEGALES.length).toBe(3);
  });

  it.each([...SECTIONS, ...SECTIONS_LEGALES])('%s', (_nom, section) => {
    render(section());
    const rendu = document.body.textContent ?? '';

    expect(rendu).not.toContain('/*');
    expect(rendu).not.toContain('*/');
    expect(rendu).not.toContain('`');
    expect(rendu).not.toMatch(/(^|\s)\/\/\s/);
  });
});

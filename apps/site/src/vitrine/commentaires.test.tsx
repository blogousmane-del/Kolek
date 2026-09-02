import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Acces } from './Acces';
import { Fonctionnalites } from './Fonctionnalites';
import { Hero } from './Hero';
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
];

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
  it.each(SECTIONS)('%s', (_nom, section) => {
    render(section());
    const rendu = document.body.textContent ?? '';

    expect(rendu).not.toContain('/*');
    expect(rendu).not.toContain('*/');
    expect(rendu).not.toContain('`');
    expect(rendu).not.toMatch(/(^|\s)\/\/\s/);
  });
});

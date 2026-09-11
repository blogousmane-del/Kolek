import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CourbeEvolution } from './CourbeEvolution';

/**
 * Une courbe qui ne ment pas sur ce qu'elle sait.
 *
 * Sous deux relevés, elle ne trace rien : un point seul n'a pas d'évolution,
 * et une ligne tirée jusqu'à lui en inventerait une.
 */

afterEach(cleanup);

const formater = (v: number) => `${v} u`;
const TROIS = [
  { jour: '2026-09-11', valeur: 10 },
  { jour: '2026-09-12', valeur: 30 },
  { jour: '2026-09-13', valeur: 20 },
];

describe('CourbeEvolution', () => {
  it('ne trace rien sans relevé, et le dit', () => {
    const { container } = render(<CourbeEvolution libelle="Taille" points={[]} formater={formater} />);

    expect(screen.getByText(/à partir du deuxième relevé/)).toBeDefined();
    expect(container.querySelector('path')).toBeNull();
  });

  it('donne la valeur d’un relevé unique sans tracer de ligne', () => {
    const { container } = render(
      <CourbeEvolution libelle="Taille" points={[TROIS[0]!]} formater={formater} />,
    );

    expect(screen.getByText(/Premier relevé le 11\ssept\.\s: 10 u\.$/)).toBeDefined();
    expect(container.querySelector('path')).toBeNull();
  });

  it('ne double pas le point d’un mois abrégé', () => {
    // « sept. », « oct. », « déc. »… finissent déjà par un point : la phrase
    // finit donc sur la valeur, jamais sur le jour.
    const { container } = render(
      <CourbeEvolution libelle="Taille" points={[TROIS[0]!]} formater={formater} />,
    );

    expect(container.textContent).not.toMatch(/\.\./);
  });

  it('pose un point par relevé, reliés par une seule ligne', () => {
    const { container } = render(<CourbeEvolution libelle="Taille" points={TROIS} formater={formater} />);

    expect(container.querySelectorAll('circle')).toHaveLength(3);
    const trace = container.querySelector('path')?.getAttribute('d') ?? '';
    expect(trace.startsWith('M')).toBe(true);
    expect(trace.match(/L/g)).toHaveLength(2);
  });

  it('donne le jour et la valeur au focus clavier', () => {
    const { container } = render(<CourbeEvolution libelle="Taille" points={TROIS} formater={formater} />);

    fireEvent.focus(container.querySelectorAll('circle')[1]!);

    expect(screen.getByRole('status').textContent).toMatch(/12\ssept.*30 u/);
  });

  it('propose le tableau des valeurs aux lecteurs d’écran', () => {
    render(<CourbeEvolution libelle="Taille" points={TROIS} formater={formater} />);

    const tableau = screen.getByRole('table', { name: 'Taille' });
    // Une ligne d'en-tête et une par relevé.
    expect(tableau.querySelectorAll('tr')).toHaveLength(4);
  });

  it('dessine une série plate au milieu, sans l’étirer', () => {
    const plats = TROIS.map((p) => ({ ...p, valeur: 5 }));
    const { container } = render(<CourbeEvolution libelle="Taille" points={plats} formater={formater} />);

    const hauteurs = [...container.querySelectorAll('circle')].map((c) => c.getAttribute('cy'));
    expect(new Set(hauteurs).size).toBe(1);
    expect(hauteurs[0]).toBe('90');
  });
});

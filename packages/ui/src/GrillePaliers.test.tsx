import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GrillePaliers, mrrLisible } from './GrillePaliers';

/**
 * Ce bloc etait ecrit deux fois — ecran Abonnements du Dashboard et onglet
 * Facturation du Super Admin — a un commentaire et une apostrophe pres. Deux
 * copies, c'est deux endroits ou corriger un prix, et un jour deux prix.
 *
 * La grille parcourt `PALIERS`, la grille tarifaire, et non les comptes recus :
 * un palier vendu que la reponse ne compte pas doit apparaitre a zero plutot
 * que de disparaitre.
 */

afterEach(cleanup);

const PAR_PALIER = [
  { palier: 'essai', nom: 'Essai', prix: 0, limiteClients: 20, total: 4, actifs: 0, mrr: 0 },
  { palier: 'pro', nom: 'Pro', prix: 5000, limiteClients: null, total: 12, actifs: 9, mrr: 45000 },
];

describe('mrrLisible', () => {
  it('ecrit un tiret plutot que zero : le collecteur est en essai, pas en impaye', () => {
    expect(mrrLisible(0)).toBe('—');
  });

  it('ecrit le montant suivi de son unite', () => {
    // Le separateur de milliers de `formatMontant` est une insecable U+00A0.
    // Une espace ordinaire ici ferait echouer l’epreuve, et une sequence
    // d’echappement tapee a la main deviendrait le caractere lui-meme.
    const INSECABLE = String.fromCharCode(160);
    expect(mrrLisible(45000)).toBe(`45${INSECABLE}000 FCFA`);
  });
});

describe('GrillePaliers', () => {
  it('rend une carte par palier de la grille tarifaire', () => {
    render(<GrillePaliers parPalier={PAR_PALIER} />);

    expect(screen.getByText('Essai')).toBeDefined();
    expect(screen.getByText('Pro')).toBeDefined();
  });

  it('ecrit « Gratuit » plutot qu’un prix nul', () => {
    render(<GrillePaliers parPalier={PAR_PALIER} />);

    expect(screen.getByText('Gratuit')).toBeDefined();
  });

  it('accorde le pluriel du nombre d’actifs', () => {
    render(<GrillePaliers parPalier={PAR_PALIER} />);

    expect(screen.getByText('9 actifs')).toBeDefined();
  });

  it('rend a zero un palier que la reponse ne compte pas', () => {
    render(<GrillePaliers parPalier={[]} />);

    expect(screen.getAllByText('0 actif').length).toBeGreaterThan(0);
  });
});

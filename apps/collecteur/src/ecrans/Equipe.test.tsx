import { formatMontant } from '@kolek/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { viderCache } from '../cache';

/**
 * L'écran « Mon équipe ».
 *
 * Deux choses s'y jouent qu'aucun autre écran ne porte : le compte de places
 * restantes, écrit en clair plutôt que déduit d'un bouton présent ou absent, et
 * le total des commissions de l'équipe — la contrepartie de la ligne retirée du
 * Bilan des collaborateurs. La commission ne disparaît pas, elle change de
 * poche, et le titulaire doit la voir.
 */

afterEach(() => {
  cleanup();
  viderCache();
});

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) },
  },
}));

const chargerEquipe = vi.fn();
vi.mock('../lectures-ecrans', async (original) => ({
  ...((await original()) as object),
  chargerEquipe: () => chargerEquipe(),
}));

const { Equipe } = await import('./Equipe');

function membre(nom: string, id: string, commissions = 18000) {
  return {
    id,
    nom,
    telephone: '+2250700000000',
    clients: 12,
    cartesActives: 9,
    encours: 240000,
    commissions,
    cashAttendu: 24000,
    cashDeclare: null,
    ecart: null,
    derniereDeclaration: null,
  };
}

function afficher() {
  render(<Equipe revision={0} onRetour={() => {}} onOuvrir={() => {}} />);
}

describe('l’écran Mon équipe', () => {
  it('montre un collaborateur avec ses chiffres', async () => {
    chargerEquipe.mockResolvedValue([membre('Awa Konan', 'a1')]);
    afficher();

    expect(await screen.findByText('Awa Konan')).toBeTruthy();
    const rendu = document.body.textContent ?? '';
    expect(rendu).toContain('12');
    expect(rendu).toContain('9');
  });

  it('dit que la caisse n’a pas encore été comptée, plutôt que d’afficher zéro', async () => {
    chargerEquipe.mockResolvedValue([membre('Awa Konan', 'a1')]);
    afficher();

    expect(await screen.findByText('Awa Konan')).toBeTruthy();
    // Un écart de 0 FCFA affiché avant que le collaborateur ait compté serait
    // un chiffre inventé, et le titulaire le lirait comme « tout va bien ».
    expect(document.body.textContent).toContain('pas encore comptée');
  });

  it('totalise les commissions de l’équipe', async () => {
    chargerEquipe.mockResolvedValue([
      membre('Awa', 'a1', 10000),
      membre('Kofi', 'a2', 5000),
    ]);
    afficher();

    expect(await screen.findByText('Awa')).toBeTruthy();
    expect(await screen.findByText('Commissions de l’équipe')).toBeTruthy();
    // `formatMontant` et non « 15 000 » écrit à la main : le séparateur de
    // milliers est une espace insécable (U+00A0), et une espace ordinaire ne
    // correspondrait jamais.
    expect(document.body.textContent).toContain(formatMontant(15000));
  });

  it('propose d’ajouter tant qu’il reste de la place, et compte les places en clair', async () => {
    chargerEquipe.mockResolvedValue([membre('Awa', 'a1')]);
    afficher();

    expect(await screen.findByText('Ajouter un collaborateur')).toBeTruthy();
    expect(document.body.textContent).toContain('2 places');
  });

  it('retire le bouton d’ajout à trois', async () => {
    chargerEquipe.mockResolvedValue([membre('A', 'a'), membre('B', 'b'), membre('C', 'c')]);
    afficher();

    expect(await screen.findByText('A')).toBeTruthy();
    expect(screen.queryByText('Ajouter un collaborateur')).toBeNull();
    expect(document.body.textContent).toContain('Équipe complète');
  });

  it('dit l’absence d’équipe sans la présenter comme une panne', async () => {
    chargerEquipe.mockResolvedValue([]);
    afficher();

    // Ne pas avoir d'équipe est un état normal : l'écran propose, il ne
    // s'excuse pas.
    expect(await screen.findByText('Ajouter un collaborateur')).toBeTruthy();
    expect(document.body.textContent).toContain('3 places');
  });
});

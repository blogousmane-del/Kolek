import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { TAILLE_PAGE } from '@kolek/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Demande } from '../demandes';

/**
 * Les demandes d'ouverture, et leur pagination d'affichage.
 *
 * ## Pourquoi cette liste-là n'a aucune borne
 *
 * Elle est alimentée par le formulaire public de la vitrine. Rien ne la limite
 * : ni le modèle d'affaires — les visiteurs ne sont pas des comptes payants —,
 * ni le serveur, `admin-demandes` rendant tout ce que la table contient. Une
 * campagne qui marche, ou un robot qui trouve le formulaire, et l'écran dessine
 * mille cartes de cinq boutons chacune.
 *
 * C'est la seule des cinq listes paginées du produit dont la longueur ne dépend
 * de personne à l'intérieur de l'entreprise.
 *
 * L'export, lui, continue d'écrire toutes les demandes : c'est le fichier des
 * rappels, et une page ne rappelle personne.
 */

const chargerDemandes = vi.fn();

vi.mock('../demandes', () => ({
  chargerDemandes: () => chargerDemandes(),
  traiterDemande: vi.fn(),
}));

const { Demandes } = await import('./Demandes');

/** `n` demandes numérotées, pour que l'ordre de lecture se lise à l'œil nu. */
function demandes(n: number): Demande[] {
  return Array.from({ length: n }, (_, i) => {
    const rang = String(i + 1).padStart(3, '0');
    return {
      id: `d${rang}`,
      nom: `Demande ${rang}`,
      telephone: '+2250700000009',
      zone: 'Cocody',
      palier: 'pro',
      message: null,
      statut: 'nouvelle',
      cree_le: '2026-09-01T09:00:00Z',
    } as unknown as Demande;
  });
}

/** Une cellule par demande rendue, et une seule : de quoi les compter. */
const lignesRendues = () => screen.queryAllByText(/^Demande \d{3}$/);

afterEach(() => {
  cleanup();
  chargerDemandes.mockReset();
});

describe('pagination des demandes', () => {
  it('ne rend qu’une page de cartes, quelle que soit la longueur de la liste', async () => {
    chargerDemandes.mockResolvedValue(demandes(120));
    render(<Demandes />);
    await screen.findByText('Demande 001');

    expect(lignesRendues()).toHaveLength(TAILLE_PAGE);
  });

  it('mène à la page suivante', async () => {
    chargerDemandes.mockResolvedValue(demandes(120));
    render(<Demandes />);
    await screen.findByText('Demande 001');

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));

    expect(screen.getByText('Demande 051')).toBeDefined();
    expect(screen.queryByText('Demande 001')).toBeNull();
  });

  it('n’affiche aucune commande de page quand tout tient sur une', async () => {
    chargerDemandes.mockResolvedValue(demandes(10));
    render(<Demandes />);
    await screen.findByText('Demande 001');

    expect(screen.queryByRole('button', { name: /page suivante/i })).toBeNull();
  });

  it('ne rend aucune commande pendant la lecture', async () => {
    // `demandes` vaut `null` tant que l'Edge Function n'a pas répondu. Des
    // commandes de page au-dessus d'un écran qui dit « Lecture… » n'auraient
    // rien à commander.
    chargerDemandes.mockReturnValue(new Promise(() => {}));
    render(<Demandes />);

    expect(screen.queryByRole('button', { name: /page suivante/i })).toBeNull();
  });
});

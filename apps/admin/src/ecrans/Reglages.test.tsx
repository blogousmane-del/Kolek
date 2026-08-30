import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Ce que Réglages garde, et ce qu'il a cédé.
 *
 * ## Pourquoi trois sections sont parties
 *
 * Réglages est ouvert par tout administrateur. Les administrateurs, les volumes
 * de la base et l'état du journal ne sont pas des réglages : ce sont des
 * informations système, et elles vivent désormais sur l'écran Super Admin, avec
 * les gestes qui vont avec — promouvoir, révoquer, lire le journal.
 *
 * Les laisser aux deux endroits aurait donné deux affichages de la même table
 * d'administrateurs, dont un sans les niveaux. C'est exactement la façon dont
 * deux vérités s'installent.
 *
 * Ce test est ce qui empêche leur retour par inadvertance.
 */

vi.mock('../reglages', () => ({
  chargerEtatPlateforme: () => Promise.resolve(null),
  mesurerAuth: () => Promise.resolve(null),
  lireEnvironnement: () => ({
    url: 'https://exemple.supabase.co',
    cleAnon: 'clé',
    projet: 'exemple',
    fonctions: [{ nom: 'admin-reglages', methode: 'GET', role: 'État de la plateforme' }],
  }),
  changerMotDePasse: () => Promise.resolve({ ok: true }),
  masquer: (v: string) => v,
}));

const { Reglages } = await import('./Reglages');

afterEach(cleanup);

describe('l’écran Réglages', () => {
  it('garde ce qui est un réglage', () => {
    render(<Reglages />);

    // Les titres sont cherchés comme titres : « Authentification » est aussi le
    // terme d'une ligne à l'intérieur de la section API, et un `getByText` le
    // trouverait deux fois.
    const titre = (nom: string) => screen.queryByRole('heading', { name: nom });
    expect(titre('Mon mot de passe')).not.toBeNull();
    expect(titre('API & intégration')).not.toBeNull();
    expect(titre('Authentification')).not.toBeNull();
    expect(titre('Grille tarifaire')).not.toBeNull();
  });

  it('ne montre plus ce qui relève du système', () => {
    render(<Reglages />);

    const titre = (nom: string) => screen.queryByRole('heading', { name: nom });
    expect(titre('Administrateurs')).toBeNull();
    expect(titre('Volumes de la base')).toBeNull();
    expect(titre('Journal d’audit')).toBeNull();
  });
});

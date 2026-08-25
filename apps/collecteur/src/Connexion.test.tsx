import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Le retour de Google, quand il rapporte une erreur.
 *
 * `erreurOAuth.test.ts` vérifie la lecture du motif. Ce test-ci vérifie la
 * seule chose qui compte pour le collecteur : que le motif **arrive à l'écran**.
 * Les deux sont nécessaires — une lecture correcte que personne n'affiche
 * laisse exactement la panne muette qu'on corrige.
 */

vi.mock('./supabase', () => ({
  supabase: { auth: { signInWithOAuth: vi.fn(), signInWithPassword: vi.fn() } },
}));

const { Connexion } = await import('./Connexion');

const RETOUR_EN_ECHEC =
  '/?error=server_error&error_code=unexpected_failure' +
  '&error_description=Unable+to+exchange+external+code%3A+4%2F0A';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('écran de connexion du collecteur', () => {
  it('affiche le motif quand Google renvoie une erreur', () => {
    window.history.replaceState(null, '', RETOUR_EN_ECHEC);

    render(<Connexion />);

    expect(screen.getByRole('alert').textContent).toContain('configuration');
  });

  it('retire le motif de la barre d’adresse une fois lu', () => {
    window.history.replaceState(null, '', RETOUR_EN_ECHEC);

    render(<Connexion />);

    // Sans ce nettoyage, un rechargement réafficherait une erreur déjà passée —
    // sur une page qui, elle, va peut-être bien.
    expect(window.location.search).not.toContain('error');
  });

  it('n’affiche aucune alerte sur une arrivée ordinaire', () => {
    render(<Connexion />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

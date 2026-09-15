import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const compter = vi.fn();
vi.mock('./hors-ligne/stockage-local', () => ({
  compterOperationsSurCeTelephone: () => compter(),
}));

const { Connexion } = await import('./Connexion');

const RETOUR_EN_ECHEC =
  '/?error=server_error&error_code=unexpected_failure' +
  '&error_description=Unable+to+exchange+external+code%3A+4%2F0A';

beforeEach(() => {
  compter.mockResolvedValue(0);
});

afterEach(() => {
  cleanup();
  compter.mockReset();
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

describe('ce qui attend sur le téléphone (spec J2b §8.6)', () => {
  it('annonce les opérations en attente, sans nom ni montant', async () => {
    compter.mockResolvedValue(3);
    render(<Connexion />);

    expect((await screen.findByRole('status')).textContent).toBe(
      '3 opérations attendent sur ce téléphone. Reconnecte-toi avec le même compte pour les envoyer.',
    );
  });

  it('accorde la phrase à une seule opération', async () => {
    compter.mockResolvedValue(1);
    render(<Connexion />);

    expect((await screen.findByRole('status')).textContent).toBe(
      '1 opération attend sur ce téléphone. Reconnecte-toi avec le même compte pour l’envoyer.',
    );
  });

  it('se tait quand le navigateur ne sait pas compter', async () => {
    compter.mockResolvedValue(null);
    render(<Connexion />);
    // Laisser le compte aboutir avant de constater l'absence.
    await act(async () => {});

    expect(screen.queryByRole('status')).toBeNull();
  });
});

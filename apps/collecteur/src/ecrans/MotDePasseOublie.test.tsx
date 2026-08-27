import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MotDePasseOublie } from './MotDePasseOublie';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const demanderReinitialisation = vi.fn();
vi.mock('../motDePasse', () => ({
  demanderReinitialisation: (...args: unknown[]) => demanderReinitialisation(...args),
}));

describe('MotDePasseOublie', () => {
  it('envoie l’adresse saisie', async () => {
    demanderReinitialisation.mockResolvedValue({ ok: true });
    render(<MotDePasseOublie />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'mariam@example.ci' },
    });
    fireEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await screen.findByText(/si un compte porte cette adresse/i);
    expect(demanderReinitialisation).toHaveBeenCalledWith('mariam@example.ci');
  });

  it('ne dit jamais si le compte existe', async () => {
    // C'est la moitié visible de la règle tenue côté serveur. Un message du
    // genre « aucun compte pour cette adresse » annulerait tout le travail de
    // la fonction publique.
    demanderReinitialisation.mockResolvedValue({ ok: true });
    render(<MotDePasseOublie />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'personne@example.ci' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    expect(await screen.findByText(/si un compte porte cette adresse/i)).toBeTruthy();
    expect(screen.queryByText(/aucun compte/i)).toBeNull();
  });

  it('affiche le refus quand l’envoi échoue', async () => {
    // `a@b` et non `mariam` : le champ est un `type="email"` obligatoire, et le
    // navigateur bloque lui-même la soumission d'une saisie qu'il juge mal
    // formée — `onSubmit` ne partirait jamais, et le test mesurerait la
    // validation HTML plutôt que la nôtre. `a@b` passe le contrôle du
    // navigateur, qui n'exige pas de point, et tombe sur le nôtre qui l'exige.
    // C'est exactement l'écart que ce message sert à couvrir.
    demanderReinitialisation.mockResolvedValue({
      ok: false,
      message: 'Cette adresse n’a pas la bonne forme.',
    });
    render(<MotDePasseOublie />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Cette adresse n’a pas la bonne forme.');
  });

  it('offre le retour à la connexion', () => {
    render(<MotDePasseOublie />);
    expect(screen.getByRole('link', { name: /retour à la connexion/i })).toBeTruthy();
  });
});

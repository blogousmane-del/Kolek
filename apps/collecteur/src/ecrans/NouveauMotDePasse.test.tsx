import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NouveauMotDePasse } from './NouveauMotDePasse';

afterEach(() => {
  cleanup();
  // Les doublures vivent au niveau du module et gardent leur historique d'un
  // test à l'autre. Sans cette remise à zéro, « n'a pas appelé le serveur »
  // compte l'appel légitime du test précédent.
  vi.clearAllMocks();
});

const poserMotDePasse = vi.fn();
const sessionOuverte = vi.fn();
vi.mock('../motDePasse', () => ({
  poserMotDePasse: (...args: unknown[]) => poserMotDePasse(...args),
  sessionOuverte: () => sessionOuverte(),
}));

describe('quand le lien est valide', () => {
  it('enregistre le mot de passe saisi', async () => {
    sessionOuverte.mockResolvedValue(true);
    poserMotDePasse.mockResolvedValue({ ok: true });
    render(<NouveauMotDePasse />);

    const champ = await screen.findByLabelText('Nouveau mot de passe');
    fireEvent.change(champ, { target: { value: 'gouro-marche-2026' } });
    fireEvent.change(screen.getByLabelText('Répète-le'), {
      target: { value: 'gouro-marche-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(poserMotDePasse).toHaveBeenCalledWith('gouro-marche-2026'));
  });

  it('refuse deux saisies différentes sans appeler le serveur', async () => {
    // Le mot de passe est masqué : une faute de frappe ne se voit pas, et sans
    // confirmation le collecteur se retrouve dehors avec un mot de passe qu'il
    // croit connaître — sur un téléphone, au marché, sans personne pour l'aider.
    sessionOuverte.mockResolvedValue(true);
    render(<NouveauMotDePasse />);

    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe'), {
      target: { value: 'gouro-marche-2026' },
    });
    fireEvent.change(screen.getByLabelText('Répète-le'), { target: { value: 'gouro-marche-202' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Les deux saisies ne sont pas identiques.');
    expect(poserMotDePasse).not.toHaveBeenCalled();
  });

  it('affiche le refus du serveur', async () => {
    sessionOuverte.mockResolvedValue(true);
    poserMotDePasse.mockResolvedValue({
      ok: false,
      message: 'Ce mot de passe figure dans une fuite connue. Choisis-en un autre.',
    });
    render(<NouveauMotDePasse />);

    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText('Répète-le'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe(
      'Ce mot de passe figure dans une fuite connue. Choisis-en un autre.',
    );
  });
});

describe('quand le lien a expiré', () => {
  it('le dit et renvoie vers une nouvelle demande', async () => {
    // Sans session, `updateUser` échouerait avec un message anglais et le
    // collecteur croirait son compte perdu. Le cas est nommé avant même la
    // saisie.
    sessionOuverte.mockResolvedValue(false);
    render(<NouveauMotDePasse />);

    expect(await screen.findByText(/ce lien n’est plus valable/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /demander un nouveau lien/i })).toBeTruthy();
    expect(screen.queryByLabelText('Nouveau mot de passe')).toBeNull();
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Inscription } from './Inscription';

// `globals` n'est pas activé : sans cet appel, chaque rendu s'ajoute au
// précédent et les requêtes trouvent deux champs du même nom.
afterEach(cleanup);

// La vitrine anime son entrée avec GSAP, qui mesure des éléments que jsdom ne
// dispose pas. L'animation n'est pas ce qu'on teste ici.
vi.mock('./animation', () => ({
  entree: vi.fn(),
  useAnimations: () => ({ current: null }),
}));

describe('le formulaire d’ouverture', () => {
  it('demande une adresse électronique', () => {
    // Le manque du 2026-08-27 : la demande arrivait sur le serveur sans aucun
    // moyen d'ouvrir le compte autrement qu'en rappelant.
    render(<Inscription />);

    const champ = screen.getByLabelText(/adresse e-mail/i) as HTMLInputElement;
    expect(champ.type).toBe('email');
    expect(champ.required).toBe(true);
  });

  it('garde le nom et le numéro obligatoires', () => {
    render(<Inscription />);

    expect((screen.getByLabelText(/nom complet/i) as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText(/ton numéro/i) as HTMLInputElement).required).toBe(true);
  });

  it('laisse la zone et le message facultatifs', () => {
    render(<Inscription />);

    expect((screen.getByLabelText(/zone de collecte/i) as HTMLInputElement).required).toBe(false);
    expect(
      (screen.getByLabelText(/un mot sur ton activité/i) as HTMLTextAreaElement).required,
    ).toBe(false);
  });

  it('ne promet plus que seuls le nom, le numéro et la zone partent', () => {
    // La phrase sous le bouton disait « Nom, numéro et zone uniquement ». Elle
    // est devenue fausse le jour où le champ e-mail est apparu, et une promesse
    // fausse sur une page qui collecte des données personnelles est pire qu'une
    // promesse absente.
    render(<Inscription />);

    expect(screen.queryByText(/nom, numéro et zone uniquement/i)).toBeNull();
    expect(screen.getByText(/aucun mot de passe/i)).toBeTruthy();
  });
});

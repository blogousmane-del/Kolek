import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EcranConnexion } from './EcranConnexion';

// `globals` n'est pas activé dans ce paquet : sans cet appel, chaque rendu
// s'ajoute au précédent et les requêtes trouvent deux contrôles du même nom.
afterEach(cleanup);

const BASE = {
  titre: 'Kolek',
  sousTitre: 'Chaque mise compte',
  onSoumettre: async () => null,
};

describe('le lien « Mot de passe oublié »', () => {
  it('n’apparaît pas quand aucune adresse n’est donnée', () => {
    // L'administration partage ce composant et n'a pas ce besoin : un compte
    // d'administration se récupère par GTCS, pas par un formulaire public.
    render(<EcranConnexion {...BASE} />);

    expect(screen.queryByRole('link', { name: /mot de passe oublié/i })).toBeNull();
  });

  it('mène à l’adresse donnée', () => {
    render(<EcranConnexion {...BASE} motDePasseOublie="/mot-de-passe-oublie" />);

    const lien = screen.getByRole('link', { name: /mot de passe oublié/i });
    expect(lien.getAttribute('href')).toBe('/mot-de-passe-oublie');
  });
});

describe('ce qui ne bouge pas', () => {
  it('garde les deux champs et le bouton', () => {
    render(<EcranConnexion {...BASE} motDePasseOublie="/mot-de-passe-oublie" />);

    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
  });

  it('garde le bouton fédéré quand il est fourni', () => {
    render(
      <EcranConnexion
        {...BASE}
        motDePasseOublie="/mot-de-passe-oublie"
        federee={{ libelle: 'Continuer avec Google', onActiver: vi.fn(async () => null) }}
      />,
    );

    expect(screen.getByRole('button', { name: /continuer avec google/i })).toBeTruthy();
  });
});

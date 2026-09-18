import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PALIERS } from '@kolek/core';

import { Conditions } from './Conditions';

// Comme `MentionsLegales.test.tsx`, `Fonctionnalites.test.tsx` et
// `Inscription.test.tsx` : `vitest.config.ts` ne pose pas `globals: true`,
// donc le nettoyage automatique de `@testing-library/react` ne s'enregistre
// jamais. Sans cette ligne, chaque `render` s'empile sur le précédent et
// `screen.getByText` trouve plusieurs copies de la page.
afterEach(cleanup);

describe('conditions générales', () => {
  it('nomme les parties', () => {
    render(<Conditions />);
    expect(screen.getAllByText(/BERTHE OUSMANE/).length).toBeGreaterThan(0);
  });

  it('affiche les prix réels de chaque palier, sans en inventer', () => {
    render(<Conditions />);
    for (const palier of PALIERS) {
      const attendu = palier.prix === 0 ? /gratuit/i : new RegExp(String(palier.prix));
      expect(screen.getAllByText(attendu).length).toBeGreaterThan(0);
    }
  });

  it('impose au collecteur d’informer ses clients avant de les inscrire', () => {
    render(<Conditions />);
    // Article 28 : la personne doit pouvoir refuser de figurer au fichier.
    // Aucun écran ne le permet ; l'obligation passe donc par le contrat.
    expect(screen.getByText(/refuser de figurer/i)).toBeTruthy();
  });

  it('désigne le droit ivoirien', () => {
    render(<Conditions />);
    expect(screen.getByText(/droit ivoirien|Côte d’Ivoire/)).toBeTruthy();
  });

  it('ne promet aucune disponibilité chiffrée', () => {
    const { container } = render(<Conditions />);
    // Un « 99,9 % » qu'aucune mesure ne soutient est une promesse qu'on perd.
    expect(container.textContent).not.toMatch(/9[0-9],?[0-9]*\s*%/);
  });
});

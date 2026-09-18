import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Confidentialite } from './Confidentialite';

// Comme `Conditions.test.tsx`, `MentionsLegales.test.tsx`, `Fonctionnalites.test.tsx`
// et `Inscription.test.tsx` : `vitest.config.ts` ne pose pas `globals: true`,
// donc le nettoyage automatique de `@testing-library/react` — qui cherche un
// `afterEach` global — ne s'enregistre jamais. Sans cette ligne, chaque
// `render` s'empile sur le précédent et `screen.getByText` trouve plusieurs
// copies de la page.
afterEach(cleanup);

describe('politique de confidentialité', () => {
  it('assume le transfert hors CEDEAO, au lieu de le taire', () => {
    render(<Confidentialite />);
    expect(screen.getAllByText(/CEDEAO/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Paris/).length).toBeGreaterThan(0);
  });

  it('nomme chaque sous-traitant, un par un', () => {
    render(<Confidentialite />);
    for (const nom of ['Supabase', 'Netlify', 'Twilio', 'Resend', 'Chariow', 'Google']) {
      // Chaque nom parait au moins deux fois : dans la liste des
      // sous-traitants, et dans la section du transfert hors CEDEAO.
      expect(screen.getAllByText(new RegExp(nom)).length).toBeGreaterThan(0);
    }
  });

  it('dit anonymisation, jamais suppression totale', () => {
    const { container } = render(<Confidentialite />);
    expect(container.textContent).toMatch(/anonymis/i);
    expect(container.textContent).not.toMatch(/suppression totale|effacement total/i);
  });

  it('n’invoque pas l’intérêt légitime, qui n’existe pas en droit ivoirien', () => {
    const { container } = render(<Confidentialite />);
    expect(container.textContent).not.toMatch(/intérêt légitime/i);
  });

  it('cite la loi applicable et l’autorité', () => {
    render(<Confidentialite />);
    expect(screen.getAllByText(/2013-450/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ARTCI/).length).toBeGreaterThan(0);
  });

  it('dit franchement qu’aucun écran n’existe pour exercer ses droits', () => {
    render(<Confidentialite />);
    expect(screen.getAllByText(/contact@kolek\.cash/).length).toBeGreaterThan(0);
  });
});

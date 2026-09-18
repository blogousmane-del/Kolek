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
    const { container } = render(<Confidentialite />);
    expect(screen.getAllByText(/contact@kolek\.cash/).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/aucun écran/);
    // Aucune photographie n'est collectée aujourd'hui — garantie qu'on veut
    // voir tomber si la page se met un jour à décrire une collecte de photo.
    // L'assertion précédente interdisait le mot « photo » sur toute la page,
    // ce qui interdit du même coup de le dire honnêtement : « aucune photo »
    // ne passerait pas plus qu'une vraie collecte. On resserre sur ce qu'on
    // veut vraiment garder — toute phrase qui mentionne « photo » doit nier
    // la collecte, jamais l'affirmer.
    const phrasesAvecPhoto = (container.textContent ?? '').match(/[^.]*photo[^.]*\./gi) ?? [];
    for (const phrase of phrasesAvecPhoto) {
      expect(phrase).toMatch(/aucun|pas de|n['’]est pas|jamais/i);
    }
    // Et l'exercice des droits ne part jamais sur WhatsApp. Le pied de page
    // l'offre comme canal commercial depuis la tâche 8 ; une demande d'accès
    // ou d'effacement, elle, doit laisser une trace écrite et datée, qu'une
    // conversation qu'on efface ne donne pas. L'épreuve du pied de page ne
    // pouvait pas garder cela : elle ne rend pas cette page.
    expect(container.innerHTML).not.toMatch(/wa\.me|WhatsApp/i);
  });

  it('dit que le journal d’audit garde la trace du client malgré une anonymisation', () => {
    const { container } = render(<Confidentialite />);
    // C'est la garantie la plus exposée de la page : l'anonymisation efface le
    // nom et le téléphone de la fiche, mais journaliser() copie la ligne
    // entière dans audit_log à chaque écriture, et ce journal n'est jamais
    // purgé. Le lecteur doit pouvoir le savoir sans lire le schéma.
    expect(container.textContent).toMatch(/journal d.audit[^.]*garde la trace/i);
  });
});

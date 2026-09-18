import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MentionsLegales } from './MentionsLegales';

// Comme `Fonctionnalites.test.tsx`, `Inscription.test.tsx` et `Navbar.test.tsx` :
// `vitest.config.ts` ne pose pas `globals: true`, donc le nettoyage automatique
// de `@testing-library/react` — qui cherche un `afterEach` global — ne
// s'enregistre jamais. Sans cette ligne, chaque `render` s'empile sur le
// précédent et `screen.getByText` trouve deux copies de la page.
afterEach(cleanup);

describe('mentions légales', () => {
  it('nomme la personne physique, pas seulement l’enseigne', () => {
    render(<MentionsLegales />);
    // `getAllByText` et non `getByText` : le nom parait deux fois — comme
    // editeur, et comme directeur de la publication.
    expect(screen.getAllByText(/BERTHE OUSMANE/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GSM TECHNOLOGIE CYBER SHOP/).length).toBeGreaterThan(0);
  });

  it('publie le compte contribuable, qu’exige l’article 9', () => {
    render(<MentionsLegales />);
    expect(screen.getByText(/4212842W/)).toBeTruthy();
  });

  it('nomme les hébergeurs et dit où la base est servie', () => {
    render(<MentionsLegales />);
    expect(screen.getAllByText(/Supabase/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Netlify/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Paris/).length).toBeGreaterThan(0);
  });

  it('donne l’adresse de contact au domaine, et jamais l’ancienne', () => {
    render(<MentionsLegales />);
    expect(screen.getAllByText(/contact@kolek\.cash/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/gmail\.com/)).toBeNull();
  });

  it('marque visiblement ce qui n’est pas encore renseigné', () => {
    render(<MentionsLegales />);
    // Depuis le 2026-09-18, seuls `declarationActivite` et
    // `delaiReponseJoursOuvres` valent `null`. La page des mentions rend le
    // premier ; un trou muet passerait en production sans qu’on le voie,
    // un trou marqué arrête l’œil.
    expect(screen.getAllByText(/À COMPLÉTER/).length).toBeGreaterThan(0);
  });

  it('n’invente aucun numéro ARTCI', () => {
    const { container } = render(<MentionsLegales />);
    expect(container.textContent).not.toMatch(/ARTCI\s*:?\s*(?:num[ée]ro|n[°o])/i);
  });
});

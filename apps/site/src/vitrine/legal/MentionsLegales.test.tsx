import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { IDENTITE } from './identite';
import { MentionsLegales } from './MentionsLegales';
import { Champ } from './PageLegale';

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

  it('marque visiblement un champ vide, quel qu’il soit', () => {
    // Le mécanisme, éprouvé sur `Champ` et non sur la page : le 2026-09-18,
    // le dernier trou d’identité a été comblé, et une épreuve qui exigeait un
    // marqueur *dans la page* est tombée pour la bonne nouvelle raison. Une
    // garde de mécanisme ne doit pas dépendre de l’état des données — sinon
    // elle disparaît le jour où elle n’a plus rien à surveiller, c’est-à-dire
    // juste avant le jour où un nouveau champ nul apparaît.
    render(<Champ valeur={null} nom="numéro d’essai" />);
    expect(screen.getAllByText(/À COMPLÉTER/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/numéro d’essai/).length).toBeGreaterThan(0);
  });

  it('rend le numéro de déclaration d’activité, sans marqueur', () => {
    const { container } = render(<MentionsLegales />);
    // Fourni par l’exploitant le 2026-09-18, en-tête « Déclaration d’activité »
    // — le régime de l’entreprenant, celui que la page décrit deux lignes plus
    // haut. Lu depuis `IDENTITE`, jamais recopié.
    //
    // Le champ est typé `string | Trou`, donc `string | null` : on le borne avant
    // de l’employer plutôt que de le forcer. Un `!` aurait fait compiler la même
    // épreuve en la rendant muette le jour où le numéro repasse à `null` — elle
    // aurait alors cherché la chaîne « null » dans la page, et l’y aurait peut-être
    // trouvée. Le constat de nullité est la moitié qui compte.
    const numero = IDENTITE.declarationActivite;
    expect(numero, 'le numéro de déclaration d’activité doit être renseigné').not.toBeNull();
    expect(container.textContent).toMatch(numero as string);
    expect(screen.queryByText(/À COMPLÉTER/)).toBeNull();
  });

  it('n’invente aucun numéro ARTCI', () => {
    const { container } = render(<MentionsLegales />);
    expect(container.textContent).not.toMatch(/ARTCI\s*:?\s*(?:num[ée]ro|n[°o])/i);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PiedDePage } from './PiedDePage';

describe('pied de page', () => {
  it('porte les trois textes juridiques', () => {
    render(<PiedDePage />);
    expect(screen.getByRole('link', { name: 'Mentions légales' }).getAttribute('href'))
      .toBe('/mentions-legales');
    expect(screen.getByRole('link', { name: 'Conditions générales' }).getAttribute('href'))
      .toBe('/conditions');
    expect(screen.getByRole('link', { name: 'Confidentialité' }).getAttribute('href'))
      .toBe('/confidentialite');
  });

  it('n’expose plus d’adresse personnelle', () => {
    const { container } = render(<PiedDePage />);
    expect(container.innerHTML).not.toMatch(/gmail\.com/);
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { IDENTITE } from './legal/identite';
import { PiedDePage } from './PiedDePage';

// `globals` n'est pas activé : sans cet appel, chaque rendu s'ajoute au
// précédent et `screen.getByRole('link', { name: /WhatsApp/i })` trouvait
// trois liens WhatsApp au lieu d'un, un par pied de page laissé monté par un
// test précédent. Même motif que Navbar.test.tsx.
afterEach(cleanup);

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

  it('offre WhatsApp, avec un numéro en chiffres nus', () => {
    render(<PiedDePage />);
    const lien = screen.getByRole('link', { name: /WhatsApp/i });
    // wa.me n'accepte ni espace, ni +, ni indicatif entre parenthèses : un
    // numéro formaté pour l'œil humain y ouvre une conversation vide.
    //
    // L'attente se déduit de `IDENTITE` au lieu de recopier les chiffres :
    // une épreuve qui porte sa propre copie du numéro ne peut pas signaler une
    // divergence, elle en devient la troisième.
    expect(lien.getAttribute('href')).toBe(`https://wa.me/${IDENTITE.whatsapp}`);
    expect(lien.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d{10,}$/);
    expect(lien.getAttribute('target')).toBe('_blank');
    expect(lien.getAttribute('rel')).toContain('noreferrer');
  });

  it('ne renvoie pas l’exercice des droits vers WhatsApp', () => {
    const { container } = render(<PiedDePage />);
    // Le lien des droits reste le courriel : une conversation qu’on efface ne
    // prouve ni la demande, ni sa date.
    expect(container.innerHTML).toMatch(/contact@kolek\.cash/);
  });
});

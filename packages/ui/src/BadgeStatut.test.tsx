import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BadgeStatut, type Statut } from './BadgeStatut';

const TOUS: Statut[] = [
  'À jour',
  'Actif',
  'En retard',
  'Inactif',
  'En synchro',
  'Versé aujourd’hui',
  'Clôturée',
  'Cycle terminé',
];

describe('BadgeStatut', () => {
  it('donne une teinte de fond et une couleur de texte à chaque statut', () => {
    // Un statut sans teinte sortirait en texte noir sur fond transparent :
    // lisible, donc invisible à la relecture, et faux à l'écran.
    for (const statut of TOUS) {
      const { container } = render(<BadgeStatut statut={statut} />);
      const classes = container.firstElementChild?.className ?? '';
      expect(classes).toMatch(/bg-\S+/);
      expect(classes).toMatch(/text-(positive|negative|info|muted-foreground|secondary-foreground)/);
    }
  });

  it('distingue en retard et à jour', () => {
    const retard = render(<BadgeStatut statut="En retard" />).container.firstElementChild;
    const ajour = render(<BadgeStatut statut="À jour" />).container.firstElementChild;
    expect(retard?.className).not.toBe(ajour?.className);
  });
});

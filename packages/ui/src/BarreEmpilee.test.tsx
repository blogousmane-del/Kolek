import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BarreEmpilee } from './BarreEmpilee';

/**
 * Une pastille à chevron promet un menu. Celle-ci n'en ouvrait aucun : elle
 * affiche une période, et le chevron faisait d'un libellé un faux bouton —
 * Design System §7, « un bouton qui n'écrit rien mais laisse croire le
 * contraire ». La période se choisit désormais en tête d'écran, une seule fois.
 */

afterEach(cleanup);

const PARTS = [
  { libelle: 'Encaissements', pourcentage: 60, couleur: 'bg-chart-mint', valeur: '600' },
  { libelle: 'Commissions', pourcentage: 40, couleur: 'bg-chart-slate', valeur: '400' },
];

describe('BarreEmpilee', () => {
  it('affiche la période telle qu’on la lui donne', () => {
    render(
      <BarreEmpilee titre="Répartition" total="1 000" periode="7 derniers jours" parts={PARTS} />,
    );

    expect(screen.getByText('7 derniers jours')).toBeDefined();
  });

  it('ne promet aucun menu : pas d’icône dans l’en-tête', () => {
    const { container } = render(
      <BarreEmpilee titre="Répartition" total="1 000" periode="7 derniers jours" parts={PARTS} />,
    );

    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('donne à chaque part sa valeur et son pourcentage', () => {
    render(
      <BarreEmpilee titre="Répartition" total="1 000" periode="Aujourd’hui" parts={PARTS} />,
    );

    expect(screen.getByText('Encaissements')).toBeDefined();
    expect(screen.getByText('600 FCFA')).toBeDefined();
    expect(screen.getByText('60 %')).toBeDefined();
  });
});

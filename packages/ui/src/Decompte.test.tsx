import { formatMontant } from '@kolek/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Decompte } from './Decompte';

afterEach(cleanup);

const FINE = String.fromCharCode(0x202f);

function rendre() {
  return render(
    <Decompte
      lignes={[
        { libelle: '31 mises × 1 000', montant: 31000 },
        { libelle: 'Ta commission, case 1', montant: -1000 },
      ]}
      total={{ libelle: 'À rendre', montant: 30000 }}
    />,
  );
}

describe('le décompte', () => {
  it('nomme chaque ligne, puis le total', () => {
    rendre();
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual([
      '31 mises × 1 000',
      'Ta commission, case 1',
      'À rendre',
    ]);
  });

  it('écrit les montants du produit, le retrait signé', () => {
    rendre();
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual([
      formatMontant(31000),
      `−${FINE}${formatMontant(1000)}`,
      `${formatMontant(30000)} FCFA`,
    ]);
  });

  it('pose le total sous un double filet', () => {
    const { container } = rendre();
    const total = screen.getByText('À rendre').closest('div');
    expect(total?.className).toContain('border-double');
    expect(container.querySelectorAll('.border-double')).toHaveLength(1);
  });

  it('se lit en chiffres de caisse', () => {
    rendre();
    for (const valeur of screen.getAllByRole('definition')) {
      expect(valeur.className).toContain('font-mono');
    }
  });
});

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tampon, horodatageTampon } from './Tampon';

afterEach(cleanup);

const ONZE_H_47 = new Date(2026, 9, 2, 11, 47);

describe('le tampon', () => {
  it('écrit le mot, puis la date et l\'heure du geste', () => {
    const { container } = render(<Tampon mot="Encaissé" quand={ONZE_H_47} />);
    expect(container.textContent).toBe('Encaissé02.10 · 11:47');
  });

  it('se tait pour les lecteurs d\'écran : la ligne d\'état dit la même chose', () => {
    const { container } = render(<Tampon mot="Gardée" quand={ONZE_H_47} />);
    const tampon = container.querySelector('[data-tampon]');
    expect(tampon?.getAttribute('aria-hidden')).toBe('true');
    expect(tampon?.getAttribute('data-tampon')).toBe('Gardée');
  });

  it('prend la couleur de l\'information quand la mise attend sur le téléphone', () => {
    const { container } = render(<Tampon mot="Gardée" quand={ONZE_H_47} />);
    expect(container.innerHTML).toContain('text-info');
    expect(container.innerHTML).not.toContain('text-positive');
  });

  it.each(['Encaissé', 'Clôturée'] as const)('prend la couleur du succès pour « %s »', (mot) => {
    const { container } = render(<Tampon mot={mot} quand={ONZE_H_47} />);
    expect(container.innerHTML).toContain('text-positive');
  });

  it('se pose de biais, et arrive par la primitive du tampon', () => {
    const { container } = render(<Tampon mot="Encaissé" quand={ONZE_H_47} />);
    expect(container.innerHTML).toContain('-rotate-6');
    expect(container.innerHTML).toContain('anim-tampon');
  });
});

describe('horodatageTampon', () => {
  it('écrit jour.mois · heure:minute, à deux chiffres', () => {
    expect(horodatageTampon(new Date(2026, 0, 5, 7, 3))).toBe('05.01 · 07:03');
  });
});

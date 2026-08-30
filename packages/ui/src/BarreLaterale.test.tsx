import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarreLaterale } from './BarreLaterale';

/**
 * L'entrée « Super Admin » n'apparaît que pour qui la mérite.
 *
 * ## Pourquoi masquer plutôt que griser
 *
 * Le fichier voisin porte deux fois la leçon : les entrées mortes ont été
 * retirées le 2026-08-21, puis les deux « raccourcis » grisés le 2026-08-22,
 * avec l'argument « un menu qui promet ce qu'il ne tiendra jamais est pire
 * qu'un menu court ». Une entrée grisée pour cause de privilège est un cas de
 * plus de la même famille : elle apprend à l'administrateur métier qu'il existe
 * un niveau au-dessus du sien et lui donne quelque chose à demander.
 *
 * Elle n'est donc pas rendue du tout.
 *
 * ## Ce que ce test ne prouve pas
 *
 * Rien sur la sécurité. Cacher une entrée de menu ne protège aucune donnée —
 * le portillon est `est_super_admin()`, vérifié par la base sous l'identité de
 * l'appelant, et les deux Edge Functions le redemandent. Ce test porte sur ce
 * que l'écran raconte, pas sur ce qu'il autorise.
 */

afterEach(cleanup);

const props = {
  actif: 'tableau' as const,
  onNaviguer: vi.fn(),
  onDeconnexion: vi.fn(),
};

describe('la barre latérale d’administration', () => {
  it('ne montre pas l’entrée Super Admin par défaut', () => {
    render(<BarreLaterale {...props} />);

    expect(screen.queryByText('Super Admin')).toBeNull();
    // Le reste du menu est intact : c'est une entrée en plus, pas un menu à
    // deux visages.
    expect(screen.getByText('Tableau de bord')).toBeDefined();
    expect(screen.getByText('Réglages')).toBeDefined();
  });

  it('la montre quand le compte est super admin', () => {
    render(<BarreLaterale {...props} estSuper />);

    expect(screen.getByText('Super Admin')).toBeDefined();
  });

  it('la donne à cliquer comme les autres entrées', () => {
    const onNaviguer = vi.fn();
    render(<BarreLaterale {...props} onNaviguer={onNaviguer} estSuper />);

    screen.getByText('Super Admin').click();

    expect(onNaviguer).toHaveBeenCalledWith('super');
  });
});

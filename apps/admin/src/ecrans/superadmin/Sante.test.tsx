import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SanteSysteme } from '../../superadmin';
import { Sante } from './Sante';

/**
 * L'écran de santé : ce qu'il dit, et ce qu'il refuse de dire.
 *
 * Il ne compare à « mois dernier » que s'il a le relevé d'il y a un mois. Il ne
 * juge pas la taille de la base. Et quand la base n'a rien rendu, il le dit au
 * lieu d'afficher des zéros.
 */

afterEach(cleanup);

const MAINTENANT = new Date('2026-09-11T12:00:00Z');
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
const MO = 1024 * 1024;

const SAINE: SanteSysteme = {
  mesure_le: MAINTENANT.toISOString(),
  base: { taille: 19 * MO, connexions: 18, max_connexions: 60, cache_pct: 99.99 },
  drainage: { derniere_execution: ilYA(1), dernier_succes: ilYA(1), executions_24h: 1440, echecs_24h: 0 },
  releve: { dernier_jour: '2026-09-11' },
  journal_cron: { lignes: 27497, taille: 4_767_744 },
  files: { avis_en_attente: 0, avis_plus_ancien: null, avis_abandonnes: 0, rejets_non_traites: 0 },
  releves: [
    { jour: '2026-09-10', taille_base: 18 * MO, volumes: { mises: 800, clients: 60 }, encours_clients: 1 },
    { jour: '2026-09-11', taille_base: 19 * MO, volumes: { mises: 850, clients: 64 }, encours_clients: 1 },
  ],
};

function rendre(sante: SanteSysteme | null | undefined) {
  return render(<Sante sante={sante} maintenant={MAINTENANT} />);
}

describe('la santé du système', () => {
  it('dit que tout fonctionne, et montre les cinq voyants avec leur raison', () => {
    rendre(SAINE);

    expect(screen.getByText('Tout fonctionne')).toBeDefined();
    const voyants = within(screen.getByRole('list', { name: 'Voyants' })).getAllByRole('listitem');
    expect(voyants).toHaveLength(5);
    expect(screen.getByText('Aucun rejet en attente.')).toBeDefined();
  });

  it('nomme le point en alerte, et pourquoi', () => {
    rendre({ ...SAINE, files: { ...SAINE.files, rejets_non_traites: 2 } });

    expect(screen.getByText('1 point en alerte')).toBeDefined();
    expect(screen.getByText(/2 rejets à arbitrer/)).toBeDefined();
  });

  it('dit la santé indisponible, sans rien inventer, quand la base n’a rien rendu', () => {
    for (const absente of [null, undefined]) {
      const { unmount } = rendre(absente);

      expect(screen.getByText(/Santé indisponible/)).toBeDefined();
      expect(screen.queryByText('Tout fonctionne')).toBeNull();
      unmount();
    }
  });

  it('n’écrit pas « vs mois dernier » sans relevé d’au moins trente jours', () => {
    rendre(SAINE);

    expect(screen.queryByText(/vs mois dernier/)).toBeNull();
    expect(screen.getByText(/premier relevé le 10\ssept/)).toBeDefined();
  });

  it('compare au relevé d’il y a trente jours quand il existe', () => {
    rendre({
      ...SAINE,
      releves: [
        { jour: '2026-08-10', taille_base: 10 * MO, volumes: {}, encours_clients: 1 },
        ...SAINE.releves,
      ],
    });

    expect(screen.getByText('+9 Mo vs mois dernier')).toBeDefined();
  });

  it('change de série au clic, et le dit', () => {
    rendre(SAINE);

    const mises = screen.getByRole('button', { name: 'Mises' });
    fireEvent.click(mises);

    expect(mises.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('table', { name: 'Mises' })).toBeDefined();
  });
});

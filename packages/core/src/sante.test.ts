import { describe, expect, it } from 'vitest';

import { evaluerSante, type MesuresSante, type PointSante } from './sante';

/**
 * Les seuils des voyants, de part et d'autre de chacun.
 *
 * Un seuil non éprouvé des deux côtés est un seuil qu'on ne connaît pas : à
 * 5 min pile, le drainage est-il sain ? L'épreuve le dit, et le code suit.
 */

const MAINTENANT = new Date('2026-09-11T12:00:00Z');
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

const SAIN: MesuresSante = {
  base: { taille: 19 * 1024 * 1024, connexions: 18, max_connexions: 60, cache_pct: 99.99 },
  drainage: { derniere_execution: ilYA(1), dernier_succes: ilYA(1), executions_24h: 1440, echecs_24h: 0 },
  releve: { dernier_jour: '2026-09-11' },
  journal_cron: { lignes: 27497, taille: 4_767_744 },
  files: { avis_en_attente: 0, avis_plus_ancien: null, avis_abandonnes: 0, rejets_non_traites: 0 },
};

function avec(change: Partial<{ [K in keyof MesuresSante]: Partial<MesuresSante[K]> }>): MesuresSante {
  return {
    base: { ...SAIN.base, ...change.base },
    drainage: { ...SAIN.drainage, ...change.drainage },
    releve: { ...SAIN.releve, ...change.releve },
    journal_cron: { ...SAIN.journal_cron, ...change.journal_cron },
    files: { ...SAIN.files, ...change.files },
  };
}

function niveauDe(mesures: MesuresSante, point: PointSante) {
  return evaluerSante(mesures, MAINTENANT).voyants.find((v) => v.point === point)?.niveau;
}

describe('evaluerSante', () => {
  it('rend cinq voyants normaux, dans l’ordre de l’écran, sur un système sain', () => {
    const { niveau, voyants } = evaluerSante(SAIN, MAINTENANT);

    expect(niveau).toBe('normal');
    expect(voyants.map((v) => v.point)).toEqual(['drainage', 'releve', 'avis', 'rejets', 'connexions']);
    expect(voyants.every((v) => v.niveau === 'normal' && v.raison.length > 0)).toBe(true);
  });

  describe('le drainage des avis', () => {
    it('reste normal avec un succès il y a 4 min', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: ilYA(1), dernier_succes: ilYA(4) } }), 'drainage')).toBe('normal');
    });

    it('demande attention sans succès depuis 6 min', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: ilYA(1), dernier_succes: ilYA(6) } }), 'drainage')).toBe('attention');
    });

    it('demande attention au premier échec sur 24 h', () => {
      expect(niveauDe(avec({ drainage: { echecs_24h: 1 } }), 'drainage')).toBe('attention');
    });

    it('reste en attention, pas en alerte, à 9 min sans exécution', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: ilYA(9), dernier_succes: ilYA(9) } }), 'drainage')).toBe('attention');
    });

    it('passe en alerte sans exécution depuis 11 min', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: ilYA(11), dernier_succes: ilYA(11) } }), 'drainage')).toBe('alerte');
    });

    it('passe en alerte quand rien n’a jamais tourné', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: null, dernier_succes: null } }), 'drainage')).toBe('alerte');
    });
  });

  describe('le relevé quotidien', () => {
    it('est normal avec le relevé d’hier', () => {
      expect(niveauDe(avec({ releve: { dernier_jour: '2026-09-10' } }), 'releve')).toBe('normal');
    });

    it('passe en alerte avec celui d’avant-hier', () => {
      expect(niveauDe(avec({ releve: { dernier_jour: '2026-09-09' } }), 'releve')).toBe('alerte');
    });

    it('passe en alerte sans aucun relevé', () => {
      expect(niveauDe(avec({ releve: { dernier_jour: null } }), 'releve')).toBe('alerte');
    });
  });

  describe('les avis clients', () => {
    it('restent normaux avec un avis en attente depuis 14 min', () => {
      expect(niveauDe(avec({ files: { avis_en_attente: 1, avis_plus_ancien: ilYA(14) } }), 'avis')).toBe('normal');
    });

    it('demandent attention au-delà de 15 min', () => {
      expect(niveauDe(avec({ files: { avis_en_attente: 1, avis_plus_ancien: ilYA(16) } }), 'avis')).toBe('attention');
    });

    it('demandent attention dès un avis abandonné', () => {
      expect(niveauDe(avec({ files: { avis_abandonnes: 1 } }), 'avis')).toBe('attention');
    });
  });

  describe('les rejets de synchro', () => {
    it('passent en alerte dès le premier, et le disent', () => {
      const voyant = evaluerSante(avec({ files: { rejets_non_traites: 2 } }), MAINTENANT).voyants.find(
        (v) => v.point === 'rejets',
      );
      expect(voyant?.niveau).toBe('alerte');
      expect(voyant?.raison).toMatch(/2 rejets/);
    });
  });

  describe('les connexions', () => {
    it('restent normales à 47 sur 60', () => {
      expect(niveauDe(avec({ base: { connexions: 47 } }), 'connexions')).toBe('normal');
    });

    it('demandent attention à 48 sur 60, soit 80 %', () => {
      expect(niveauDe(avec({ base: { connexions: 48 } }), 'connexions')).toBe('attention');
    });
  });

  it('prend le pire des cinq pour niveau général', () => {
    const mesures = avec({ drainage: { echecs_24h: 1 }, files: { rejets_non_traites: 1 } });
    expect(evaluerSante(mesures, MAINTENANT).niveau).toBe('alerte');
  });
});

import { describe, expect, it } from 'vitest';
import {
  formatDateLocale,
  formatFCFA,
  formatHeureLocale,
  formatMontant,
  ilYaLisible,
} from './format';

describe('formatFCFA', () => {
  it('groupe les milliers par espace et suffixe FCFA', () => {
    expect(formatFCFA(817432)).toBe('817 432 FCFA');
    expect(formatFCFA(2500)).toBe('2 500 FCFA');
    expect(formatFCFA(1000000)).toBe('1 000 000 FCFA');
  });

  it('gère zéro et les petits montants sans séparateur', () => {
    expect(formatFCFA(0)).toBe('0 FCFA');
    expect(formatFCFA(500)).toBe('500 FCFA');
  });

  it('gère les montants négatifs', () => {
    expect(formatFCFA(-1000)).toBe('-1 000 FCFA');
  });

  it('tronque toute décimale - le FCFA n\'a pas de sous-unité', () => {
    expect(formatFCFA(1000.9)).toBe('1 000 FCFA');
  });

  it('refuse une valeur non finie', () => {
    expect(() => formatFCFA(Number.NaN)).toThrow(TypeError);
    expect(() => formatFCFA(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('formatMontant', () => {
  it('formate sans le suffixe', () => {
    expect(formatMontant(817432)).toBe('817 432');
  });
});

describe('formats de date', () => {
  it('formate une date au format local ivoirien', () => {
    expect(formatDateLocale(new Date(2026, 7, 15))).toBe('15/08/2026');
  });

  it('formate date et heure', () => {
    expect(formatHeureLocale(new Date(2026, 7, 15, 14, 32))).toBe('15/08/2026 à 14:32');
  });
});

/**
 * L'âge d'un chiffre, pas l'heure qu'il était. Au-delà d'une heure le relatif
 * cesse d'informer — « il y a 97 min » se recompte de tête — et l'absolu
 * reprend la main.
 *
 * L'instant de référence est passé en second argument : une épreuve qui lirait
 * l'horloge du poste changerait de résultat à chaque exécution.
 */

const MAINTENANT = new Date('2026-09-12T10:00:00Z');

describe('ilYaLisible', () => {
  it('dit « à l’instant » sous la minute', () => {
    expect(ilYaLisible('2026-09-12T09:59:30Z', MAINTENANT)).toBe('à l’instant');
  });

  it('compte les minutes', () => {
    expect(ilYaLisible('2026-09-12T09:57:00Z', MAINTENANT)).toBe('il y a 3 min');
  });

  /**
   * Le motif ne fixe que la forme « à HH:MM » : `formatHeureLocale` lit l'heure
   * locale du poste, et l'épreuve doit passer ailleurs qu'à Abidjan.
   */
  it('bascule sur l’heure absolue au-delà d’une heure', () => {
    expect(ilYaLisible('2026-09-12T08:00:00Z', MAINTENANT)).toMatch(/à \d{2}:\d{2}$/);
  });

  it('ne compte pas à rebours : une date à venir se lit « à l’instant »', () => {
    expect(ilYaLisible('2026-09-12T10:05:00Z', MAINTENANT)).toBe('à l’instant');
  });
});

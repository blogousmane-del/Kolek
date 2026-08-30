import { describe, expect, it } from 'vitest';
import { formatDateLocale, formatFCFA, formatHeureLocale, formatMontant } from './format';

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

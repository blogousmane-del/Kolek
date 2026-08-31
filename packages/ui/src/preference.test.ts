import { afterEach, describe, expect, it, vi } from 'vitest';

import { ecrirePreference, lirePreference } from './preference';

const TAILLES = ['reduite', 'moyenne', 'grande'] as const;

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('lirePreference', () => {
  it('rend le défaut quand rien n’a été choisi', () => {
    expect(lirePreference('kolek.essai', TAILLES, 'reduite')).toBe('reduite');
  });

  it('rend ce qui a été choisi', () => {
    ecrirePreference('kolek.essai', 'grande');
    expect(lirePreference('kolek.essai', TAILLES, 'reduite')).toBe('grande');
  });

  it('ignore une valeur qu’elle ne connaît pas', () => {
    // Ce qui est stocké survit au code qui l'a écrit : une taille renommée ou
    // retirée laisse derrière elle un mot que la version d'après ne comprend
    // plus, et qui ne doit pas arriver jusqu'à l'écran.
    localStorage.setItem('kolek.essai', 'immense');
    expect(lirePreference('kolek.essai', TAILLES, 'moyenne')).toBe('moyenne');
  });

  it('rend le défaut quand le stockage refuse de répondre', () => {
    // Navigation privée, stockage désactivé : l'accès lève. Une préférence
    // d'affichage n'est jamais une raison de casser un écran.
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('stockage refusé');
    });
    expect(lirePreference('kolek.essai', TAILLES, 'reduite')).toBe('reduite');
  });
});

describe('ecrirePreference', () => {
  it('se tait quand le stockage refuse d’écrire', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota dépassé');
    });
    expect(() => ecrirePreference('kolek.essai', 'grande')).not.toThrow();
  });
});

describe('quand le stockage se refuse à l’accès', () => {
  it('rend le défaut sans rien laisser passer', () => {
    // Le cas de Chrome quand les cookies tiers sont bloqués : ce n'est pas
    // l'appel qui lève, c'est la lecture de `localStorage` elle-même. Une garde
    // posée devant le `try` ne verrait rien venir.
    const origine = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('accès au stockage refusé');
      },
    });

    try {
      expect(lirePreference('kolek.essai', TAILLES, 'moyenne')).toBe('moyenne');
      expect(() => ecrirePreference('kolek.essai', 'grande')).not.toThrow();
    } finally {
      if (origine) Object.defineProperty(globalThis, 'localStorage', origine);
    }
  });
});

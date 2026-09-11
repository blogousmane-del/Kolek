import { describe, expect, it } from 'vitest';

import { jourLisible, tailleLisible } from './lisible';

describe('tailleLisible', () => {
  it('écrit les octets en unités françaises, avec une insécable avant l’unité', () => {
    expect(tailleLisible(0)).toBe('0\u00a0o');
    expect(tailleLisible(512)).toBe('512\u00a0o');
    expect(tailleLisible(2048)).toBe('2\u00a0Ko');
    // 4 656 Ko, la taille du journal pg_cron mesurée en production.
    expect(tailleLisible(4_767_744)).toBe('4,5\u00a0Mo');
    expect(tailleLisible(19 * 1024 * 1024)).toBe('19\u00a0Mo');
    expect(tailleLisible(3 * 1024 ** 3)).toBe('3\u00a0Go');
  });
});

describe('jourLisible', () => {
  it('lit le jour en UTC, qui est l’heure d’Abidjan', () => {
    expect(jourLisible('2026-09-12')).toMatch(/^12\ssept\.?\s2026$/);
  });
});

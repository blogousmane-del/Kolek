import { describe, expect, it } from 'vitest';

import { nu } from './recherche';

/**
 * Le repli commun aux trois recherches par nom.
 *
 * Il tient en quatre lignes, et chacune a déjà coûté un défaut : la plage de
 * diacritiques écrite en caractères bruts s'est fait réécrire une fois en
 * `[0300-036f]`, qui mange les chiffres 0, 3 et 6 — donc la recherche par
 * numéro de téléphone, dans un écran qui n'est même pas celui-ci.
 */
describe('le repli de recherche', () => {
  it('retire les accents, pour que « traore » trouve « Traoré »', () => {
    expect(nu('Traoré')).toBe('traore');
    expect(nu('Adjamé')).toBe('adjame');
    expect(nu('Koné')).toBe('kone');
    expect(nu('Aïcha')).toBe('aicha');
  });

  it('met en minuscules', () => {
    expect(nu('HAMED')).toBe('hamed');
    expect(nu('GSM T')).toBe('gsm t');
  });

  /**
   * Le témoin qui dit que la plage n'a pas dérivé.
   *
   * `[0300-036f]` — ce qu'une substitution a fait de la plage le 2026-09-09 —
   * est une classe de caractères parfaitement valide : elle ne lève rien, elle
   * se contente de manger les 0, 3 et 6. Une épreuve qui ne regarde que les
   * accents la laisse passer.
   */
  it('ne touche à aucun chiffre', () => {
    expect(nu('0708091011')).toBe('0708091011');
    expect(nu('+225 07 03 06 00')).toBe('+225 07 03 06 00');
  });

  it('laisse une chaîne vide vide', () => {
    expect(nu('')).toBe('');
  });
});

import { describe, expect, it } from 'vitest';

import { correspondClient, nu } from './recherche';

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

/**
 * La règle de l'écran Clients, déplacée ici le 2026-10-02 : l'onglet
 * « Encaisser » cherche une carte par les mêmes trois clefs. Deux règles
 * voisines finiraient par diverger, et le collecteur ne retrouverait pas au
 * même endroit le même client.
 */
describe('correspondClient', () => {
  const AWA = { nom: 'Awa Traoré', marche: 'Adjamé', telephone: '+225 07 08 09 10 11' };

  it('trouve par le nom, sans accent ni majuscule', () => {
    expect(correspondClient(AWA, 'traore')).toBe(true);
  });

  it('trouve par le marché', () => {
    expect(correspondClient(AWA, 'adjame')).toBe(true);
  });

  it('trouve par les chiffres du numéro, quelle que soit leur mise en forme', () => {
    expect(correspondClient(AWA, '0708')).toBe(true);
  });

  it('laisse passer tout le monde sur un terme vide', () => {
    expect(correspondClient(AWA, '')).toBe(true);
  });

  it('laisse passer tout le monde sur un terme fait d’espaces', () => {
    expect(correspondClient({ nom: 'Ka', marche: null, telephone: null }, '   ')).toBe(true);
  });

  it('ne tient pas compte de l’espace laissée après le terme', () => {
    expect(correspondClient({ nom: 'Awa', marche: null, telephone: null }, 'awa ')).toBe(true);
  });

  it('écarte ce qui ne correspond à rien', () => {
    expect(correspondClient(AWA, 'bintou')).toBe(false);
  });

  it('tient un client sans marché ni numéro', () => {
    expect(correspondClient({ nom: 'Ka', marche: null, telephone: null }, '07')).toBe(false);
  });
});

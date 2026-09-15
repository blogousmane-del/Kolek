import { describe, expect, it } from 'vitest';

import {
  estRattrapee,
  misesAffichees,
  SURSIS_MS,
  SURSIS_S,
  type EnAttente,
} from './encaissement-differe';

function attente(partiel: Partial<EnAttente> = {}): EnAttente {
  return { carteId: 'k1', mise: 1000, base: 5, operationId: 'op-1', envoyee: false, ...partiel };
}

describe('misesAffichees', () => {
  it('rend le compte réel quand rien n\'attend', () => {
    expect(misesAffichees('k1', 5, null)).toBe(5);
  });

  it('ne touche pas aux cartes voisines', () => {
    // L'optimisme vaut pour la carte qu'on vient d'encaisser, et pour elle
    // seule. Une case remplie sur la carte d'à côté serait un mensonge.
    expect(misesAffichees('k2', 12, attente())).toBe(12);
  });

  it('compte le jour de plus sur la carte dont la mise est sur le téléphone', () => {
    expect(misesAffichees('k1', 5, attente())).toBe(6);
  });

  it('ne compte rien pour un appui que le téléphone a refusé', () => {
    // Rien n'est montré comme fait avant d'être sur le disque (spec J2b §4.1).
    expect(misesAffichees('k1', 5, attente({ operationId: null, envoyee: true, echec: 'Refus' }))).toBe(5);
  });

  it('ne fait jamais redescendre le compte', () => {
    // La relecture de la tournée compte déjà la mise en file. Si elle compte
    // davantage — une seconde mise partie d'ailleurs — c'est elle qui dit
    // vrai ; la case ne doit pas se revider pour autant.
    expect(misesAffichees('k1', 6, attente())).toBe(6);
    expect(misesAffichees('k1', 7, attente())).toBe(7);
  });
});

describe('estRattrapee', () => {
  it('reste fausse tant que la relecture n\'a rien ramené', () => {
    expect(estRattrapee(5, attente())).toBe(false);
  });

  it('devient vraie dès que la mise est comptée par la tournée', () => {
    expect(estRattrapee(6, attente())).toBe(true);
  });
});

describe('le sursis', () => {
  it('vaut six secondes, dites une seule fois', () => {
    // Les deux valeurs servent deux usages — l'échéance de l'opération et le
    // décompte affiché. Les laisser diverger ferait disparaître « Annuler » une
    // seconde avant, ou après, l'instant où il cesse d'être vrai.
    expect(SURSIS_S).toBe(6);
    expect(SURSIS_MS).toBe(SURSIS_S * 1000);
  });
});

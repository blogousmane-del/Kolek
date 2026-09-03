import { describe, expect, it } from 'vitest';

import { secretValide } from '../functions/_shared/secret';

/**
 * La comparaison de secret, sortie de `chariow.ts` le 2026-09-03.
 *
 * Deux appelants s'en servent maintenant pour des raisons opposées : le webhook
 * de paiement reconnaît Chariow, `envoyer-avis` reconnaît son horloge. Ce qui
 * est vérifié ici ne dépend d'aucun des deux — c'est la propriété du procédé.
 *
 * Le deuxième test est le seul qui distingue cette fonction de `===`. Il compare
 * deux secrets de même longueur ne différant que par le dernier caractère :
 * c'est précisément le cas où une comparaison naïve met le plus de temps avant
 * de dire non, et où cette durée renseigne l'attaquant.
 */

describe('secretValide', () => {
  it('accepte le secret exact', async () => {
    expect(await secretValide('s3cr3t', 's3cr3t')).toBe(true);
  });

  it('refuse un préfixe correct de même longueur', async () => {
    expect(await secretValide('s3cr3T', 's3cr3t')).toBe(false);
  });

  it('refuse une longueur différente, un secret vide, un secret absent', async () => {
    expect(await secretValide('s3cr3', 's3cr3t')).toBe(false);
    expect(await secretValide(null, 's3cr3t')).toBe(false);
    expect(await secretValide('s3cr3t', '')).toBe(false);
  });
});

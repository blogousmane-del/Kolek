import { MISES_PAR_CYCLE, commission, soldeRestituable } from '@kolek/core';
import { describe, expect, it } from 'vitest';

import {
  MISES_PAR_CYCLE as MISES_EDGE,
  partager,
} from '../functions/_shared/restitution';

/**
 * Le partage d'une carte à sa clôture, et la garde qui empêche les deux
 * implémentations de diverger.
 *
 * La formule vit à deux endroits : `packages/core/src/calcul.ts` pour les
 * écrans, `supabase/functions/_shared/restitution.ts` pour l'Edge Function.
 * Deno ne sait pas importer un paquet de l'espace de travail npm, et engendrer
 * un module comme on le fait pour la grille tarifaire serait lourd pour une
 * multiplication.
 *
 * Ce fichier est ce qui rend la duplication acceptable. Il importe les deux et
 * vérifie qu'elles s'accordent sur tout le domaine. Le jour où l'une bouge sans
 * l'autre, la suite tombe — c'est ce qui distingue une duplication surveillée
 * d'une divergence silencieuse.
 */

describe('parité avec le moteur de calcul', () => {
  it('a la même longueur de cycle des deux côtés', () => {
    expect(MISES_EDGE).toBe(MISES_PAR_CYCLE);
  });

  it('rend le même montant sur tout le domaine', () => {
    // Toutes les mises possibles du carnet, croisées avec les montants réels du
    // terrain. Le domaine est petit — 31 × 5 — donc autant l'épuiser plutôt que
    // d'échantillonner.
    for (const mise of [500, 1000, 2000, 5000, 10_000]) {
      for (let encaissees = 0; encaissees <= MISES_PAR_CYCLE; encaissees += 1) {
        const cote = partager(encaissees, mise);

        expect(cote.montantRestitue).toBe(soldeRestituable(encaissees, mise));
        expect(cote.commission).toBe(commission(encaissees, mise));
      }
    }
  });
});

describe('les cas qui portent de l’argent', () => {
  it('laisse la première mise au collecteur', () => {
    const { montantRestitue, commission: part } = partager(1, 2000);

    expect(montantRestitue).toBe(0);
    expect(part).toBe(2000);
  });

  it('rend trente mises sur un cycle complet', () => {
    // 31 mises encaissées, 30 rendues, 1 gardée. C'est la règle du cahier §4, et
    // le chiffre que le client attend au bout de son carnet.
    const { montantRestitue, commission: part } = partager(MISES_PAR_CYCLE, 1000);

    expect(montantRestitue).toBe(30_000);
    expect(part).toBe(1000);
  });

  it('ne rend jamais moins que rien sur une carte sans mise', () => {
    // Une carte ouverte puis abandonnée le jour même se clôture légitimement.
    // Sans le plancher, `(0 − 1) × mise` rendrait un montant négatif, que la
    // contrainte `montant_restitue >= 0` refuserait — après avoir laissé croire
    // à l'écran qu'on allait rendre quelque chose.
    const { montantRestitue, commission: part } = partager(0, 5000);

    expect(montantRestitue).toBe(0);
    expect(part).toBe(0);
  });
});

describe('entrées refusées', () => {
  it('refuse un compteur de mises qui n’est pas un entier positif', () => {
    for (const valeur of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => partager(valeur, 1000)).toThrow('MISES_INVALIDES');
    }
  });

  it('refuse une mise nulle ou négative', () => {
    // La base l'interdit déjà (`mise between 500 and 10000`), mais lever ici
    // évite d'écrire une ligne de retrait à zéro sur une carte corrompue.
    for (const valeur of [0, -500, 1.5]) {
      expect(() => partager(10, valeur)).toThrow('MISE_INVALIDE');
    }
  });
});

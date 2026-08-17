import { describe, expect, it } from 'vitest';

import { PALIERS, PALIER_RECOMMANDE, palierParCle } from './paliers';
import type { Palier } from './types';

describe('grille tarifaire', () => {
  it('couvre exactement les quatre paliers du type Palier', () => {
    const attendus: Palier[] = ['essai', 'standard', 'pro', 'illimite'];
    expect(PALIERS.map((p) => p.cle)).toEqual(attendus);
  });

  it('donne l’essai gratuit et les autres payants', () => {
    expect(palierParCle('essai').prix).toBe(0);
    for (const cle of ['standard', 'pro', 'illimite'] as const) {
      expect(palierParCle(cle).prix).toBeGreaterThan(0);
    }
  });

  it('classe les prix par ordre croissant', () => {
    const prix = PALIERS.map((p) => p.prix);
    expect([...prix].sort((a, b) => a - b)).toEqual(prix);
  });

  it('exprime les montants en entiers FCFA — jamais de centimes', () => {
    for (const p of PALIERS) expect(Number.isInteger(p.prix)).toBe(true);
  });

  it('décrit les mêmes fonctions dans le même ordre pour tous les paliers', () => {
    // Sans cette règle, la comparaison visuelle entre colonnes ment : deux
    // paliers alignent des lignes qui ne parlent pas de la même chose.
    const reference = PALIERS[0]!.fonctions.map((f) => f.libelle.length > 0);
    for (const p of PALIERS) {
      expect(p.fonctions.map((f) => f.libelle.length > 0)).toEqual(reference);
    }
  });

  it('rend le palier recommandé résoluble', () => {
    expect(palierParCle(PALIER_RECOMMANDE).nom).toBe('Pro');
  });

  it('refuse une clé inconnue plutôt que de renvoyer undefined', () => {
    expect(() => palierParCle('gratuit' as Palier)).toThrow(RangeError);
  });
});

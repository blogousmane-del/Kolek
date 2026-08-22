import { beforeEach, describe, expect, it } from 'vitest';

import { PEREMPTION_MS, ecrireCache, lireCache, tailleCache, viderCache } from './cache';

/**
 * Le cache de navigation.
 *
 * Trois propriétés sont testées ici, et elles ne pèsent pas le même poids.
 *
 * La vitesse est le motif du module, mais c'est la moins risquée : un cache qui
 * ne rend rien fait simplement retomber l'écran sur son comportement d'avant.
 *
 * **L'invalidation par révision est celle qui compte.** Ces valeurs sont des
 * soldes de clients. Un cache qui sert un solde d'avant un encaissement montre
 * au collecteur de l'argent qu'il vient déjà de prendre — et il le reprend.
 * C'est un défaut de comptage, pas un défaut d'affichage.
 *
 * **Le vidage à la déconnexion** ferme le cas de deux collecteurs qui se
 * relaient sur le même téléphone.
 */

beforeEach(() => {
  viderCache();
});

describe('ce qui est gardé', () => {
  it('rend la valeur rangée sous la même clé', () => {
    ecrireCache('bilan', { encaisse: 12_000 });

    expect(lireCache<{ encaisse: number }>('bilan')?.valeur).toEqual({ encaisse: 12_000 });
  });

  it('ne rend rien pour une clé jamais écrite', () => {
    expect(lireCache('jamais-vue')).toBeNull();
  });

  it('sépare les clés : un écran n’en lit pas un autre', () => {
    ecrireCache('bilan', 1);
    ecrireCache('recus', 2);

    expect(lireCache<number>('bilan')?.valeur).toBe(1);
    expect(lireCache<number>('recus')?.valeur).toBe(2);
  });
});

describe('la fraîcheur', () => {
  it('marque frais ce qui vient d’être écrit', () => {
    ecrireCache('bilan', 1, 0, 1_000);

    expect(lireCache('bilan', 0, 1_000)?.frais).toBe(true);
  });

  it('marque périmé au-delà du délai, sans effacer la valeur', () => {
    ecrireCache('bilan', 42, 0, 1_000);

    const trouve = lireCache<number>('bilan', 0, 1_000 + PEREMPTION_MS + 1);

    // Périmé ne veut pas dire faux : l'écran l'affiche pendant que la relecture
    // part en fond. Le vide serait un recul par rapport à une valeur d'il y a
    // une minute.
    expect(trouve?.frais).toBe(false);
    expect(trouve?.valeur).toBe(42);
  });

  it('reste frais juste avant l’échéance', () => {
    ecrireCache('bilan', 1, 0, 0);

    expect(lireCache('bilan', 0, PEREMPTION_MS - 1)?.frais).toBe(true);
  });
});

describe('l’invalidation par révision', () => {
  it('refuse une valeur rangée avant une écriture', () => {
    // Le scénario réel : le collecteur ouvre le bilan (révision 0), revient,
    // encaisse une mise (révision 1), rouvre le bilan. Le total d'avant ne doit
    // pas s'afficher, même une demi-seconde.
    ecrireCache('bilan', { encaisse: 12_000 }, 0);

    expect(lireCache('bilan', 1)).toBeNull();
  });

  it('retire l’entrée périmée plutôt que de la laisser dormir', () => {
    ecrireCache('bilan', 1, 0);
    lireCache('bilan', 1);

    // Sans la suppression, un retour à la révision 0 — impossible en pratique,
    // mais rien dans le type ne l'empêche — ressusciterait la vieille valeur.
    expect(lireCache('bilan', 0)).toBeNull();
    expect(tailleCache()).toBe(0);
  });

  it('rend de nouveau la valeur une fois réécrite à la révision courante', () => {
    ecrireCache('bilan', { encaisse: 12_000 }, 0);
    lireCache('bilan', 1);
    ecrireCache('bilan', { encaisse: 14_500 }, 1);

    expect(lireCache<{ encaisse: number }>('bilan', 1)?.valeur).toEqual({ encaisse: 14_500 });
  });
});

describe('la déconnexion', () => {
  it('ne laisse rien derrière elle', () => {
    ecrireCache('bilan', { nom: 'Mariam Koné' });
    ecrireCache('recus', [{ nom: 'Adama Traoré' }]);
    expect(tailleCache()).toBe(2);

    viderCache();

    expect(tailleCache()).toBe(0);
    expect(lireCache('bilan')).toBeNull();
    expect(lireCache('recus')).toBeNull();
  });
});

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PEREMPTION_MS, ecrireCache, lireCache, tailleCache, useDonnees, viderCache } from './cache';

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

  it('ne modifie rien en lisant', () => {
    // Corrigé par l'audit du 2026-08-23. `lireCache` supprimait l'entrée
    // périmée, et les écrans l'appellent depuis l'initialiseur de `useState` —
    // donc pendant le rendu, que React peut abandonner ou rejouer. Une lecture
    // doit être une lecture.
    ecrireCache('bilan', 1, 0);
    lireCache('bilan', 1);

    expect(tailleCache()).toBe(1);
  });

  it('écrase l’entrée périmée à la lecture suivante, sans la purger', () => {
    // Ce qui rendait la purge inutile : les révisions ne font que croître, donc
    // la vieille valeur n'est jamais resservie, et la lecture qui suit l'écrase.
    ecrireCache('bilan', 1, 0);
    expect(lireCache('bilan', 1)).toBeNull();

    ecrireCache('bilan', 2, 1);
    expect(lireCache<number>('bilan', 1)?.valeur).toBe(2);
    expect(tailleCache()).toBe(1);
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

/**
 * `useDonnees` hors ligne.
 *
 * Le défaut corrigé : sans valeur gardée, le hook lançait la requête même en
 * sachant le réseau absent. `postgrest-js` la retente trois fois — sept
 * secondes — et pendant ce temps `donnees` et `erreur` valent tous deux `null`,
 * l'état exact dans lequel les écrans affichent leur squelette. L'écran ne
 * restait pas muet : il **promettait** des données impossibles.
 *
 * Mais huit des quatorze appels seulement lisent le réseau — les six autres
 * lisent IndexedDB par `lectureCourante()` et réussissent hors ligne. Couper la
 * requête sans discernement casserait ces six-là. `besoinReseau` porte cette
 * distinction : seuls les appels qui le déclarent sont concernés par le
 * court-circuit ; absent, il vaut `false` et rien n'est coupé (spec §3.1).
 *
 * L'épreuve qui compte, pour un appel réseau, est
 * `expect(chargeur).not.toHaveBeenCalled()`. On n'affirme pas « c'est plus
 * rapide » — un délai ne s'éprouve pas — on affirme que la requête n'a pas
 * lieu. Pour un appel qui ne déclare pas `besoinReseau`, c'est l'inverse qui
 * compte : la requête doit avoir lieu, hors ligne comme en ligne.
 */
describe('useDonnees hors ligne', () => {
  const MESSAGE = 'Cet écran demande le réseau.';

  const couper = () =>
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });

  afterEach(() => {
    cleanup();
    delete (window.navigator as unknown as { onLine?: boolean }).onLine;
  });

  it('avec besoinReseau, sans rien de gardé, pose l’erreur sans lancer la requête', async () => {
    couper();
    const chargeur = vi.fn().mockResolvedValue({ encaisse: 12_000 });

    const { result } = renderHook(() =>
      useDonnees('bilan', chargeur, { messageErreur: MESSAGE, besoinReseau: true }),
    );

    await waitFor(() => expect(result.current.erreur).toBe(MESSAGE));
    expect(chargeur).not.toHaveBeenCalled();
    expect(result.current.donnees).toBeNull();
    expect(result.current.enCours).toBe(false);
  });

  it('sans besoinReseau, sans rien de gardé, lance quand même la requête (les six lectures de disque)', async () => {
    // C'est le cas des six chargeurs qui lisent IndexedDB via `lectureCourante()`
    // et n'ont jamais besoin du réseau : `Accueil`, `commission.ts` (×3), `Plus`,
    // `Rapprochement`. `besoinReseau` absent doit valoir `false` et ne rien
    // couper — c'est le sens sûr de l'erreur (spec §3.1).
    couper();
    const chargeur = vi.fn().mockResolvedValue({ encaisse: 12_000 });

    const { result } = renderHook(() => useDonnees('bilan', chargeur, { messageErreur: MESSAGE }));

    await waitFor(() => expect(result.current.donnees).toEqual({ encaisse: 12_000 }));
    expect(chargeur).toHaveBeenCalledTimes(1);
    expect(result.current.erreur).toBeNull();
  });

  it('avec une valeur gardée périmée par le temps, l’affiche, retente en fond, et l’échec ne pose aucune erreur', async () => {
    // Une valeur fraîche sort plus tôt sur `if (garde.frais) return;`, avant
    // d'atteindre la garde hors-ligne : elle ne prouve donc rien sur elle.
    // Une valeur périmée par le temps continue, tente une revalidation — qui
    // échoue ici — et ce sont ses conséquences qu'on vérifie.
    const valeur = { encaisse: 12_000 };
    ecrireCache('bilan', valeur, 0, Date.now() - PEREMPTION_MS - 1);
    couper();
    const chargeur = vi.fn().mockRejectedValue(new Error('réseau coupé'));

    const { result } = renderHook(() =>
      useDonnees('bilan', chargeur, { messageErreur: MESSAGE, besoinReseau: true }),
    );

    await waitFor(() => expect(chargeur).toHaveBeenCalledTimes(1));
    expect(result.current.donnees).toEqual(valeur);
    expect(result.current.erreur).toBeNull();
  });

  it('en ligne, lance la requête comme avant', async () => {
    const chargeur = vi.fn().mockResolvedValue({ encaisse: 12_000 });

    const { result } = renderHook(() => useDonnees('bilan', chargeur, { messageErreur: MESSAGE }));

    await waitFor(() => expect(result.current.donnees).toEqual({ encaisse: 12_000 }));
    expect(chargeur).toHaveBeenCalledTimes(1);
    expect(result.current.erreur).toBeNull();
  });
});

import { vi } from 'vitest';

/**
 * Un `localStorage` pour les tests, parce qu'il n'y en a aucun.
 *
 * jsdom en fournit un. Node aussi, depuis la 22 — mais le sien reste
 * `undefined` tant qu'on ne lui passe pas `--localstorage-file`, et c'est celui
 * de Node qui gagne : dans cet environnement, `window.localStorage` comme
 * `globalThis.localStorage` valent `undefined`, et la console le dit à chaque
 * lancement (« localStorage is not available because --localstorage-file was
 * not provided »).
 *
 * Sans ce fichier, tout code qui touche au stockage serait vert pour la
 * mauvaise raison : la garde d'absence de `preference.ts` répondrait à sa
 * place, et rien de ce qui est réellement écrit ou relu ne serait jamais
 * vérifié.
 *
 * Ce qui est posé ici est une mémoire, pas une imitation du navigateur : elle
 * ne simule ni quota, ni cloisonnement par origine, ni persistance entre
 * lancements. Ce qu'on teste au-dessus est ce que Kolek écrit et relit, pas ce
 * que le navigateur en fait.
 */
function stockageEnMemoire(): Storage {
  const memoire = new Map<string, string>();

  return {
    get length() {
      return memoire.size;
    },
    key(rang: number) {
      return [...memoire.keys()][rang] ?? null;
    },
    getItem(cle: string) {
      return memoire.get(cle) ?? null;
    },
    setItem(cle: string, valeur: string) {
      memoire.set(cle, String(valeur));
    },
    removeItem(cle: string) {
      memoire.delete(cle);
    },
    clear() {
      memoire.clear();
    },
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  vi.stubGlobal('localStorage', stockageEnMemoire());
}

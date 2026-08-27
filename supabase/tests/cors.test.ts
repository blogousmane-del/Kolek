import { describe, expect, it } from 'vitest';

import { ENTETES_MINIMAUX, entetesCors, listerOrigines } from '../functions/_shared/cors';

/**
 * Le défaut que ces tests existent pour empêcher, constaté en production le
 * 2026-08-20 : le tableau de bord affichait « Failed to send a request to the
 * Edge Function », et la fonction n'était jamais atteinte.
 *
 * La liste des en-têtes autorisés était figée à `authorization, content-type`.
 * `supabase-js` en envoie deux de plus à chaque appel — `x-client-info` et
 * `apikey` — donc le navigateur refusait d'envoyer la requête.
 *
 * Ce qui rend l'histoire instructive n'est pas la ligne fautive, c'est la sonde
 * qui l'a manquée : un `curl -X OPTIONS` demandant exactement les deux en-têtes
 * déjà listés répondait `204`. Elle confirmait la liste au lieu de l'éprouver.
 * Le premier test ci-dessous demande ce que le navigateur demande vraiment.
 */

const ORIGINES = listerOrigines('https://admin.kolek.cash,http://localhost:5173');
const ADMIN = 'https://admin.kolek.cash';

describe('en-têtes CORS', () => {
  it('accorde les quatre en-têtes que supabase-js envoie', () => {
    const demandes = 'authorization,x-client-info,apikey,content-type';
    const entetes = entetesCors({ origine: ADMIN, entetesDemandes: demandes, origines: ORIGINES });

    for (const nom of ['authorization', 'x-client-info', 'apikey', 'content-type']) {
      expect(entetes['Access-Control-Allow-Headers']).toContain(nom);
    }
  });

  it('accorde aussi un en-tête que personne n’a encore prévu', () => {
    // La raison d'être du renvoi plutôt que d'une liste figée : le jour où
    // supabase-js ajoute un en-tête, l'application ne doit pas tomber. Autoriser
    // un *nom* d'en-tête n'accorde aucun accès — l'origine et `est_admin()`
    // restent les deux seuls contrôles.
    const entetes = entetesCors({
      origine: ADMIN,
      entetesDemandes: 'authorization, x-supabase-api-version',
      origines: ORIGINES,
    });

    expect(entetes['Access-Control-Allow-Headers']).toContain('x-supabase-api-version');
  });

  it('retombe sur le minimum connu quand le navigateur ne précise rien', () => {
    const entetes = entetesCors({ origine: ADMIN, entetesDemandes: null, origines: ORIGINES });

    expect(entetes['Access-Control-Allow-Headers']).toBe(ENTETES_MINIMAUX);
  });

  it('n’accorde rien à une origine inconnue', () => {
    // Le contrôle qui compte. Sans lui, n'importe quelle page ouverte dans le
    // même navigateur que la session de l'administrateur pourrait appeler la
    // fonction et lire la plateforme entière.
    for (const intruse of [
      'https://admin.kolek.cash.exemple.test',
      'https://exemple.test',
      'http://admin.kolek.cash',
      null,
    ]) {
      const entetes = entetesCors({
        origine: intruse,
        entetesDemandes: 'authorization',
        origines: ORIGINES,
      });
      expect(entetes['Access-Control-Allow-Origin']).toBeUndefined();
    }
  });

  it('renvoie l’origine exacte, jamais un joker', () => {
    const entetes = entetesCors({ origine: ADMIN, origines: ORIGINES });

    expect(entetes['Access-Control-Allow-Origin']).toBe(ADMIN);
    expect(entetes['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('fait varier le cache sur l’origine et sur les en-têtes demandés', () => {
    // Sans `Vary`, un cache intermédiaire servirait à une origine la réponse
    // calculée pour une autre — ce qui reviendrait à autoriser l'origine qu'on
    // vient de refuser.
    const entetes = entetesCors({ origine: ADMIN, origines: ORIGINES });

    expect(entetes.Vary).toContain('Origin');
    expect(entetes.Vary).toContain('Access-Control-Request-Headers');
  });
});

describe('liste des origines', () => {
  it('retient le tableau de bord en ligne par défaut', () => {
    expect(listerOrigines(undefined).has('https://admin.kolek.cash')).toBe(true);
  });

  it('ignore les espaces et les entrées vides', () => {
    const origines = listerOrigines(' https://a.test , , https://b.test ');

    expect(origines.has('https://a.test')).toBe(true);
    expect(origines.has('https://b.test')).toBe(true);
    expect(origines.size).toBe(2);
  });
});

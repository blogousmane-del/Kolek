/**
 * Une requête de données sans réponse est coupée à trente secondes.
 *
 * Sans délai, une requête qui pend — réseau qui accepte la connexion puis se
 * tait — tient la passe du hors-ligne, et avec elle le verrou `kolek-synchro` :
 * plus rien ne part, ni de cet onglet ni d'un autre, tant que le navigateur
 * n'abandonne pas de lui-même. Décision de l'exploitant, 2026-09-14.
 *
 * ## Seulement `/rest/v1/`
 *
 * - Les écritures de données sont rejouables : l'identifiant vient du client,
 *   et un rejeu sort en `DOUBLON` ou se relit (`hors-ligne/envoyer.ts`).
 * - Une Edge Function n'est pas coupée : `encaisserPour` tire un nouvel
 *   identifiant à chaque appel, et couper une réponse lente après l'encaissement
 *   ferait encaisser deux fois au second essai.
 * - L'authentification n'est pas coupée : couper un renouvellement déjà tourné
 *   côté serveur ferait réutiliser l'ancien jeton, et GoTrue révoque alors toutes
 *   les sessions du collecteur.
 *
 * ## Pourquoi `AbortError`
 *
 * `@supabase/postgrest-js` rend un rejet nommé `AbortError` en `status: 0`, sans
 * réessayer. Sous un autre nom, il réessaie les lectures lui-même, et chaque
 * essai attendrait encore trente secondes.
 *
 * ## Jusqu'aux en-têtes
 *
 * Le délai court jusqu'à l'arrivée de la réponse, pas jusqu'à la fin de son
 * corps : une page de tournée lente mais qui avance ne doit pas être coupée à
 * chaque essai. Un corps qui cesse d'arriver en cours de lecture n'est pas
 * couvert.
 */

export const DELAI_REQUETE_MS = 30_000;

function estDonnees(entree: RequestInfo | URL): boolean {
  try {
    const adresse = entree instanceof Request ? entree.url : String(entree);
    return new URL(adresse).pathname.startsWith('/rest/v1/');
  } catch {
    return false;
  }
}

export function avecDelai(
  fetchBase: typeof fetch = (entree, init) => fetch(entree, init),
  delaiMs: number = DELAI_REQUETE_MS,
): typeof fetch {
  return async (entree, init) => {
    if (!estDonnees(entree)) return fetchBase(entree, init);

    const controleur = new AbortController();
    const signalAppelant = init?.signal ?? (entree instanceof Request ? entree.signal : undefined);
    const relayer = () => controleur.abort(signalAppelant?.reason);
    if (signalAppelant?.aborted) relayer();
    else signalAppelant?.addEventListener('abort', relayer, { once: true });

    const minuteur = setTimeout(
      () => controleur.abort(new DOMException('Délai de réponse dépassé', 'AbortError')),
      delaiMs,
    );
    try {
      return await fetchBase(entree, { ...init, signal: controleur.signal });
    } finally {
      clearTimeout(minuteur);
    }
  };
}

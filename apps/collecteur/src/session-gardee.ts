/**
 * La session que supabase-js garde sur le disque, lue sans réseau.
 *
 * ## Pourquoi on la lit soi-même
 *
 * Le jeton d'accès dure une heure. Passé ce délai, `getSession()` tente de le
 * renouveler ; sans réseau, le renouvellement échoue, et `getSession()` rend
 * `session: null` avec une `AuthRetryableFetchError` — alors que la session,
 * elle, reste intacte sur le disque (constaté dans `@supabase/auth-js` 2.112.3,
 * `GoTrueClient.__loadSession`). L'application renvoyait donc à l'écran de
 * connexion un collecteur qui n'avait rien perdu, au milieu du marché, sans
 * réseau pour se reconnecter. Plan J2b, précision 1.
 *
 * On n'en tire que l'identifiant du collecteur, pour ouvrir **sa** base locale.
 * Aucun jeton n'est utilisé d'ici : tout envoi repasse par supabase-js, qui
 * renouvelle la session au retour du réseau — ou la déclare finie.
 */

/** La formule de `SupabaseClient` (`@supabase/supabase-js`, `dist/index.mjs:635`). */
export function cleSessionPour(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

export function lireSessionGardee(
  stockage: Pick<Storage, 'getItem'>,
  cle: string,
): { userId: string } | null {
  try {
    const brut = stockage.getItem(cle);
    if (!brut) return null;
    const session = JSON.parse(brut) as {
      refresh_token?: unknown;
      user?: { id?: unknown } | null;
    } | null;
    // Sans jeton de renouvellement, la session ne pourra jamais reprendre :
    // ouvrir la tournée montrerait une file qui ne partira pas sous ce compte.
    if (!session || typeof session.refresh_token !== 'string') return null;
    const id = session.user?.id;
    return typeof id === 'string' && id !== '' ? { userId: id } : null;
  } catch {
    return null;
  }
}

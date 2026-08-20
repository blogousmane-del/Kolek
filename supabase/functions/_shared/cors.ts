/**
 * En-têtes CORS des Edge Functions.
 *
 * Module à part, et sans aucune API Deno, pour une raison : le défaut corrigé
 * ici n'était visible que depuis un navigateur, et n'aurait jamais été trouvé
 * par une sonde en ligne de commande. Le sortir de `index.ts` le rend testable
 * par la suite de tests du dépôt.
 *
 * ## Le défaut, constaté en production le 2026-08-20
 *
 * Le tableau de bord affichait « Failed to send a request to the Edge
 * Function ». Ni la fonction ni le réseau n'étaient en cause : le navigateur
 * refusait d'envoyer la requête.
 *
 * La liste des en-têtes autorisés était écrite en dur, `authorization,
 * content-type`. Or `supabase-js` en envoie deux autres à chaque appel,
 * `x-client-info` et `apikey`. La requête préalable demandait donc quatre
 * en-têtes pour deux accordés, et le navigateur bloquait tout — `fetch` rejette,
 * sans qu'aucune requête n'atteigne jamais le serveur.
 *
 * La sonde `curl` qui « validait » le préalable ne demandait que les deux
 * en-têtes déjà listés. Elle confirmait ma liste au lieu de la mettre à
 * l'épreuve. C'est la leçon du correctif, plus que la ligne de code.
 *
 * ## Pourquoi renvoyer les en-têtes demandés
 *
 * Plutôt qu'une liste figée, on renvoie ce que le navigateur demande. Ce n'est
 * pas un relâchement : **autoriser un nom d'en-tête n'accorde aucun accès.** Le
 * contrôle tient à deux choses, et aucune ne dépend de cette liste — l'origine
 * doit figurer dans la liste blanche ci-dessous, et la fonction vérifie
 * `est_admin()` sous l'identité de l'appelant avant de rendre la moindre donnée.
 *
 * Figer la liste, en revanche, casse l'application au prochain en-tête que
 * `supabase-js` ajoutera. C'est exactement ce qui vient de se produire.
 */

/** Ce que `supabase-js` envoie aujourd'hui. Sert de repli quand le navigateur
    ne précise rien, et documente le minimum attendu. */
export const ENTETES_MINIMAUX = 'authorization, x-client-info, apikey, content-type';

export interface OptionsCors {
  /** L'en-tête `Origin` de la requête, ou `null`. */
  origine: string | null;
  /** L'en-tête `Access-Control-Request-Headers` du préalable, ou `null`. */
  entetesDemandes?: string | null;
  /** Les origines autorisées à appeler la fonction. */
  origines: ReadonlySet<string>;
}

export function entetesCors({
  origine,
  entetesDemandes,
  origines,
}: OptionsCors): Record<string, string> {
  const entetes: Record<string, string> = {
    'Content-Type': 'application/json',
    // Sans `Vary: Origin`, un cache intermédiaire servirait à une origine la
    // réponse calculée pour une autre.
    Vary: 'Origin, Access-Control-Request-Headers',
  };

  // Pas de joker : l'écran d'administration a une origine connue, et la lister
  // coûte une ligne. `*` ouvrirait la fonction à n'importe quelle page ouverte
  // dans le même navigateur que la session de l'administrateur.
  if (!origine || !origines.has(origine)) return entetes;

  entetes['Access-Control-Allow-Origin'] = origine;
  entetes['Access-Control-Allow-Headers'] = entetesDemandes?.trim() || ENTETES_MINIMAUX;
  entetes['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  entetes['Access-Control-Max-Age'] = '86400';

  return entetes;
}

/** Découpe la variable d'environnement des origines autorisées. */
/**
 * Les replis, quand la variable d'environnement n'est pas posée.
 *
 * Chaque fonction reçoit **le sien**. Une liste commune aux deux applications
 * laisserait le navigateur du collecteur appeler la fonction d'administration :
 * le portillon `est_admin()` la refuserait, mais autant que la requête ne parte
 * pas. Le port 5173 est celui de Vite en développement.
 *
 * Déclarés **avant** `listerOrigines` : ils servent de valeur par défaut à son
 * paramètre, et une constante lue avant son initialisation lèverait une erreur
 * de zone morte temporelle si l'ordre venait à compter un jour.
 */
export const ORIGINES_ADMIN = 'https://kolek-admin.netlify.app,http://localhost:5173';
export const ORIGINES_COLLECTEUR = 'https://kolek-collecteur.netlify.app,http://localhost:5173';

export function listerOrigines(
  brut: string | undefined | null,
  defaut = ORIGINES_ADMIN,
): ReadonlySet<string> {
  return new Set(
    (brut ?? defaut)
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

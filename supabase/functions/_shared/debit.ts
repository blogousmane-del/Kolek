/**
 * L'empreinte d'un appelant public.
 *
 * Module sans aucune API Deno — même raison que `cors.ts` et
 * `valider-demande.ts` : le seul endroit où l'erreur serait silencieuse est
 * ici. Une empreinte trop large borne tout le monde ensemble ; une empreinte
 * trop fine ne borne personne. Dans les deux cas la fonction répond
 * normalement, et personne ne s'aperçoit de rien.
 *
 * ## L'adresse vient des en-têtes, pas de `Deno.serve`
 *
 * `info.remoteAddr` désigne le relais de la plateforme, identique pour tous les
 * appelants. La seule adresse utile est celle que le relais a écrite dans
 * `x-forwarded-for`, dont **le premier saut** est le client ; les suivants sont
 * les relais traversés et changent avec le chemin réseau.
 *
 * ## Sans adresse, on serre plutôt que d'ouvrir
 *
 * Une requête sans aucun en-tête d'adresse retombe sur une clé unique et
 * partagée. Elle est donc bornée avec les autres requêtes sans adresse —
 * strictement. L'inverse offrirait un contournement en une ligne : retirer
 * l'en-tête.
 */

/** Reprise du `check` de `public.debit_public.empreinte`. */
export const EMPREINTE_MAX = 200;

export function empreinteRequete(route: string, entetes: Headers): string {
  const transmise = entetes.get('x-forwarded-for')?.split(',')[0]?.trim();
  const cloudflare = entetes.get('cf-connecting-ip')?.trim();
  const adresse = transmise || cloudflare || 'inconnue';

  return `${route}:${adresse}`.slice(0, EMPREINTE_MAX);
}

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

/**
 * L'empreinte sous laquelle `chariow-webhook` compte les Pulses : **par vente**.
 *
 * La signature de Chariow ne porte ni horodatage ni nonce — un Pulse capturé se
 * rejoue tel quel, et chaque rejeu fait lire une vente chez Chariow sur notre
 * quota. Un rejeu vise **toujours la même vente** : on ne signe que ce qu’on a
 * capturé. Une vague de paiements légitimes, elle, touche **beaucoup** de
 * ventes. Compter par vente borne le premier sans jamais toucher la seconde ;
 * une borne globale aurait fait l'inverse.
 *
 * La vente d’abord, parce que c’est elle que le rejeu ne peut pas changer ; à
 * défaut le collecteur, puis la demande. Le genre est écrit par nous, avant
 * l’identifiant : un identifiant qui contiendrait « collecteur: » reste rangé
 * sous « vente: ». Voir `Docs/plans/2026-09-11-webhook-chariow-borne.md`.
 */
export function empreintePulse(cible: {
  vente: string | null;
  collecteur: string | null;
  demande: string | null;
}): string {
  if (cible.vente) return `chariow-webhook:vente:${cible.vente}`.slice(0, EMPREINTE_MAX);
  if (cible.collecteur) {
    return `chariow-webhook:collecteur:${cible.collecteur}`.slice(0, EMPREINTE_MAX);
  }
  if (cible.demande) return `chariow-webhook:demande:${cible.demande}`.slice(0, EMPREINTE_MAX);
  return 'chariow-webhook:sans-cible';
}

/** Vingt Pulses par heure et par vente. Chariow en émet trois au plus pour une
    vente réglée (`successful`, `settled`, `completed`), plus ses réessais sur
    nos 500 : six fois de marge. Mesuré le 2026-09-11 en production — six
    paiements, six ventes, sur sept jours. */
export const PULSE_PLAFOND = 20;
export const PULSE_FENETRE_SECONDES = 3600;

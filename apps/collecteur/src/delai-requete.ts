/**
 * Une requête de données sans réponse est coupée à trente secondes.
 *
 * Sans délai, une requête qui pend — réseau qui accepte la connexion puis se
 * tait — tient la passe du hors-ligne, et avec elle le verrou `kolek-synchro` :
 * plus rien ne part, ni de cet onglet ni d'un autre, tant que le navigateur
 * n'abandonne pas de lui-même. Décision de l'exploitant, 2026-09-14.
 *
 * ## Par l'option `db.timeout` de supabase-js
 *
 * Elle n'enveloppe que le client de données (`from`, `rpc`) : la portée tient à
 * sa construction, sans lire d'adresse. Elle annule par `AbortController`, donc
 * sous le nom `AbortError`, que `@supabase/postgrest-js` rend en `status: 0`
 * sans réessayer — sous un autre nom, il réessaierait les lectures lui-même.
 *
 * - Les écritures de la file sont rejouables : l'identifiant vient du client, et
 *   un rejeu sort en `DOUBLON` ou se relit (`hors-ligne/envoyer.ts`).
 * - Une Edge Function n'est pas coupée : `encaisserPour` tire un nouvel
 *   identifiant à chaque appel, et couper une réponse lente après l'encaissement
 *   ferait encaisser deux fois au second essai.
 * - L'authentification n'est pas coupée : couper un renouvellement déjà tourné
 *   côté serveur ferait réutiliser l'ancien jeton, et GoTrue révoque alors toutes
 *   les sessions du collecteur. La passe cesse seulement de l'attendre
 *   (`verifierSession`).
 *
 * ## Ce que le délai ne couvre pas
 *
 * - Le corps de la réponse : le délai court jusqu'à son arrivée, pas jusqu'à la
 *   fin de sa lecture. Une page de tournée lente mais qui avance ne doit pas être
 *   coupée à chaque essai.
 * - L'attente du jeton : supabase-js lit la session avant d'appeler `fetch`, et
 *   une session qui pend fait pendre la requête avec elle. `verifierSession` la
 *   borne, et la renouvelle avant qu'elle n'expire au milieu d'une passe.
 */

export const DELAI_REQUETE_MS = 30_000;

/** Les réglages de données du client (`db` de `createClient`). */
export const OPTIONS_DONNEES = { timeout: DELAI_REQUETE_MS };

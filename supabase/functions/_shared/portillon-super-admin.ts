import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_ADMIN, entetesCors, listerOrigines } from './cors.ts';

/**
 * Le portillon des routes Super Admin.
 *
 * ## Ce n'est pas celui du Dashboard
 *
 * Les sept fonctions `admin-*` demandent `est_admin()`. Celles-ci demandent
 * `est_super_admin()`, et la différence est tout l'objet du second niveau : un
 * administrateur métier — celui qui encaisse et suit les tournées — a un compte
 * parfaitement légitime et n'a rien à faire ici.
 *
 * Comme les sept autres, le contrôle se fait **avec le jeton de l'appelant**,
 * jamais avec la clé de service, et toute réponse autre qu'un `true` franc
 * referme la porte. Un portillon qui s'ouvre quand il ne sait pas n'est pas un
 * portillon.
 *
 * ## La clé de service porte le nom de l'appelant
 *
 * Passé le contrôle, le client de service sort avec l'en-tête
 * `x-kolek-acteur`. C'est lui que `acteur_courant()` lit pour écrire, dans
 * `audit_log`, qui a agi plutôt que sur qui.
 *
 * Sans lui, `super_admin_definir_niveau()` refuse : un changement de privilège
 * sans auteur enregistré n'a pas lieu d'aboutir. Le poser ici, en un seul
 * endroit, évite qu'une route future l'oublie et découvre le refus en
 * production.
 *
 * La base ne croit cet en-tête que sous `service_role` — un collecteur
 * authentifié qui l'enverrait serait ignoré.
 */

const ORIGINES_AUTORISEES = listerOrigines(Deno.env.get('ORIGINES_ADMIN'), ORIGINES_ADMIN);

export function entetesPour(requete: Request): Record<string, string> {
  return entetesCors({
    origine: requete.headers.get('Origin'),
    entetesDemandes: requete.headers.get('Access-Control-Request-Headers'),
    origines: ORIGINES_AUTORISEES,
  });
}

export function reponse(corps: unknown, statut: number, requete: Request): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesPour(requete) });
}

export interface Ouverture {
  /** L'identifiant du super admin qui appelle, déjà posé sur le client de service. */
  appelant: string;
  service: SupabaseClient;
}

/** Rend une `Response` quand la porte reste fermée, l'ouverture sinon. */
export async function ouvrir(requete: Request): Promise<Ouverture | Response> {
  const autorisation = requete.headers.get('Authorization');
  if (!autorisation?.startsWith('Bearer ')) {
    return reponse({ erreur: 'JETON_ABSENT' }, 401, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleAnon || !cleService) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await clientAppelant.rpc('est_super_admin');
    if (error || data !== true) {
      if (error) console.error('est_super_admin a échoué :', error.message);
      return reponse({ erreur: error ? 'VERIFICATION_IMPOSSIBLE' : 'ACCES_RESERVE' }, 403, requete);
    }
  } catch (cause) {
    console.error('est_super_admin a levé :', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
  }

  // Le portillon a dit oui, donc le jeton porte un compte. S'il n'en portait
  // pas, l'imputation serait vide et la base refuserait plus loin : autant
  // fermer ici, où la raison est encore lisible.
  const { data: utilisateur } = await clientAppelant.auth.getUser();
  const appelant = utilisateur.user?.id;
  if (!appelant) {
    return reponse({ erreur: 'APPELANT_INCONNU' }, 403, requete);
  }

  // --- Passé ce point seulement, la clé de service sort ---

  const service = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-kolek-acteur': appelant } },
  });

  return { appelant, service };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant mal formé doit se voir en 400 : passé à la base, il ferait
    lever une conversion et sortirait en 500, ce qui ressemble à une panne. */
export function estUuid(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && UUID.test(valeur);
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Même raison que pour `estUuid`, et un vrai constat d'audit derrière.
 *
 * Une date invalide passée telle quelle à la base lève un `22007`, qu'aucune
 * branche d'erreur métier n'attrape : elle ressortait en 500. Une faute de
 * frappe dans un formulaire n'est pas une panne du serveur.
 *
 * Le motif ne suffit pas — `2026-02-31` a la bonne forme et n'existe pas —
 * d'où le second contrôle sur la valeur elle-même.
 */
export function estDateIso(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || !DATE_ISO.test(valeur)) return false;
  const date = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(valeur);
}

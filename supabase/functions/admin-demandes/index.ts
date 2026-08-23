import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_ADMIN, entetesCors, listerOrigines } from '../_shared/cors.ts';

/**
 * Les demandes d'ouverture, pour l'administration.
 *
 * `GET` les liste, `POST` en marque une traitée. Même portillon que les cinq
 * autres fonctions d'administration : `est_admin()` appelée **avec le jeton de
 * l'appelant**, jamais avec la clé de service, et toute réponse autre qu'un
 * `true` franc referme la porte.
 *
 * Ce que garde ce portillon : des noms et des numéros de téléphone de
 * commerçants d'Abidjan qui ont manifesté un intérêt commercial. Une liste de
 * prospects est exactement ce qu'un concurrent voudrait, et ces gens n'ont
 * accepté de la confier qu'à GTCS.
 */

const ORIGINES_AUTORISEES = listerOrigines(Deno.env.get('ORIGINES_ADMIN'), ORIGINES_ADMIN);

const STATUTS = new Set(['contactee', 'ouverte', 'refusee']);

function entetesPour(requete: Request): Record<string, string> {
  return entetesCors({
    origine: requete.headers.get('Origin'),
    entetesDemandes: requete.headers.get('Access-Control-Request-Headers'),
    origines: ORIGINES_AUTORISEES,
  });
}

function reponse(corps: unknown, statut: number, requete: Request): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesPour(requete) });
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'GET' && requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

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

  const { data: utilisateur } = await clientAppelant.auth.getUser();

  try {
    const { data, error } = await clientAppelant.rpc('est_admin');
    if (error || data !== true) {
      if (error) console.error('est_admin a échoué :', error.message);
      return reponse({ erreur: error ? 'VERIFICATION_IMPOSSIBLE' : 'ACCES_RESERVE' }, 403, requete);
    }
  } catch (cause) {
    console.error('est_admin a levé :', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
  }

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (requete.method === 'GET') {
    const { data, error } = await clientService.rpc('admin_demandes');
    if (error) {
      console.error('admin_demandes a échoué :', error.message);
      return reponse({ erreur: 'LECTURE_IMPOSSIBLE' }, 500, requete);
    }
    return reponse({ demandes: data ?? [] }, 200, requete);
  }

  let corps: { id?: unknown; statut?: unknown };
  try {
    corps = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const id = typeof corps.id === 'string' ? corps.id : '';
  const statut = typeof corps.statut === 'string' ? corps.statut : '';

  if (!id) return reponse({ erreur: 'DEMANDE_ABSENTE' }, 400, requete);
  if (!STATUTS.has(statut)) return reponse({ erreur: 'STATUT_INVALIDE' }, 400, requete);

  // L'identité du traitant vient du jeton vérifié plus haut, jamais du corps de
  // la requête. Un administrateur ne doit pas pouvoir signer au nom d'un autre.
  const administrateur = utilisateur.user?.id ?? null;
  if (!administrateur) {
    return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
  }

  const { data, error } = await clientService.rpc('admin_traiter_demande', {
    demande_id: id,
    nouveau_statut: statut,
    administrateur,
  });

  if (error) {
    if (/DEMANDE_INTROUVABLE/.test(error.message)) {
      return reponse({ erreur: 'DEMANDE_INTROUVABLE' }, 404, requete);
    }
    if (/STATUT_INVALIDE/.test(error.message)) {
      return reponse({ erreur: 'STATUT_INVALIDE' }, 400, requete);
    }
    console.error('admin_traiter_demande a échoué :', error.message);
    return reponse({ erreur: 'MISE_A_JOUR_IMPOSSIBLE' }, 500, requete);
  }

  return reponse(data, 200, requete);
});

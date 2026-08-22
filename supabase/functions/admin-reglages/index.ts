import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_ADMIN, entetesCors, listerOrigines } from '../_shared/cors.ts';

/**
 * L'état de la plateforme, pour l'écran Réglages.
 *
 * Même portillon que les quatre autres fonctions d'administration : `est_admin()`
 * appelée **avec le jeton de l'appelant**, jamais avec la clé de service, et
 * toute réponse autre qu'un `true` franc referme la porte.
 *
 * ## Ce que cette fonction ne rendra jamais
 *
 * Un écran de réglages est l'endroit où l'on est le plus tenté d'afficher une
 * clé « pour la copier ». La clé de service n'en sortira pas, et ce n'est pas
 * une précaution de circonstance : elle contourne RLS sur **toutes** les tables.
 * Un navigateur qui la reçoit la met en mémoire, l'expose à toute extension
 * installée, et la laisse dans l'historique de tout mandataire traversé.
 *
 * La clé anonyme, elle, est publique par construction — elle voyage déjà dans le
 * paquet JavaScript de chaque application. L'écran peut donc l'afficher sans
 * rien concéder, et c'est ce qu'il fait : elle sert aux intégrations.
 */

const ORIGINES_AUTORISEES = listerOrigines(Deno.env.get('ORIGINES_ADMIN'), ORIGINES_ADMIN);

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

  const { data: brut, error } = await clientService.rpc('admin_reglages');

  if (error || !brut) {
    console.error('admin_reglages a échoué :', error?.message);
    return reponse({ erreur: 'AGREGATION_IMPOSSIBLE' }, 500, requete);
  }

  // La charge est transmise entière plutôt qu'énumérée clé par clé. Le
  // 2026-08-20, `admin-vue-globale` recomposait sa réponse à la main et avait
  // laissé tomber deux clés en route : deux écrans lisaient `undefined.length`.
  // Étaler l'objet supprime la classe entière de ce défaut.
  return reponse(
    {
      ...brut,
      genereLe: brut.genere_le,
      // L'appelant, pour que l'écran puisse marquer « c'est toi » dans la liste
      // des administrateurs sans avoir à redemander la session.
      appelant: utilisateur.user?.id ?? null,
    },
    200,
    requete,
  );
});

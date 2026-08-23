import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_ADMIN, entetesCors, listerOrigines } from '../_shared/cors.ts';

/**
 * Les avis aux clients, côté administration.
 *
 * `GET` rend l'état par collecteur ; `POST` fixe la politique de l'un d'eux.
 * Même portillon que les six autres fonctions d'administration : `est_admin()`
 * appelée **avec le jeton de l'appelant**, jamais avec la clé de service, et
 * toute réponse autre qu'un `true` franc referme la porte.
 *
 * ## Ce que garde ce portillon
 *
 * Un bouton qui dépense de l'argent réel. Ouvrir le canal d'un collecteur à
 * 150 clients engage environ 78 000 FCFA de messages par mois — seize fois son
 * abonnement. C'est la seule commande du produit dont un mauvais clic se
 * traduit directement en facture opérateur, d'où le plafond côté base et la
 * validation des trois valeurs ici.
 */

const ORIGINES_AUTORISEES = listerOrigines(Deno.env.get('ORIGINES_ADMIN'), ORIGINES_ADMIN);

const CANAUX = new Set(['aucun', 'sms', 'whatsapp']);
/** Même borne que `admin_avis_definir` : un garde-fou de frappe, pas de méfiance. */
const QUOTA_MAX = 50_000;

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
    const { data, error } = await clientService.rpc('admin_avis');
    if (error) {
      console.error('admin_avis a échoué :', error.message);
      return reponse({ erreur: 'LECTURE_IMPOSSIBLE' }, 500, requete);
    }
    return reponse(data ?? {}, 200, requete);
  }

  let corps: Record<string, unknown>;
  try {
    corps = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const collecteur = typeof corps.collecteur === 'string' ? corps.collecteur : '';
  const canal = typeof corps.canal === 'string' ? corps.canal : '';
  // `=== true` et non une coercition : un `"false"` venu d'un formulaire mal
  // sérialisé est vrai en JavaScript, et allumerait l'avis par mise — la ligne
  // la plus chère du dispositif.
  const mise = corps.sur_mise === true;
  const retrait = corps.sur_retrait === true;
  const ouverture = corps.sur_ouverture === true;
  const quota = typeof corps.quota_mensuel === 'number' ? corps.quota_mensuel : Number.NaN;

  if (!collecteur) return reponse({ erreur: 'COLLECTEUR_ABSENT' }, 400, requete);
  if (!CANAUX.has(canal)) return reponse({ erreur: 'CANAL_INVALIDE' }, 400, requete);
  if (!Number.isInteger(quota) || quota < 0 || quota > QUOTA_MAX) {
    return reponse({ erreur: 'QUOTA_INVALIDE' }, 400, requete);
  }

  const { data, error } = await clientService.rpc('admin_avis_definir', {
    collecteur,
    nouveau_canal: canal,
    mise,
    retrait,
    ouverture,
    quota,
  });

  if (error) {
    for (const code of ['COLLECTEUR_INTROUVABLE', 'CANAL_INVALIDE', 'QUOTA_INVALIDE']) {
      if (error.message.includes(code)) {
        return reponse({ erreur: code }, code === 'COLLECTEUR_INTROUVABLE' ? 404 : 400, requete);
      }
    }
    console.error('admin_avis_definir a échoué :', error.message);
    return reponse({ erreur: 'MISE_A_JOUR_IMPOSSIBLE' }, 500, requete);
  }

  return reponse(data, 200, requete);
});

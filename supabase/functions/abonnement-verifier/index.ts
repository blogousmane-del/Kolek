import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { chargerPaiementsRattrapables, creerDepot } from '../_shared/depot-chariow.ts';
import { reconcilier } from '../_shared/reconciliation.ts';

/**
 * Réconcilier les paiements du collecteur appelant.
 *
 * Deux appelants, un seul code : l'écran de retour qui sonde après un paiement,
 * et l'ouverture de l'application. C'est ce second usage qui remplace un cron —
 * le carnet est l'outil de travail du collecteur, il le rouvre le lendemain
 * matin, et un paiement resté en attente se rattrape alors tout seul.
 *
 * ## L'identité vient du jeton, jamais du corps
 *
 * La fonction ne prend aucun paramètre. Un `collecteurId` reçu du téléphone
 * serait un contrôle d'accès délégué au client : il suffirait de poster
 * l'identifiant d'un autre pour lire ses paiements, et pire, pour créditer son
 * abonnement.
 *
 * ## Cette route n'ouvre aucun compte
 *
 * `chargerPaiementsRattrapables` filtre sur `collecteur_id` : tout ce qu'elle
 * rend porte donc déjà un compte, et la branche d'ouverture de `reconcilier`
 * est inatteignable d'ici. `creerDepot` est appelée sans stratégie d'ouverture,
 * donc avec celle qui refuse — un paiement de prospect qui arriverait quand
 * même ici serait journalisé et **non crédité**, plutôt que de faire naître un
 * compte sur un chemin que personne n'a relu pour ça. C'est le webhook, et lui
 * seul, qui sert les prospects.
 *
 * ## Pourquoi la clé de service sort si tard
 *
 * Méthode, jeton, identité : tout ce qui peut refuser refuse avant. La clé
 * n'apparaît qu'une fois qu'on sait au nom de qui on travaille.
 *
 * La configuration du fournisseur se lit **après** l'identité, contrairement au
 * patron des autres routes. Un inconnu n'a pas à apprendre, par la seule
 * différence entre un 403 et un 500, si le paiement est configuré chez nous —
 * et ce placement rend le portillon mesurable là où `CHARIOW_CLE_API` n'existe
 * pas, ce qui est le cas de toute base locale et du CI.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

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
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const autorisation = requete.headers.get('Authorization');
  if (!autorisation?.startsWith('Bearer ')) {
    return reponse({ erreur: 'JETON_ABSENT' }, 401, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !cleAnon) {
    console.error('Configuration de plateforme incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- Identité, sous le jeton de l'appelant ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }

  // --- Passé ce point seulement, la configuration du fournisseur ---
  //
  // Après l'identité, et non avant : un inconnu n'a pas à apprendre, par la
  // différence entre 403 et 500, si le paiement est configuré chez nous. Seul
  // ce qui est nécessaire pour *demander qui appelle* se lit plus haut.
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cleApi = Deno.env.get('CHARIOW_CLE_API');
  const racine = Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1';

  if (!cleService || !cleApi) {
    console.error('Configuration incomplète : CHARIOW_CLE_API est-elle posée ?');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const paiements = await chargerPaiementsRattrapables(clientService, { collecteur: utilisateur.user.id });
    const resultat = await reconcilier(paiements, creerDepot(clientService, { racine, cleApi }));
    return reponse(resultat, 200, requete);
  } catch (cause) {
    console.error('[Abonnement] réconciliation :', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'RECONCILIATION_IMPOSSIBLE' }, 500, requete);
  }
});

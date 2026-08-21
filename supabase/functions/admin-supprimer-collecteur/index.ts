import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_ADMIN, entetesCors, listerOrigines } from '../_shared/cors.ts';

/**
 * Supprimer un compte collecteur.
 *
 * ## Pourquoi cette fonction existe
 *
 * L'audit du 2026-08-20 a laissé un 🔴 qu'aucun outil du dépôt ne pouvait
 * refermer : un compte de sonde, portant un mot de passe de fuite publique,
 * vivant en production. Le supprimer exige d'écrire dans le schéma `auth`, donc
 * la clé de service — et le seul geste disponible était d'aller cliquer dans le
 * tableau de bord Supabase.
 *
 * Renvoyer l'exploitant chez l'éditeur pour réparer un dégât causé ici est un
 * mauvais produit. Et le besoin reviendra : tout compte créé pour un essai devra
 * être retiré un jour.
 *
 * ## La garantie que cette fonction ne contourne pas
 *
 * `mises.collecteur_id` et `mises.carte_id` sont en `on delete restrict`, et
 * c'est délibéré : *« on ne fait pas disparaître de l'argent encaissé en
 * supprimant un compte »*, dit la migration du socle. La cascade depuis
 * `auth.users` s'arrête donc net dès qu'une mise existe.
 *
 * La fonction **ne force rien**. Elle compte d'abord, refuse en nommant ce qui
 * bloque, et ne supprime que ce que la base accepterait de toute façon. Son
 * apport n'est pas de passer outre : c'est de dire pourquoi, au lieu de laisser
 * remonter une violation de clé étrangère que personne ne sait lire.
 *
 * ## Contrôle d'accès
 *
 * Identique aux deux autres fonctions d'administration : `est_admin()` appelée
 * **avec le jeton de l'appelant**, jamais avec la clé de service. La portée du
 * dégât est ici la plus haute des trois — une suppression ne se défait pas — mais
 * le portillon reste le même, parce qu'il est déjà le bon.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleAnon || !cleService) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- Portillon, sous l'identité de l'appelant ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: appelant } = await clientAppelant.auth.getUser();

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

  let saisie: { collecteurId?: unknown };
  try {
    saisie = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const collecteurId = typeof saisie.collecteurId === 'string' ? saisie.collecteurId : '';
  if (!UUID.test(collecteurId)) {
    return reponse({ erreur: 'COLLECTEUR_INTROUVABLE' }, 404, requete);
  }

  // Un administrateur est aussi une ligne `collecteurs` : le déclencheur
  // d'inscription en crée une pour tout compte. Se supprimer soi-même fermerait
  // la porte de l'extérieur, sans moyen de rentrer.
  if (appelant.user?.id === collecteurId) {
    return reponse({ erreur: 'SUPPRESSION_DE_SOI' }, 400, requete);
  }

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: cible, error: erreurLecture } = await clientService
    .from('collecteurs')
    .select('id, nom')
    .eq('id', collecteurId)
    .maybeSingle();

  if (erreurLecture) {
    console.error('lecture collecteur :', erreurLecture.message);
    return reponse({ erreur: 'SUPPRESSION_IMPOSSIBLE' }, 500, requete);
  }
  if (!cible) return reponse({ erreur: 'COLLECTEUR_INTROUVABLE' }, 404, requete);

  // Un administrateur ne se supprime pas par ce chemin. La table `admins` est la
  // seule source de ce droit ; y toucher depuis un écran ferait du retrait d'un
  // pair une opération à un clic.
  const { count: estAdmin } = await clientService
    .from('admins')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', collecteurId);

  if ((estAdmin ?? 0) > 0) {
    return reponse({ erreur: 'CIBLE_ADMINISTRATEUR' }, 403, requete);
  }

  // --- Le compte a-t-il touché de l'argent ? ---
  //
  // On compte avant de tenter. La base refuserait de toute façon — `on delete
  // restrict` sur `mises` et `retraits` — mais elle refuserait par une violation
  // de clé étrangère, illisible pour qui l'affiche.

  const [{ count: mises }, { count: retraits }, { count: clients }] = await Promise.all([
    clientService
      .from('mises')
      .select('id', { count: 'exact', head: true })
      .eq('collecteur_id', collecteurId),
    clientService
      .from('retraits')
      .select('id', { count: 'exact', head: true })
      .eq('collecteur_id', collecteurId),
    clientService
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('collecteur_id', collecteurId),
  ]);

  if ((mises ?? 0) > 0 || (retraits ?? 0) > 0) {
    return reponse(
      {
        erreur: 'COMPTE_A_ENCAISSE',
        mises: mises ?? 0,
        retraits: retraits ?? 0,
      },
      409,
      requete,
    );
  }

  // `auth.users` est la racine : la cascade emporte `collecteurs`, puis `clients`
  // et `cartes`. Aucune de ces lignes ne porte d'argent, on vient de le vérifier.
  const { error: erreurSuppression } = await clientService.auth.admin.deleteUser(collecteurId);

  if (erreurSuppression) {
    console.error('deleteUser a échoué :', erreurSuppression.message);
    return reponse({ erreur: 'SUPPRESSION_IMPOSSIBLE' }, 500, requete);
  }

  return reponse(
    { nom: cible.nom, clientsSupprimes: clients ?? 0 },
    200,
    requete,
  );
});

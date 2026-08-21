import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_ADMIN, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { BORNES } from '../_shared/valider-collecteur.ts';
import { tarifParCle } from '../_shared/paliers.ts';

/**
 * Modifier la fiche d'un collecteur : coordonnées, zone, palier, abonnement.
 *
 * ## Pourquoi cette fonction existe
 *
 * Deux messages de l'administration promettaient déjà ce geste sans qu'aucun
 * écran ne le rende possible :
 *
 * - `COMPLEMENT_INCOMPLET` dit « corrige-les depuis sa fiche » quand la zone et
 *   le palier n'ont pas pu être posés à la création.
 * - Le refus de supprimer un compte qui a encaissé dit « suspends son abonnement
 *   à la place ».
 *
 * Un message qui renvoie vers un écran inexistant est pire qu'un message
 * générique : il fait chercher.
 *
 * ## Pourquoi ce n'est pas un simple `update` depuis le navigateur
 *
 * La politique RLS de `collecteurs` borne chacun à **sa propre ligne**,
 * administrateur compris — c'est ce qui garantit qu'un compte compromis ne lit
 * pas tout le portefeuille. Un administrateur ne peut donc pas écrire la ligne
 * d'un autre depuis le navigateur, et il ne faut surtout pas ouvrir cette porte
 * pour un besoin de saisie.
 *
 * ## Ce que la fonction refuse d'écrire
 *
 * `abonnement_echeance` n'est pas modifiable ici. Repousser une échéance revient
 * à offrir du service, et ce geste appartient à la facturation, pas à un écran
 * de correction de fiche. Le laisser passer ferait de la date d'échéance une
 * valeur d'opinion.
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
const STATUTS = ['actif', 'suspendu', 'expire'];

function texte(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
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

  let saisie: Record<string, unknown>;
  try {
    saisie = (await requete.json()) as Record<string, unknown>;
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const collecteurId = typeof saisie.collecteurId === 'string' ? saisie.collecteurId : '';
  if (!UUID.test(collecteurId)) {
    return reponse({ erreur: 'COLLECTEUR_INTROUVABLE' }, 404, requete);
  }

  // On ne construit que les champs réellement fournis : un `update` qui poserait
  // `zone: null` parce que l'écran n'a pas envoyé la clé effacerait une donnée
  // que personne n'a demandé à effacer.
  const modifications: Record<string, string> = {};

  const nom = texte(saisie.nom);
  if (nom !== undefined) {
    if (!nom) return reponse({ erreur: 'NOM_REQUIS' }, 400, requete);
    if (nom.length > BORNES.nom) return reponse({ erreur: 'NOM_TROP_LONG' }, 400, requete);
    modifications.nom = nom;
  }

  const telephone = texte(saisie.telephone);
  if (telephone !== undefined) {
    if (!telephone) return reponse({ erreur: 'TELEPHONE_REQUIS' }, 400, requete);
    if (telephone.length > BORNES.telephone) {
      return reponse({ erreur: 'TELEPHONE_TROP_LONG' }, 400, requete);
    }
    modifications.telephone = telephone;
  }

  const zone = texte(saisie.zone);
  if (zone !== undefined) {
    if (zone.length > BORNES.zone) return reponse({ erreur: 'ZONE_TROP_LONGUE' }, 400, requete);
    modifications.zone = zone;
  }

  const palier = texte(saisie.palier);
  if (palier !== undefined) {
    try {
      tarifParCle(palier);
    } catch {
      return reponse({ erreur: 'PALIER_INCONNU' }, 400, requete);
    }
    modifications.palier = palier;
  }

  const statut = texte(saisie.abonnementStatut);
  if (statut !== undefined) {
    if (!STATUTS.includes(statut)) return reponse({ erreur: 'STATUT_INCONNU' }, 400, requete);
    modifications.abonnement_statut = statut;
  }

  if (Object.keys(modifications).length === 0) {
    return reponse({ erreur: 'RIEN_A_MODIFIER' }, 400, requete);
  }

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await clientService
    .from('collecteurs')
    .update(modifications)
    .eq('id', collecteurId)
    .select('id, nom, telephone, zone, palier, abonnement_statut')
    .maybeSingle();

  if (error) {
    console.error('modification collecteur :', error.message, error.code);
    // `23505` : la seule contrainte d'unicité de la table porte sur le
    // téléphone. Le nommer évite à l'administrateur de chercher lequel des cinq
    // champs pose problème.
    if (error.code === '23505') return reponse({ erreur: 'TELEPHONE_DEJA_PRIS' }, 409, requete);
    if (error.code === '23514') return reponse({ erreur: 'BORNE' }, 400, requete);
    return reponse({ erreur: 'MODIFICATION_IMPOSSIBLE' }, 500, requete);
  }

  if (!data) return reponse({ erreur: 'COLLECTEUR_INTROUVABLE' }, 404, requete);

  return reponse(data, 200, requete);
});

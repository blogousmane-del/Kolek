import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { verifierFuite } from '../_shared/hibp.ts';
import { tarifParCle } from '../_shared/paliers.ts';
import { validerCollecteur } from '../_shared/valider-collecteur.ts';

/**
 * Créer un collaborateur, depuis l'application du titulaire.
 *
 * ## Pourquoi pas `admin-creer-collecteur`
 *
 * Parce que le geste n'est pas le même. `admin-creer-collecteur` est une porte
 * de GTCS ; celle-ci est une fonction du produit, exercée en autonomie par un
 * client payant, et elle porte donc un contrôle que l'autre n'a pas : le palier
 * de l'appelant, et le compte de son équipe.
 *
 * ## L'ordre, et sa conséquence assumée
 *
 * Le compte naît avant d'être rattaché. Si le rattachement échoue, le compte
 * existe, non rattaché. La fonction rend alors `409 RATTACHEMENT_REFUSE` **en
 * nommant le compte créé**, plutôt qu'une panne muette : un `auth.users`
 * orphelin qu'on ne sait pas nommer est pire qu'un compte à rattacher à la main.
 *
 * Le déclencheur `collecteurs_valider_rattachement` est la dernière barrière. Si
 * cette fonction s'est trompée sur le palier ou sur le compte de l'équipe, la
 * base refuse là, et le compte reste un collecteur seul plutôt qu'un
 * rattachement invalide.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

/** Trois créations par heure et par titulaire. Le plafond de l'équipe étant de
    trois, c'est exactement une équipe complète en une fois, et rien de plus. */
const PLAFOND = 3;
const FENETRE_SECONDES = 3600;

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
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleAnon || !cleService) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- L'identité vient du jeton, jamais du corps ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }
  const titulaireId = utilisateur.user.id;

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Le portillon : palier, statut, absence de titulaire, place restante ---

  const { data: appelant, error: erreurAppelant } = await clientService
    .from('collecteurs')
    .select('palier, abonnement_statut, titulaire_id')
    .eq('id', titulaireId)
    .maybeSingle();

  if (erreurAppelant) {
    console.error('lecture appelant :', erreurAppelant.message);
    return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
  }

  const { count: dejaRattaches, error: erreurCompte } = await clientService
    .from('collecteurs')
    .select('id', { count: 'exact', head: true })
    .eq('titulaire_id', titulaireId);

  if (erreurCompte) {
    console.error('compte équipe :', erreurCompte.message);
    return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
  }

  const places = tarifParCle('illimite').collaborateursInclus;

  // Trois refus se confondent volontairement : distinguer « mauvais palier » de
  // « équipe complète » n'aiderait personne que l'écran ne renseigne déjà — il
  // connaît le palier, le rattachement et le compte de l'équipe — et
  // multiplierait les chemins à tenir.
  const titulaireAvecPlace =
    appelant?.palier === 'illimite' &&
    appelant?.titulaire_id === null &&
    (dejaRattaches ?? 0) < places;

  if (!titulaireAvecPlace) return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);

  // Le quatrième, en revanche, se nomme. Ce raisonnement avait une faille, et
  // elle s'est vue en production le 2026-09-03 : l'écran **ne connaît pas** le
  // statut de l'abonnement, il ne le testait pas. Un titulaire Illimité
  // suspendu voyait donc « Il te reste 3 places sur les 3 de ton forfait »,
  // puis « Réservé au forfait Illimité, et à trois collaborateurs au plus » —
  // un refus dont l'écran venait de démentir les deux motifs affichés.
  if (appelant?.abonnement_statut !== 'actif') {
    return reponse({ erreur: 'ABONNEMENT_INACTIF' }, 403, requete);
  }

  // --- Validation avant toute écriture ---

  let saisie: unknown;
  try {
    saisie = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  // Un collaborateur naît sur le palier de son titulaire : il n'y a pas de
  // second abonnement à vendre. Le `palier` du corps est donc écrasé, pas lu —
  // le laisser passer permettrait de fabriquer un compte Illimité gratuit.
  const controle = validerCollecteur({
    ...(saisie as Record<string, unknown>),
    palier: 'illimite',
  });
  if (!controle.ok) return reponse({ erreur: controle.erreur }, 400, requete);
  const { email, motDePasse, nom, telephone, zone } = controle.valeurs;

  // --- La borne d'abus ---
  //
  // La clé est le titulaire, pas son adresse. `empreinteRequete` sert les routes
  // publiques, où l'appelant n'a pas de nom ; ici il en a un, et il est vérifié.
  // Borner par adresse ferait partager un même quota à plusieurs titulaires
  // derrière un même relais — un cybercafé, une 4G partagée — et le premier à
  // constituer son équipe fermerait la porte aux autres pour une heure.
  //
  // Consommée après la validation, et non avant : sinon trois saisies fautives —
  // une adresse mal tapée — coûtent une heure d'attente sans qu'aucun compte
  // n'ait été créé. Ce que cette borne protège est plus bas : l'appel à HIBP et
  // l'écriture dans `auth.users`.
  const { data: dansLePlafond } = await clientService.rpc('consommer_debit', {
    cle: `collecteur-creer-collaborateur:${titulaireId}`,
    plafond: PLAFOND,
    fenetre_secondes: FENETRE_SECONDES,
  });
  if (dansLePlafond === false) {
    return reponse({ erreur: 'TROP_DE_TENTATIVES' }, 429, requete);
  }

  // --- Mot de passe divulgué ---
  //
  // `auth.admin.createUser` ne consulte aucune règle de mot de passe
  // (supabase/auth#1959) : la case « Prevent use of leaked passwords » du projet
  // ne couvre pas ce chemin. Ce contrôle est la seule application effective du
  // seuil, comme dans `admin-creer-collecteur`.
  const fuite = await verifierFuite(motDePasse);
  if (fuite.etat === 'compromis') {
    return reponse(
      { erreur: 'MOT_DE_PASSE_COMPROMIS', occurrences: fuite.occurrences },
      400,
      requete,
    );
  }

  // Service injoignable : on laisse passer plutôt que de bloquer la création sur
  // une panne extérieure, mais on le dit dans la réponse.
  const avertissement = fuite.etat === 'indisponible' ? 'FUITES_NON_VERIFIEES' : undefined;
  if (avertissement) console.error('HIBP injoignable :', fuite.raison);

  // --- Le compte ---
  //
  // `email_confirm: true` : le titulaire remet les identifiants en main propre à
  // son collaborateur. Attendre une confirmation par courriel bloquerait
  // quelqu'un qui n'a pas d'adresse à lui — cas courant sur ce marché.
  //
  // `nom` et `telephone` passent par les métadonnées : le déclencheur
  // `creer_collecteur_apres_signup` les y lit pour composer la ligne
  // `collecteurs`. C'est le chemin déjà en place ; en ouvrir un second créerait
  // deux façons de naître pour un collecteur.
  const { data: cree, error: erreurAuth } = await clientService.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom, telephone },
  });

  if (erreurAuth || !cree.user) {
    const message = erreurAuth?.message ?? 'création impossible';
    console.error('createUser a échoué :', message);
    // Deux causes que le titulaire peut corriger seul, et qu'il faut donc
    // nommer. La première, l'adresse déjà prise, GoTrue la nomme lui-même.
    if (/already|exist|registered/i.test(message)) {
      return reponse({ erreur: 'EMAIL_DEJA_PRIS' }, 409, requete);
    }

    // L'autre cause, que GoTrue ne nomme pas : le numéro déjà porté.
    // `collecteurs.telephone` est unique, donc le déclencheur
    // `creer_collecteur_apres_signup` échoue, donc l'insertion dans
    // `auth.users` échoue — et il n'en remonte qu'un « Database error creating
    // new user ». Sans ce coup de sonde, le seul défaut que la saisie puisse
    // corriger s'affiche « réessaie », sur une manœuvre condamnée d'avance.
    //
    // Il n'a lieu qu'après un échec : il ne renseigne personne qui n'ait déjà
    // franchi la validation et la borne d'abus.
    const { data: porte } = await clientService
      .from('collecteurs')
      .select('id')
      .eq('telephone', telephone)
      .maybeSingle();
    if (porte) return reponse({ erreur: 'TELEPHONE_DEJA_PRIS' }, 409, requete);

    return reponse({ erreur: 'CREATION_IMPOSSIBLE' }, 500, requete);
  }

  // --- Le rattachement, sous la dernière barrière ---

  const complement: Record<string, string> = { palier: 'illimite', titulaire_id: titulaireId };
  if (zone) complement.zone = zone;

  const { error: erreurRattachement } = await clientService
    .from('collecteurs')
    .update(complement)
    .eq('id', cree.user.id);

  if (erreurRattachement) {
    console.error('rattachement refusé :', erreurRattachement.message);
    return reponse(
      {
        erreur: 'RATTACHEMENT_REFUSE',
        collaborateurId: cree.user.id,
        cause: erreurRattachement.message,
      },
      409,
      requete,
    );
  }

  return reponse({ collaborateurId: cree.user.id, email, nom, avertissement }, 201, requete);
});

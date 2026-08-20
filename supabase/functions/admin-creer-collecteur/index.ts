import { createClient } from 'npm:@supabase/supabase-js@2';

import { entetesCors, listerOrigines } from '../_shared/cors.ts';
import { tarifParCle } from '../_shared/paliers.ts';

/**
 * Créer un compte collecteur.
 *
 * L'inscription publique est fermée — `disable_signup: true`, mesuré au dernier
 * audit — et c'est une propriété de sécurité, pas une lacune : personne ne
 * s'inscrit tout seul sur une plateforme qui manipule l'épargne d'autrui. Les
 * comptes sont donc créés par GTCS, et jusqu'ici cela se faisait à la main dans
 * le tableau de bord Supabase.
 *
 * Créer un utilisateur exige la clé de service. Il n'y a donc que deux endroits
 * possibles pour ce geste : le tableau de bord Supabase, ou une Edge Function.
 * Le mettre dans l'écran d'administration en donnant la clé au navigateur
 * serait la première des quatre failles de la grille d'audit du dépôt.
 *
 * ## Contrôle d'accès
 *
 * Identique à `admin-vue-globale`, et pour les mêmes raisons : `est_admin()` est
 * appelée **avec le jeton de l'appelant**, jamais avec la clé de service, et
 * toute réponse autre qu'un `true` franc referme la porte.
 *
 * La différence est la portée du dégât. `admin-vue-globale` ne fait que lire ;
 * ici on crée un compte capable de se connecter. Le contrôle est le même, mais
 * l'exigence de ne pas se tromper est plus haute — d'où la validation des
 * entrées avant tout appel, et le refus de tout champ non prévu.
 */

const ORIGINES_AUTORISEES = listerOrigines(Deno.env.get('ORIGINES_ADMIN'));

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

interface Saisie {
  email?: unknown;
  motDePasse?: unknown;
  nom?: unknown;
  telephone?: unknown;
  zone?: unknown;
  palier?: unknown;
}

/**
 * Bornes reprises des contraintes `CHECK` de la base.
 *
 * Les répéter ici n'est pas une seconde source de vérité : la base reste seule
 * juge, et un dépassement y lèverait `23514`. Ce contrôle sert à rendre une
 * phrase utile plutôt qu'un code SQL, et à ne pas créer l'utilisateur Auth
 * avant de découvrir que sa ligne `collecteurs` sera refusée.
 */
const BORNES = { nom: 120, telephone: 64, zone: 80 } as const;

/** Longueur minimale du mot de passe. Le distant applique 8 ; on exige 10, qui
    est l'intention écrite dans `config.toml`. Durcir ici est sans risque : un
    mot de passe plus long n'est jamais refusé par le serveur. */
const LONGUEUR_MOT_DE_PASSE = 10;

function valider(saisie: Saisie): { ok: true; valeurs: Required<Record<string, string>> } | {
  ok: false;
  erreur: string;
} {
  const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const email = texte(saisie.email).toLowerCase();
  const motDePasse = typeof saisie.motDePasse === 'string' ? saisie.motDePasse : '';
  const nom = texte(saisie.nom);
  const telephone = texte(saisie.telephone);
  const zone = texte(saisie.zone);
  const palier = texte(saisie.palier) || 'essai';

  // Volontairement sommaire : la validation d'adresse fait autorité chez
  // GoTrue, qui refusera ce qui ne lui convient pas. Ce test n'est là que pour
  // éviter un aller-retour évident.
  if (!email.includes('@') || email.length < 5) return { ok: false, erreur: 'EMAIL_INVALIDE' };
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
    return { ok: false, erreur: 'MOT_DE_PASSE_COURT' };
  }
  if (!nom) return { ok: false, erreur: 'NOM_REQUIS' };
  if (!telephone) return { ok: false, erreur: 'TELEPHONE_REQUIS' };

  if (nom.length > BORNES.nom) return { ok: false, erreur: 'NOM_TROP_LONG' };
  if (telephone.length > BORNES.telephone) return { ok: false, erreur: 'TELEPHONE_TROP_LONG' };
  if (zone.length > BORNES.zone) return { ok: false, erreur: 'ZONE_TROP_LONGUE' };

  // Lève si le palier n'existe pas dans la grille tarifaire, laquelle est
  // engendrée depuis `packages/core`. La contrainte `collecteurs_palier_check`
  // dirait la même chose, mais plus tard et moins clairement.
  try {
    tarifParCle(palier);
  } catch {
    return { ok: false, erreur: 'PALIER_INCONNU' };
  }

  return { ok: true, valeurs: { email, motDePasse, nom, telephone, zone, palier } };
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

  // --- Portillon, sous l'identité de l'appelant ---

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

  // --- Validation avant toute écriture ---

  let saisie: Saisie;
  try {
    saisie = (await requete.json()) as Saisie;
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const controle = valider(saisie);
  if (!controle.ok) return reponse({ erreur: controle.erreur }, 400, requete);
  const { email, motDePasse, nom, telephone, zone, palier } = controle.valeurs;

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // `email_confirm: true` : GTCS crée le compte et remet les identifiants en
  // main propre. Attendre une confirmation par courriel bloquerait un collecteur
  // qui n'a pas d'adresse à lui — cas courant sur ce marché.
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
    // Le seul cas qu'il faut nommer : l'adresse est déjà prise. Les autres
    // restent génériques — le détail d'une erreur GoTrue n'aide pas
    // l'administrateur et renseigne un attaquant sur les comptes existants.
    const deja = /already|exist|registered/i.test(message);
    return reponse({ erreur: deja ? 'EMAIL_DEJA_PRIS' : 'CREATION_IMPOSSIBLE' }, deja ? 409 : 500, requete);
  }

  // Le déclencheur a créé la ligne `collecteurs`. Zone et palier ne font pas
  // partie des métadonnées d'inscription : on les pose ensuite.
  const complement: Record<string, string> = { palier };
  if (zone) complement.zone = zone;

  const { error: erreurLigne } = await clientService
    .from('collecteurs')
    .update(complement)
    .eq('id', cree.user.id);

  if (erreurLigne) {
    // Le compte existe et fonctionne ; seuls la zone et le palier manquent. Le
    // dire tel quel : annoncer un échec pousserait à recréer le compte, et la
    // seconde tentative buterait sur l'adresse déjà prise.
    console.error('complément collecteur :', erreurLigne.message);
    return reponse(
      { erreur: 'COMPLEMENT_INCOMPLET', collecteurId: cree.user.id },
      207,
      requete,
    );
  }

  return reponse({ collecteurId: cree.user.id, email, nom }, 201, requete);
});

import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_ADMIN, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { composer } from '../_shared/message-acces.ts';
import { envoyer, passerelleDepuis } from '../_shared/passerelle-courriel.ts';

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
 *
 * ## Depuis le 2026-08-27, accorder ouvre le compte
 *
 * `POST { statut: 'ouverte' }` ne se contente plus de changer une colonne : il
 * crée l'utilisateur, envoie l'invitation, **et ne marque la demande
 * qu'ensuite**. L'ordre est délibéré, et gardé par
 * `supabase/tests/accord-demande.test.ts` — voir l'en-tête d'`accorder`.
 *
 * Les deux autres statuts, `contactee` et `refusee`, n'envoient rien et
 * n'appellent pas la passerelle. L'écran d'administration continue donc de
 * fonctionner entièrement le jour où la clé du fournisseur expire.
 */

const ORIGINES_AUTORISEES = listerOrigines(Deno.env.get('ORIGINES_ADMIN'), ORIGINES_ADMIN);

const STATUTS = new Set(['contactee', 'ouverte', 'refusee']);

/**
 * Où atterrit le prospect après avoir cliqué.
 *
 * Cette adresse doit figurer dans `additional_redirect_urls` du projet, sinon
 * GoTrue **renvoie silencieusement sur `site_url`** et le lien mène nulle part.
 * Le symptôme n'est pas une erreur : c'est un écran de connexion ordinaire, et
 * le prospect croit que son compte n'existe pas.
 */
const REDIRECTION =
  Deno.env.get('REDIRECTION_MOT_DE_PASSE') ?? 'https://app.kolek.cash/nouveau-mot-de-passe';

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

interface DemandeLue {
  id: string;
  nom: string;
  telephone: string;
  email: string | null;
  zone: string | null;
  palier: string;
  statut: string;
}

type Service = ReturnType<typeof createClient>;

type Acces =
  | { ok: true; lien: string; collecteurId: string; reprise: boolean }
  | { ok: false; erreur: string; statut: number };

/**
 * Crée le compte et rend le lien, sans rien envoyer.
 *
 * `generateLink` fait exactement ce qu'il nous faut : il crée l'utilisateur et
 * rend l'adresse à cliquer, mais laisse l'envoi à l'appelant. Le déclencheur
 * `creer_collecteur_apres_signup` compose ensuite la ligne `collecteurs` en
 * lisant `nom` et `telephone` dans les métadonnées — le chemin déjà emprunté
 * par `admin-creer-collecteur`, plutôt qu'un second.
 *
 * ## La retombée sur `recovery` n'est pas un raffinement
 *
 * `type: 'invite'` refuse une adresse **déjà confirmée** : GoTrue répond
 * « Email address already registered by another user ». Une relance après que
 * le prospect a cliqué échouerait donc, exactement au moment où l'on veut
 * relancer. `type: 'recovery'`, lui, vaut pour un compte existant et mène au
 * même écran. Les deux chemins sont gardés, et le texte du courriel suit —
 * « ton compte est ouvert » pour l'un, « choisis un nouveau mot de passe »
 * pour l'autre.
 */
async function lienDacces(
  clientService: Service,
  demande: DemandeLue & { email: string },
): Promise<Acces> {
  const invitation = await clientService.auth.admin.generateLink({
    type: 'invite',
    email: demande.email,
    options: {
      data: { nom: demande.nom, telephone: demande.telephone },
      redirectTo: REDIRECTION,
    },
  });

  if (!invitation.error && invitation.data.user && invitation.data.properties) {
    return {
      ok: true,
      lien: invitation.data.properties.action_link,
      collecteurId: invitation.data.user.id,
      reprise: false,
    };
  }

  const message = invitation.error?.message ?? 'lien impossible';
  if (!/already|exist|registered/i.test(message)) {
    console.error('generateLink invite a échoué :', message);
    return { ok: false, erreur: 'COMPTE_NON_CREE', statut: 500 };
  }

  const reprise = await clientService.auth.admin.generateLink({
    type: 'recovery',
    email: demande.email,
    options: { redirectTo: REDIRECTION },
  });

  if (reprise.error || !reprise.data.user || !reprise.data.properties) {
    console.error('generateLink recovery a échoué :', reprise.error?.message);
    return { ok: false, erreur: 'COMPTE_NON_CREE', statut: 500 };
  }

  return {
    ok: true,
    lien: reprise.data.properties.action_link,
    collecteurId: reprise.data.user.id,
    reprise: true,
  };
}

/**
 * L'accord d'une demande : compte, courriel, puis marquage.
 *
 * **L'ordre est le dessin.** Marquer avant d'envoyer produirait, à la première
 * panne de passerelle, une demande classée « ouverte » dont le prospect n'a
 * jamais rien reçu — invisible dans l'écran d'administration, découverte par un
 * appel des semaines plus tard. En marquant après, un échec laisse la demande
 * en l'état et rend un code distinct : l'administrateur lit « le compte est
 * créé, mais le courriel n'est pas parti » et relance.
 *
 * La passerelle est vérifiée **avant même** de créer le compte, par l'appelant.
 * Une configuration absente ne laisse alors aucune trace du tout : ni compte
 * orphelin, ni ligne `collecteurs` sans propriétaire.
 */
async function accorder(
  clientService: Service,
  demandeId: string,
  administrateur: string,
  requete: Request,
): Promise<Response> {
  const { data, error } = await clientService.rpc('admin_demande', { demande_id: demandeId });
  if (error) {
    console.error('admin_demande a échoué :', error.message);
    return reponse({ erreur: 'LECTURE_IMPOSSIBLE' }, 500, requete);
  }

  const demande = data as DemandeLue | null;
  if (!demande) return reponse({ erreur: 'DEMANDE_INTROUVABLE' }, 404, requete);
  if (!demande.email) {
    // Les demandes déposées avant le 2026-08-27 n'en portent pas. Le dire, et
    // laisser la demande en l'état : GTCS rappelle et demande l'adresse.
    return reponse({ erreur: 'EMAIL_ABSENT' }, 400, requete);
  }

  // La passerelle est contrôlée **ici** : après les deux refus qui ne créent
  // rien — demande introuvable, demande sans adresse —, et avant le premier
  // geste qui crée quelque chose.
  //
  // La placer plus tôt paraissait plus prudent, et ne l'était pas : elle
  // masquait ces deux refus derrière un `COURRIEL_NON_CONFIGURE`, et
  // l'administrateur lisait « le service de courriel est en panne » pour une
  // demande qui n'a simplement jamais porté d'adresse.
  const passerelle = passerelleDepuis(Deno.env.toObject());
  if (!passerelle) {
    console.error('COURRIEL_FOURNISSEUR / COURRIEL_CLE / COURRIEL_EXPEDITEUR absents.');
    return reponse({ erreur: 'COURRIEL_NON_CONFIGURE' }, 500, requete);
  }

  const acces = await lienDacces(clientService, { ...demande, email: demande.email });
  if (!acces.ok) return reponse({ erreur: acces.erreur }, acces.statut, requete);

  // Palier et zone ne font pas partie des métadonnées d'inscription : on les
  // pose ensuite, comme le fait déjà `admin-creer-collecteur`.
  const complement: Record<string, string> = { palier: demande.palier };
  if (demande.zone) complement.zone = demande.zone;
  const { error: erreurComplement } = await clientService
    .from('collecteurs')
    .update(complement)
    .eq('id', acces.collecteurId);
  if (erreurComplement) {
    // Le compte fonctionne ; seuls la zone et le palier manquent. On continue :
    // interrompre ici priverait le prospect de son courriel pour deux colonnes.
    console.error('complément collecteur :', erreurComplement.message);
  }

  const { sujet, corps } = composer(
    acces.reprise
      ? { type: 'reinitialisation', lien: acces.lien }
      : { type: 'invitation', nom: demande.nom, lien: acces.lien },
  );

  const issue = await envoyer(passerelle, demande.email, sujet, corps);
  if (!issue.ok) {
    console.error('invitation non partie :', issue.raison);
    // La demande reste intacte. C'est tout l'objet de l'ordre choisi.
    return reponse(
      { erreur: 'COURRIEL_NON_PARTI', raison: issue.raison, collecteurId: acces.collecteurId },
      502,
      requete,
    );
  }

  const { data: marquee, error: erreurMarquage } = await clientService.rpc(
    'admin_traiter_demande',
    { demande_id: demandeId, nouveau_statut: 'ouverte', administrateur },
  );

  if (erreurMarquage) {
    // Le prospect a son courriel ; seule la trace administrative manque.
    // Annoncer un échec ferait recommencer l'accord, et le prospect recevrait un
    // second message.
    console.error('admin_traiter_demande a échoué après envoi :', erreurMarquage.message);
    return reponse({ erreur: 'MARQUAGE_INCOMPLET', collecteurId: acces.collecteurId }, 207, requete);
  }

  return reponse({ ...(marquee as Record<string, unknown>), collecteurId: acces.collecteurId }, 200, requete);
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

  if (statut === 'ouverte') {
    return await accorder(clientService, id, administrateur, requete);
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

import { createClient } from 'npm:@supabase/supabase-js@2';

import { entetesCors, listerOrigines } from '../_shared/cors.ts';
import { verifierFuite } from '../_shared/hibp.ts';
import { validerCollecteur } from '../_shared/valider-collecteur.ts';

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

  let saisie: unknown;
  try {
    saisie = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  // Les règles vivent dans `_shared/valider-collecteur.ts`, sans API Deno, pour
  // être couvertes par la suite de tests du dépôt.
  const controle = validerCollecteur(saisie as Record<string, unknown>);
  if (!controle.ok) return reponse({ erreur: controle.erreur }, 400, requete);
  const { email, motDePasse, nom, telephone, zone, palier } = controle.valeurs;

  // --- Mots de passe divulgués ---
  //
  // Ce contrôle double en apparence le réglage `Prevent use of leaked
  // passwords`, activé sur le projet le 2026-08-20. Il ne le double pas :
  // `auth.admin.createUser` ne consulte aucune règle de mot de passe
  // (supabase/auth#1959), ce qui a été mesuré ici même — un compte s'est créé
  // avec `password123` réglage actif. Ce chemin étant le seul par lequel un
  // compte naît dans Kolek, la case cochée ne couvrait rien.
  //
  // Même remarque pour la longueur minimale : `LONGUEUR_MOT_DE_PASSE` dans
  // `valider-collecteur.ts` n'est pas une précaution redondante, c'est la seule
  // application effective du seuil.
  const fuite = await verifierFuite(motDePasse);
  if (fuite.etat === 'compromis') {
    // Le nombre d'occurrences est rendu : « vu 2 918 953 fois dans des fuites »
    // fait comprendre à l'administrateur qu'il ne s'agit pas d'un caprice de
    // complexité. Il ne renseigne personne — c'est une propriété publique du
    // mot de passe qu'il vient de taper, pas un fait sur un compte.
    return reponse(
      { erreur: 'MOT_DE_PASSE_COMPROMIS', occurrences: fuite.occurrences },
      400,
      requete,
    );
  }

  // Service injoignable : on laisse passer plutôt que de bloquer la création
  // d'un collecteur sur une panne extérieure, mais on le dit dans la réponse.
  // Le risque réel est faible — le formulaire engendre par défaut un mot de
  // passe aléatoire de 16 caractères, qui ne peut pas figurer dans une fuite.
  // Il n'existe que si l'administrateur a saisi le sien.
  const avertissement = fuite.etat === 'indisponible' ? 'FUITES_NON_VERIFIEES' : undefined;
  if (avertissement) console.error('HIBP injoignable :', fuite.raison);

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
      { erreur: 'COMPLEMENT_INCOMPLET', collecteurId: cree.user.id, avertissement },
      207,
      requete,
    );
  }

  return reponse({ collecteurId: cree.user.id, email, nom, avertissement }, 201, requete);
});

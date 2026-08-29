import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { empreinteRequete } from '../_shared/debit.ts';
import { composer } from '../_shared/message-acces.ts';
import { envoyer, passerelleDepuis } from '../_shared/passerelle-courriel.ts';
import { plancherDepuis, tenirPlancher } from '../_shared/plancher.ts';
import { validerEmail } from '../_shared/valider-email.ts';

/**
 * Le mot de passe oublié.
 *
 * ## C'est la deuxième fonction publique du produit
 *
 * `demander-ouverture` était la seule. Celle-ci accepte aussi une requête sans
 * session — par définition, quelqu'un qui a perdu son mot de passe ne peut pas
 * s'authentifier. Elle est donc écrite comme une surface exposée.
 *
 * ## La règle qui gouverne tout ce fichier
 *
 * **La réponse ne dépend jamais de l'existence du compte.** Même statut, même
 * corps, que l'adresse soit connue, inconnue, ou que la borne ait mordu.
 *
 * L'audit du 2026-08-25 a mesuré que Kolek ne permet pas d'énumérer ses
 * comptes : un compte inexistant et un mot de passe faux rendent le même
 * `invalid_credentials`. Une porte qui distinguerait ici « adresse inconnue »
 * de « courriel envoyé » serait un annuaire des collecteurs de GTCS,
 * interrogeable à la seconde — et il n'y a pas de moitié de fuite.
 *
 * Trois conséquences assumées, dans l'ordre où elles se présentent :
 *
 * * **La passerelle est vérifiée avant la borne.** Dans l'autre ordre, une
 *   configuration absente rendrait 500 aux premiers appels et la réponse
 *   nominale au quatrième, et l'écart se lirait.
 * * **La borne rend la réponse nominale**, pas un 429. Sinon la borne
 *   deviendrait elle-même le signal : atteindre le refus apprendrait que les
 *   appels précédents ont compté.
 * * **Un échec d'envoi rend quand même la réponse nominale.** Il est
 *   journalisé, et le collecteur peut redemander. Perdre un courriel est
 *   réparable ; livrer la liste des comptes ne l'est pas.
 *
 * Une seule chose est refusée franchement : une adresse **mal formée**. La
 * forme est visible du client, elle ne renseigne sur aucun compte, et le
 * silence ferait chercher longtemps quelqu'un qui a fait une faute de frappe.
 *
 * ## La quatrième conséquence, ajoutée le 2026-08-29
 *
 * Les trois précédentes regardent toutes le **contenu** de la réponse. Aucune
 * ne regardait sa **durée** — et les trois chemins ne coûtent pas la même
 * chose. Le chemin nominal appelle la passerelle de courriel ; les deux autres
 * non. Plusieurs centaines de millisecondes séparaient donc « adresse connue »
 * de « adresse inconnue », et cet écart se chronomètre en boucle depuis
 * n'importe quel navigateur.
 *
 * Un corps de réponse identique livré à des instants distincts n'est pas une
 * réponse identique. `_shared/plancher.ts` retient chaque réponse **du domaine
 * où les chemins divergent** jusqu'à un instant fixe compté depuis l'entrée.
 * Toutes les sorties situées après la validation d'adresse passent par
 * `repondreTenu` — en manquer une seule rouvrirait la fuite, puisqu'il suffit
 * d'un chemin distinguable pour distinguer.
 *
 * ## Aucun appel ne liste les comptes
 *
 * `generateLink` refuse de lui-même une adresse inconnue : il sert donc à la
 * fois de recherche et de fabrication du lien. Rien dans ce fichier n'a la
 * possibilité de répondre différemment selon ce qu'il a trouvé — c'est une
 * propriété du code, pas une discipline de relecture.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

/** Trois par quart d'heure et par IP. Assez pour celui qui n'a rien reçu et
    réessaie ; trop peu pour balayer un annuaire. */
const PLAFOND = 3;
const FENETRE_SECONDES = 900;

const REDIRECTION =
  Deno.env.get('REDIRECTION_MOT_DE_PASSE') ?? 'https://app.kolek.cash/nouveau-mot-de-passe';

/** La réponse nominale, écrite en un seul endroit. Deux littéraux finiraient
    par diverger d'un espace, et cet espace serait la fuite. */
const NOMINALE = { envoye: true };

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

/** Lu une fois au chargement du module, comme les origines et la redirection.
    Le relire à chaque requête coûterait un accès environnement par appel sans
    rien apporter : une variable ne change pas sans redéploiement. */
const PLANCHER_MS = plancherDepuis(Deno.env.toObject());

Deno.serve(async (requete) => {
  const debut = Date.now();

  /**
   * Toute sortie postérieure à la validation d'adresse passe par ici.
   *
   * Les sorties antérieures — méthode refusée, corps illisible, adresse mal
   * formée — répondent sans attendre : elles sont volontairement
   * distinguables, ne dépendent d'aucun compte, et les retenir n'ajouterait
   * qu'une seconde d'attente à une faute de frappe.
   */
  const repondreTenu = async (corps: unknown, statut: number): Promise<Response> => {
    await tenirPlancher(debut, PLANCHER_MS);
    return reponse(corps, statut, requete);
  };

  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  let brut: { email?: unknown } | null;
  try {
    brut = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const verdict = validerEmail(brut?.email);
  if (!verdict.ok) return reponse({ erreur: verdict.erreur }, 400, requete);

  const url = Deno.env.get('SUPABASE_URL');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleService) {
    console.error('Configuration incomplète.');
    return await repondreTenu({ erreur: 'CONFIGURATION' }, 500);
  }

  // Avant la borne : voir l'en-tête. Une configuration absente doit produire la
  // même réponse à tous les appels, bornés ou non.
  const passerelle = passerelleDepuis(Deno.env.toObject());
  if (!passerelle) {
    console.error('COURRIEL_FOURNISSEUR / COURRIEL_CLE / COURRIEL_EXPEDITEUR absents.');
    return await repondreTenu({ erreur: 'CONFIGURATION' }, 500);
  }

  const client = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: dansLePlafond } = await client.rpc('consommer_debit', {
    cle: empreinteRequete('mot-de-passe-oublie', requete.headers),
    plafond: PLAFOND,
    fenetre_secondes: FENETRE_SECONDES,
  });

  // Au-delà : la réponse nominale, sans rien envoyer.
  if (dansLePlafond !== true) return await repondreTenu(NOMINALE, 200);

  const { data, error } = await client.auth.admin.generateLink({
    type: 'recovery',
    email: verdict.email,
    options: { redirectTo: REDIRECTION },
  });

  if (error || !data.properties) {
    // Adresse inconnue, le plus souvent. Journalisé en `info` : ce n'est pas un
    // incident, et le noter en erreur ferait du bruit à chaque faute de frappe.
    console.info('lien de réinitialisation non engendré :', error?.message ?? 'sans propriétés');
    return await repondreTenu(NOMINALE, 200);
  }

  const { sujet, corps } = composer({
    type: 'reinitialisation',
    lien: data.properties.action_link,
  });
  const issue = await envoyer(passerelle, verdict.email, sujet, corps);

  if (!issue.ok) {
    // Journalisé, et la réponse nominale quand même. Le collecteur redemandera ;
    // c'est réparable. Distinguer ce cas ne le serait pas.
    console.error('courriel de réinitialisation non parti :', issue.raison);
  }

  return await repondreTenu(NOMINALE, 200);
});

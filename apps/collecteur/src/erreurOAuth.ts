/**
 * L'erreur que Supabase renvoie dans l'adresse, après un retour de Google.
 *
 * ## Pourquoi ce fichier existe
 *
 * Quand l'échange échoue, GoTrue ne lève rien côté client : il **redirige** vers
 * l'origine demandée en accrochant le motif à l'adresse. Le 2026-08-24, une
 * tentative réelle est revenue ainsi :
 *
 *     /?error=server_error&error_code=unexpected_failure
 *      &error_description=Unable+to+exchange+external+code%3A+4%2F0A
 *
 * Rien ne lisait ces paramètres. Le collecteur partait chez Google, revenait, et
 * retrouvait le même écran de connexion — sans un mot. C'est la pire forme de
 * panne : elle ressemble à un bouton cassé, donc on la retouche dix fois avant
 * d'appeler GTCS.
 *
 * ## Requête et fragment
 *
 * GoTrue place l'erreur dans la **requête** en flux PKCE — celui de
 * `supabase-js` v2, donc le nôtre — et dans le **fragment** en flux implicite,
 * qui reste ce que renvoient les liens de courriel. Les deux sont lus : un
 * fragment ignoré serait de nouveau une panne muette, pour trois lignes de code.
 *
 * ## Ce qui n'est pas fait ici
 *
 * Aucune lecture de `window`. La fonction reçoit l'adresse et rend un message ;
 * c'est ce qui permet de la vérifier sur les adresses réellement rencontrées
 * plutôt que sur un `location` truqué. La lecture du navigateur et le nettoyage
 * de la barre d'adresse vivent dans `lireErreurOAuthCourante`, plus bas.
 */

/**
 * Le refus d'une adresse Google sans fiche collecteur.
 *
 * Exporté parce que deux chemins y mènent : `signInWithOAuth` peut le refuser
 * tout de suite, et GoTrue peut le renvoyer dans l'adresse après le détour par
 * Google. Le collecteur doit lire la même phrase dans les deux cas — deux
 * formulations pour un même refus se lisent comme deux problèmes différents.
 */
export const MESSAGE_COMPTE_NON_RATTACHE =
  "Cette adresse Google n'est rattachée à aucun compte Kolek. Demande à GTCS d'ouvrir ton compte.";

/** Les trois paramètres que GoTrue emploie, et les seuls qu'on retire. */
const PARAMETRES = ['error', 'error_code', 'error_description'] as const;

/** Rassemble requête et fragment en un seul jeu de paramètres. */
function parametres(href: string): URLSearchParams {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // Une adresse illisible n'est pas une erreur OAuth : on ne dit rien plutôt
    // que d'inventer un motif.
    return new URLSearchParams();
  }
  const tous = new URLSearchParams(url.search);
  for (const [cle, valeur] of new URLSearchParams(url.hash.replace(/^#/, ''))) {
    if (!tous.has(cle)) tous.set(cle, valeur);
  }
  return tous;
}

/**
 * Rend le message à afficher, ou `null` si l'adresse ne porte aucune erreur.
 *
 * L'ordre des cas compte. GoTrue envoie `error=access_denied` **aussi** quand
 * l'inscription est fermée : tester le refus volontaire en premier ferait
 * répondre « tu as refusé » à un collecteur qui n'a rien refusé.
 */
export function lireErreurOAuth(href: string): string | null {
  const p = parametres(href);
  const code = p.get('error');
  if (!code) return null;

  const sousCode = p.get('error_code') ?? '';
  const motif = p.get('error_description') ?? '';

  if (sousCode === 'signup_disabled' || /signups? not allowed|signup is disabled/i.test(motif)) {
    return MESSAGE_COMPTE_NON_RATTACHE;
  }

  if (code === 'access_denied') {
    // Rien à réparer, donc personne à prévenir : le collecteur a annulé lui-même.
    return "Tu as refusé l'accès à ton compte Google. Aucune connexion n'a été ouverte.";
  }

  if (/unable to exchange external code|invalid_client|invalid_grant/i.test(motif)) {
    // Le cas du 2026-08-24. Google a bien rendu son code ; c'est l'échange
    // entre Supabase et Google qui a été refusé. Le collecteur n'y peut rien,
    // et c'est la première chose à lui dire — sinon il change de compte Google,
    // puis désinstalle l'application.
    return (
      'La connexion Google a échoué à cause de la configuration du projet, ' +
      'pas de ton compte. Préviens GTCS. En attendant, connecte-toi avec ton ' +
      'adresse et ton mot de passe.'
    );
  }

  if (/bad_oauth_state|flow_state|expired/i.test(`${sousCode} ${motif}`)) {
    return 'La tentative a expiré, ou elle a été ouverte dans un autre onglet. Recommence.';
  }

  // Le motif brut reste lisible : c'est lui qui permet à GTCS de chercher, et un
  // message purement générique ferait recommencer la même chose.
  const suffixe = motif ? ` Motif : « ${motif} ».` : '';
  return `Connexion Google impossible.${suffixe} Préviens GTCS si cela se répète.`;
}

/** La même lecture, sur l'adresse courante. Pure, comme la précédente. */
export function lireErreurOAuthCourante(): string | null {
  if (typeof window === 'undefined') return null;
  return lireErreurOAuth(window.location.href);
}

/**
 * Retire les paramètres d'erreur de la barre d'adresse.
 *
 * **Séparé de la lecture, et il faut dire pourquoi.** Réunir les deux en une
 * seule fonction obligeait à l'appeler depuis un initialiseur de `useState` —
 * que React réexécute en mode strict. Le second passage aurait lu une adresse
 * déjà nettoyée et rendu `null` : l'erreur se serait affichée une fois sur deux,
 * selon le rendu que React conserve. Une lecture sans effet se rejoue sans
 * risque ; le nettoyage, lui, part dans un effet et ne tourne qu'une fois.
 *
 * Ne retire que les trois paramètres d'erreur. Surtout pas `code` :
 * `supabase-js` le lit pour terminer l'échange PKCE, et le retirer casserait
 * les connexions qui réussissent. Sans ce nettoyage, un rechargement
 * réafficherait une erreur déjà passée, sur une page qui va peut-être bien.
 */
export function nettoyerUrlOAuth(): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  let touche = false;
  for (const cle of PARAMETRES) {
    if (url.searchParams.has(cle)) {
      url.searchParams.delete(cle);
      touche = true;
    }
    if (fragment.has(cle)) {
      fragment.delete(cle);
      touche = true;
    }
  }
  if (!touche) return;

  const reste = fragment.toString();
  url.hash = reste ? `#${reste}` : '';
  window.history.replaceState(null, '', url.toString());
}

import { entetesPour, ouvrir, reponse } from '../_shared/portillon-super-admin.ts';

/**
 * Le journal d'audit, par pages.
 *
 * ## Séparé de `super-admin-etat`, et ce n'est pas un détail
 *
 * L'état se rappelle à chaque ouverture d'écran. Le journal ne se lit que
 * lorsqu'on le demande, il se pagine, et **sa lecture s'enregistre**. Le fondre
 * dans l'état ferait une trace de consultation par rafraîchissement : en une
 * semaine, le journal ne parlerait plus que de lui-même.
 *
 * ## Lire est une action
 *
 * C'est l'action qui révèle tout le reste, et sans cette écriture ce serait la
 * seule à ne rien laisser. La trace part **après** une lecture réussie : si la
 * base refuse, rien n'a été révélé, et une trace dirait le contraire.
 *
 * Elle est écrite au nom de l'appelant — le portillon a posé `x-kolek-acteur`
 * sur le client de service, et `acteur_courant()` ne croit cet en-tête que sous
 * `service_role`.
 *
 * ## Les bornes ne sont pas ici
 *
 * `super_admin_journal()` ramène elle-même la taille dans [1, 200] et la page à
 * 1 au minimum : une fonction qui fait confiance à son appelant pour se limiter
 * ne limite rien. Cette route vérifie seulement que les paramètres sont des
 * nombres — passés tels quels, ils feraient lever une conversion et sortiraient
 * en 500, ce qui se lit comme une panne alors que c'est une faute de frappe.
 *
 * La taille et la page réellement appliquées reviennent dans la réponse : sans
 * elles, l'écran afficherait « 9 999 par page » sur une page de 200.
 */

interface Page {
  lignes: unknown[];
  a_suivre: boolean;
}

/** `null` quand le paramètre est absent, `undefined` quand il est illisible. */
function entier(valeur: string | null): number | null | undefined {
  if (valeur === null || valeur === '') return null;
  const nombre = Number(valeur);
  return Number.isInteger(nombre) && nombre > 0 ? nombre : undefined;
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'GET' && requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const ouverture = await ouvrir(requete);
  if (ouverture instanceof Response) return ouverture;
  const { service } = ouverture;

  // Deux formes pour les mêmes paramètres, et ce n'est pas un caprice :
  // `functions.invoke`, côté écran, pose un corps JSON et ne sait pas
  // construire de chaîne de requête. Sans la seconde lecture, l'écran
  // demanderait toujours la page 1. La chaîne de requête reste, elle, la forme
  // lisible dans un journal de serveur ou une commande `curl`.
  const parametres = new URL(requete.url).searchParams;
  let corps: Record<string, unknown> = {};
  if (requete.method === 'POST') {
    try {
      corps = ((await requete.json()) ?? {}) as Record<string, unknown>;
    } catch {
      // Un POST sans corps est une demande de première page, pas une erreur.
    }
  }

  /** Le corps l'emporte quand il porte la clé : c'est la forme explicite. */
  function lire(cle: string): string | null {
    const duCorps = corps[cle];
    if (duCorps !== undefined && duCorps !== null) return String(duCorps);
    return parametres.get(cle);
  }

  const page = entier(lire('page'));
  const taille = entier(lire('taille'));
  if (page === undefined || taille === undefined) {
    return reponse({ erreur: 'CHAMPS_INVALIDES' }, 400, requete);
  }
  // Tout sauf « 1 » ou `true` vaut non : un paramètre mal orthographié ne doit
  // pas ouvrir la vue la plus bruyante par accident.
  const demande = lire('consultations');
  const consultations = demande === '1' || demande === 'true';

  const { data, error } = await service.rpc('super_admin_journal', {
    p_page: page ?? 1,
    p_taille: taille ?? 50,
    p_inclure_consultations: consultations,
  });

  if (error || !data) {
    console.error('super_admin_journal a échoué :', error?.message);
    return reponse({ erreur: 'LECTURE_IMPOSSIBLE' }, 500, requete);
  }

  const lue = data as Page;

  // Après la lecture, jamais avant. Un échec de cette écriture n'annule pas la
  // réponse : la page a déjà été produite, et refuser de la servir ne
  // reprendrait pas ce qui a été lu. Il est journalisé côté serveur, où il se
  // voit.
  const trace = await service.rpc('journaliser_consultation', {
    p_contexte: { page: page ?? 1, taille: taille ?? 50, consultations },
  });
  if (trace.error) {
    console.error('journaliser_consultation a échoué :', trace.error.message);
  }

  return reponse(
    {
      ...lue,
      // Ce que le serveur a réellement appliqué, après ses propres bornes.
      page: Math.max(page ?? 1, 1),
      taille: Math.min(Math.max(taille ?? 50, 1), 200),
    },
    200,
    requete,
  );
});

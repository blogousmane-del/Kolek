import { etatPaiement } from '../_shared/etat-paiement.ts';
import { entetesPour, ouvrir, reponse } from '../_shared/portillon-super-admin.ts';

/**
 * La boutique répond-elle ?
 *
 * L'état déclaré ne suffit pas : une clé présente et fausse se comporte
 * exactement comme une clé absente le jour du premier paiement, et personne ne
 * l'apprend avant. `GET /products` est la lecture la plus inoffensive du
 * contrat (`Docs/Chariow.md` §3.4) — elle n'écrit rien, elle n'engage rien.
 *
 * Trois secondes, et un échec qui ne fait **pas** échouer l'écran : les réglages
 * doivent s'afficher même quand Chariow est en panne. C'est justement le moment
 * où on vient les regarder.
 *
 * 401 et 403 disent « la clé est mauvaise », le reste dit « le service ne va pas
 * ». Les confondre enverrait GTCS régénérer une clé parfaitement correcte.
 */
async function sonderBoutique(
  cleConfiguree: boolean,
): Promise<'joignable' | 'refusee' | 'injoignable' | 'non_configuree'> {
  if (!cleConfiguree) return 'non_configuree';

  try {
    const racine = Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1';
    const appel = await fetch(`${racine}/products`, {
      headers: {
        Authorization: `Bearer ${Deno.env.get('CHARIOW_CLE_API')}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(3000),
    });

    if (appel.ok) return 'joignable';
    return appel.status === 401 || appel.status === 403 ? 'refusee' : 'injoignable';
  } catch {
    return 'injoignable';
  }
}

/**
 * L'état de la plateforme, pour l'écran Super Admin.
 *
 * Deux appels plutôt qu'un : `super_admin_etat()` rend ce qui n'existe que pour
 * cet écran — administrateurs avec leur niveau, codes promo, remises en cours —
 * et `admin_reglages()` rend les volumes et l'état du journal, qu'elle comptait
 * déjà pour l'écran Réglages. Recompter les mêmes lignes dans une seconde
 * fonction SQL aurait donné deux vérités sur la taille de la base.
 *
 * Les deux partent en parallèle : elles ne dépendent pas l'une de l'autre, et
 * l'écran attend la plus lente de toute façon.
 *
 * ## Ce qui n'est pas repris de `admin_reglages`
 *
 * Sa clé `administrateurs`, qui ignore les niveaux. Les clés sont donc choisies
 * une par une plutôt qu'étalées : c'est le seul endroit de ce fichier où
 * énumérer vaut mieux qu'étaler, parce que les deux sources se recouvrent.
 *
 * ## Ce que cette route ne rend jamais
 *
 * Le journal d'audit. Il se lit par sa propre route, paginée et bornée, et sa
 * consultation s'enregistre — trois raisons pour lesquelles il n'a rien à faire
 * dans un état qu'on rafraîchit à chaque ouverture d'écran.
 */

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'GET' && requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const ouverture = await ouvrir(requete);
  if (ouverture instanceof Response) return ouverture;
  const { appelant, service } = ouverture;

  const [etat, reglages] = await Promise.all([
    service.rpc('super_admin_etat'),
    service.rpc('admin_reglages'),
  ]);

  if (etat.error || !etat.data) {
    console.error('super_admin_etat a échoué :', etat.error?.message);
    return reponse({ erreur: 'AGREGATION_IMPOSSIBLE' }, 500, requete);
  }
  if (reglages.error || !reglages.data) {
    console.error('admin_reglages a échoué :', reglages.error?.message);
    return reponse({ erreur: 'AGREGATION_IMPOSSIBLE' }, 500, requete);
  }

  const plateforme = reglages.data as Record<string, unknown>;

  // Ce que l'environnement déclare, puis ce que la boutique répond. La clé ne
  // sort jamais : `etatPaiement` est pure et trois tests mesurent qu'aucune des
  // trois valeurs sensibles ne se retrouve dans sa sortie.
  const paiement = etatPaiement({
    cle: Deno.env.get('CHARIOW_CLE_API'),
    produits: Deno.env.get('CHARIOW_PRODUITS'),
    secretWebhook: Deno.env.get('CHARIOW_SECRET_WEBHOOK'),
  });
  const boutique = await sonderBoutique(paiement.cleConfiguree);

  return reponse(
    {
      ...(etat.data as Record<string, unknown>),
      volumes: plateforme.volumes,
      journal: plateforme.journal,
      postgres: plateforme.postgres,
      paiement: { ...paiement, boutique },
      // L'appelant, pour que l'écran marque « c'est toi » dans la liste des
      // administrateurs sans redemander la session — et parce que c'est la
      // seule ligne sur laquelle aucune action n'est proposée.
      appelant,
    },
    200,
    requete,
  );
});

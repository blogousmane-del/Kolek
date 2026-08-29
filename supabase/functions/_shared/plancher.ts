/**
 * Le plancher de temps de réponse des surfaces publiques.
 *
 * Module sans aucune API Deno, pour la raison désormais établie par le défaut
 * CORS du 2026-08-20 et repris par `debit.ts` : ce qui n'est pas testable finit
 * par être faux. Un plancher mal calculé ne casse rien de visible — la fonction
 * répond, la réinitialisation marche, le parcours de bout en bout passe. Seule
 * la fuite revient, en silence.
 *
 * ## Le défaut, trouvé le 2026-08-29
 *
 * `mot-de-passe-oublie` est bâti tout entier sur une règle : « la réponse ne
 * dépend jamais de l'existence du compte ». Statut identique, corps identique,
 * borne qui rend le nominal plutôt qu'un 429, échec d'envoi qui rend le nominal
 * aussi. Tout cela est juste. Et tout cela regarde le **contenu** de la
 * réponse, jamais sa **durée**.
 *
 * Or les chemins ne coûtent pas la même chose :
 *
 * | Chemin | Travail réel |
 * |---|---|
 * | Borne mordue | un RPC, puis on répond |
 * | Adresse inconnue | RPC + `generateLink` qui échoue |
 * | Adresse connue | RPC + `generateLink` + **un aller-retour HTTPS vers la passerelle de courriel** |
 *
 * Le troisième chemin coûte plusieurs centaines de millisecondes de plus que
 * les deux autres. L'écart se chronomètre depuis n'importe quel navigateur, en
 * boucle, sur une liste d'adresses. L'annuaire des collecteurs de GTCS que le
 * corps de réponse refusait de livrer, l'horloge le livrait.
 *
 * ## Ce que le plancher fait, et ce qu'il ne fait pas
 *
 * Il retient chaque réponse jusqu'à un instant fixe compté depuis l'entrée dans
 * la fonction. Un chemin plus lent que le plancher répond dès qu'il a fini : le
 * plancher est un minimum, pas un quantum. Il aplatit donc l'écart entre les
 * chemins rapides et le chemin lent **tant que le chemin lent reste sous le
 * plancher** — d'où l'importance de le calibrer au-dessus du pire cas observé,
 * et non au-dessus du cas courant.
 *
 * Il ne prétend pas à la constance parfaite : une passerelle en panne franche
 * peut dépasser. Il supprime le signal exploitable en boucle, qui est ce qui
 * transforme une différence de temps en annuaire.
 *
 * ## Calibrer
 *
 * `PLANCHER_REPONSE_MS` sur le projet Supabase, pour corriger sans redéployer
 * le code. Le défaut ci-dessous porte la mesure et la méthode pour la refaire.
 * Une passerelle plus lente, ou un changement d'hébergement, demandent de le
 * reprendre — un plancher calibré une fois et jamais revérifié redevient une
 * supposition.
 */

/**
 * Le défaut, **mesuré** en production le 2026-08-29, pas supposé.
 *
 * Premier jet à 1200 ms, choisi au jugé. La mesure l'a démenti le jour même :
 *
 * | Chemin | Durée observée depuis Abidjan |
 * |---|---|
 * | Adresse mal formée (sort avant le plancher) | 426 ms |
 * | Borné — travail quasi nul, retenu par le plancher | 1525 ms |
 * | Dans le plafond — `consommer_debit` + `generateLink` | 2280 ms |
 *
 * Les 1525 ms prouvent que le plancher retient : sans lui ce chemin sortirait
 * vers 430 ms, comme le témoin. Mais 2280 ms le dépassent de 700 ms — le
 * chemin nominal n'était donc pas couvert, et l'écart subsistait, atténué. Un
 * plancher sous le pire cas ne mesure que la confiance qu'on lui accorde.
 *
 * 3000 ms couvre le chemin observé le plus lent — auquel s'ajoute encore
 * l'appel à la passerelle sur une adresse connue — avec de la marge. C'est
 * long pour un formulaire ; c'est un geste rare, et la seule alternative
 * honnête serait de rendre `generateLink` plus rapide, ce qui n'est pas à
 * notre main.
 *
 * Le mesurer à nouveau : trois appels sur une adresse bien formée et
 * inexistante suffisent à épuiser le plafond, et l'écart entre le troisième et
 * le quatrième donne directement ce que le plancher doit couvrir.
 */
export const PLANCHER_DEFAUT_MS = 3000;

/** Le plafond. Un zéro de trop dans le tableau de bord tiendrait la requête
    ouverte jusqu'au délai de la plateforme, et le formulaire paraîtrait cassé —
    une panne bien plus visible que la fuite qu'on répare. */
export const PLANCHER_MAX_MS = 5000;

/**
 * Ce qu'il reste à attendre pour tenir le plancher.
 *
 * Le résultat est borné des deux côtés. En bas parce qu'un travail plus long
 * que le plancher ne doit pas être ralenti. En haut parce que `Date.now()`
 * recule — ajustement NTP, sortie de veille — et qu'un écart d'horloge négatif
 * ferait attendre l'écart **en plus** du plancher, laissant une requête pendue.
 */
export function resteAAttendre(debut: number, maintenant: number, plancher: number): number {
  if (!(plancher > 0)) return 0;
  const ecoule = maintenant - debut;
  if (ecoule >= plancher) return 0;
  if (ecoule < 0) return plancher;
  return plancher - ecoule;
}

/**
 * Lit le plancher dans l'environnement.
 *
 * Une valeur illisible retombe sur le défaut, jamais sur zéro : une faute de
 * frappe dans le tableau de bord ne doit pas désactiver la mitigation sans que
 * personne ne s'en aperçoive. Un `0` écrit explicitement, lui, est une
 * intention — c'est ce qui permet aux parcours de bout en bout de tourner sans
 * payer le plancher à chaque appel.
 */
export function plancherDepuis(env: Record<string, string | undefined>): number {
  const brut = env.PLANCHER_REPONSE_MS;
  if (brut === undefined || brut.trim() === '') return PLANCHER_DEFAUT_MS;

  const valeur = Number(brut);
  if (!Number.isFinite(valeur) || !Number.isInteger(valeur) || valeur < 0) {
    return PLANCHER_DEFAUT_MS;
  }
  return Math.min(valeur, PLANCHER_MAX_MS);
}

export interface OptionsPlancher {
  /** L'horloge. Injectable pour que le test n'attende rien. */
  maintenant?: () => number;
  /** Le repos. Injectable pour la même raison. */
  dormir?: (ms: number) => Promise<void>;
}

const dormirVraiment = (ms: number) => new Promise<void>((suite) => setTimeout(suite, ms));

/** Retient jusqu'au plancher. À appeler juste avant **chaque** réponse du
    domaine où les chemins divergent — en manquer une seule rouvre la fuite,
    puisqu'il suffit d'un chemin distinguable pour distinguer. */
export async function tenirPlancher(
  debut: number,
  plancher: number,
  options: OptionsPlancher = {},
): Promise<void> {
  const maintenant = options.maintenant ?? Date.now;
  const dormir = options.dormir ?? dormirVraiment;

  const reste = resteAAttendre(debut, maintenant(), plancher);
  if (reste > 0) await dormir(reste);
}

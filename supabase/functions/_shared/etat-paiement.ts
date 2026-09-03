import { PALIERS_PAYANTS } from './chariow.ts';

/**
 * Ce que l'administration peut savoir du paiement, sans jamais en tenir la clé.
 *
 * ## Pourquoi aucun champ de saisie
 *
 * La question posée le 2026-09-02 était « il n'y a pas de place pour la clé API
 * Chariow dans les réglages ». Il ne doit pas y en avoir. Un champ de saisie
 * impose trois choses, toutes mauvaises : la clé traverse le navigateur d'un
 * administrateur, elle se pose quelque part en base, et elle revient à l'écran
 * chaque fois qu'on rouvre la page. Une clé qui encaisse de l'argent ne vit que
 * dans l'environnement des Edge Functions — c'est ce que `verifier-bundles.mjs`
 * applique en refusant tout artefact qui en porterait la trace.
 *
 * Ce qui manque n'est donc pas un champ, c'est une **réponse à la question que
 * l'administrateur se pose vraiment** : le paiement est-il configuré ? Sans cet
 * écran, la seule façon de l'apprendre est qu'un collecteur échoue à payer.
 *
 * ## Pourquoi une fonction pure
 *
 * Aucune API Deno ici, comme dans `chariow.ts` : Vitest peut la charger, donc
 * l'absence de fuite se **mesure** au lieu de se relire. Trois tests
 * n'affirment rien d'autre que « cette chaîne ne se retrouve pas dans la
 * sortie » — la clé, un identifiant de produit, le secret de webhook.
 */

export interface EtatPaiement {
  cleConfiguree: boolean;
  /** Les quatre derniers caractères, ou `null`. Assez pour distinguer deux
      clés au téléphone, pas assez pour en reconstituer une. */
  cleIndice: string | null;
  webhookConfigure: boolean;
  produits: Array<{ palier: string; configure: boolean }>;
}

/** Longueur minimale du secret de webhook. Il voyage dans l'URL : c'est un mot
    de passe qui se promène, et il se traite comme tel. */
const SECRET_MIN = 32;

/**
 * La même variable que `lireProduits`, lue sans jamais lever.
 *
 * `lireProduits` lève sur une configuration incomplète, et c'est le bon
 * comportement pour un checkout : vendre un palier sans produit est pire que
 * refuser. Ici, l'incomplétude est précisément ce qu'on vient afficher — un
 * écran de diagnostic qui lève n'affiche rien, et l'administrateur reste devant
 * une page vide au moment où il cherche ce qui manque.
 */
function produitsDeclares(brut: string | undefined): Record<string, string> {
  if (!brut) return {};
  try {
    const lu = JSON.parse(brut) as unknown;
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return {};
    const table: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(lu as Record<string, unknown>)) {
      if (typeof valeur === 'string' && valeur.trim()) table[cle] = valeur.trim();
    }
    return table;
  } catch {
    return {};
  }
}

export function etatPaiement(env: {
  cle: string | undefined;
  produits: string | undefined;
  secretWebhook: string | undefined;
}): EtatPaiement {
  // `trim` avant tout jugement : une variable posée puis vidée laisse souvent un
  // blanc, et « configurée » enverrait chercher la panne chez Chariow.
  const cle = (env.cle ?? '').trim();
  const produits = produitsDeclares(env.produits);

  return {
    cleConfiguree: cle.length > 0,
    cleIndice: cle.length >= 4 ? cle.slice(-4) : null,
    webhookConfigure: (env.secretWebhook ?? '').trim().length >= SECRET_MIN,
    produits: PALIERS_PAYANTS.map((palier) => ({
      palier,
      configure: Boolean(produits[palier]),
    })),
  };
}

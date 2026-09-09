/**
 * Le garde-fou de cible de la suite de tests de base.
 *
 * ## Pourquoi il existe
 *
 * Le 2026-09-09, en cherchant ce qui pouvait abîmer les données des collecteurs
 * en activité, un chemin a été mesuré plutôt que supposé :
 *
 * ```
 * $ SUPABASE_URL=https://production.supabase.co node -e \
 *     "process.loadEnvFile('.env.test'); console.log(process.env.SUPABASE_URL)"
 * https://production.supabase.co
 * ```
 *
 * `process.loadEnvFile()` **n'écrase pas** une variable déjà posée dans
 * l'environnement. `npm run db:env` réécrit pourtant `supabase/tests/.env.test`
 * depuis `supabase status`, qui est local par construction : le fichier est
 * juste, il perd contre le shell. Il suffit d'avoir exporté `SUPABASE_URL` et
 * `SUPABASE_SERVICE_ROLE_KEY` une fois — pour `verifier:en-ligne`, pour un
 * débogage — puis de lancer `npm run test:db` dans le même terminal.
 *
 * ## Ce que ça coûterait
 *
 * `supabase/tests/avis-drainage.test.ts` porte, dans un `beforeEach` — donc
 * avant **chaque** test du fichier :
 *
 * ```ts
 * await admin.from('avis_clients').delete().not('id', 'is', null);
 * ```
 *
 * `admin` porte la clé de service : RLS est contournée, et `not id is null`
 * désigne toutes les lignes. Contre la production, cette ligne vide
 * `avis_clients` pour tous les collecteurs.
 *
 * ## Ce qu'on ne corrige pas
 *
 * Le test. Son balayage est global parce que la réservation qu'il éprouve l'est
 * — le borner par collecteur invaliderait ce qu'il prouve. Les autres
 * suppressions du harnais sont déjà bornées. Le défaut n'est pas le balayage,
 * c'est qu'aucune ligne du dépôt ne dit **contre quelle base** il balaie.
 *
 * ## Liste d'autorisation, et pourquoi ici et pas ailleurs
 *
 * `verifier-bundles.mjs` refuse une liste de suffixes et autorise le reste.
 * Celui-ci fait l'inverse. Ce n'est pas une incohérence : la règle constante est
 * d'**énumérer le côté qui est fini**. Là-bas, les suffixes de sauvegarde se
 * comptent et les noms légitimes sont sans limite. Ici, les adresses de
 * bouclage se comptent sur une main et les adresses distantes sont sans limite.
 *
 * ## Pourquoi on analyse l'adresse au lieu d'y chercher un motif
 *
 * Une comparaison par `includes('127.0.0.1')` accepterait
 * `https://127.0.0.1.attaquant.com`, dont l'hôte réel est `attaquant.com`.
 * `new URL()` rend l'hôte exact, et c'est lui qu'on compare.
 */

/** Les seules cibles admises. `supabase status` rend la première. */
const HOTES_LOCAUX = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * Rend la liste des reproches. Vide = cible acceptable.
 *
 * Fonction pure et exportée : c'est elle qui porte la décision, et c'est elle
 * que les tests exercent. Le fichier de mise en place ne fait que la brancher.
 */
export function verifierCible(url) {
  if (!url) {
    return [
      'SUPABASE_URL est absente. La suite de base ne peut pas deviner sa cible, ' +
        'et refuse d’en essayer une.',
    ];
  }

  let hote;
  try {
    hote = new URL(url).hostname;
  } catch {
    return [`SUPABASE_URL n’est pas une adresse analysable : ${url}`];
  }

  if (HOTES_LOCAUX.has(hote)) return [];

  return [
    `La suite de base vise ${url}, qui n’est pas la pile locale.\n` +
      '\n' +
      'Elle utilise la clé de rôle service — RLS est contournée — et elle vide ' +
      'des tables entières entre deux tests. Contre une base réelle, elle ' +
      'détruit les données des collecteurs.\n' +
      '\n' +
      'Cause la plus probable : SUPABASE_URL est exportée dans ce terminal. ' +
      '`process.loadEnvFile` ne l’écrase pas, donc `npm run db:env` ne suffit ' +
      'pas à la corriger. Retirez-la de l’environnement (`unset SUPABASE_URL ' +
      'SUPABASE_SERVICE_ROLE_KEY`), puis relancez.',
  ];
}

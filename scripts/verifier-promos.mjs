import { pathToFileURL } from 'node:url';

// Les deux catalogues de codes de remise disent-ils la même chose ?
//
//   node scripts/verifier-promos.mjs        (npm run verifier:promos)
//
// Kolek garde ses codes dans `codes_promo` ; Chariow garde les siens dans sa
// boutique, et c'est LUI qui applique la remise au moment de payer. Le checkout
// se contente d'envoyer le code. Si les deux pourcentages divergent, le
// collecteur lit -20 % dans l'application et se fait débiter autre chose.
//
// Ce n'est pas un défaut d'affichage : c'est un litige commercial. L'en-tête de
// `packages/core/src/paliers.ts` le nomme déjà pour les prix ; ici c'est pire,
// la divergence est entre ce que Kolek promet et ce que le collecteur paie.
//
// Sortie non nulle à la première divergence. À lancer après chaque changement
// de code, des deux côtés.

const CHARIOW_API_URL = process.env.CHARIOW_API_URL ?? 'https://api.chariow.com/v1';

/**
 * La comparaison, séparée des deux lectures pour être testable sans clé d'API.
 *
 * Les codes sont comparés en majuscules : `codes_promo_code_check` les impose
 * chez nous, rien ne les impose chez Chariow, et une divergence de casse serait
 * une fausse alerte — le pire résultat possible pour un contrôle qu'on veut voir
 * tourner à chaque déploiement.
 */
export function comparer(internes, distants) {
  const parCode = new Map(distants.map((d) => [String(d.code).toUpperCase(), Number(d.percent)]));
  const vus = new Set();
  const divergences = [];

  for (const { code, remise_pct } of internes) {
    const cle = String(code).toUpperCase();
    vus.add(cle);
    const distant = parCode.get(cle);

    if (distant === undefined) {
      divergences.push({ code: cle, genre: 'absent', interne: Number(remise_pct) });
    } else if (distant !== Number(remise_pct)) {
      divergences.push({ code: cle, genre: 'divergent', interne: Number(remise_pct), distant });
    }
  }

  for (const [cle, distant] of parCode) {
    if (!vus.has(cle)) divergences.push({ code: cle, genre: 'inconnu', distant });
  }

  return divergences;
}

/**
 * Les codes de Kolek qui peuvent encore servir.
 *
 * `valide_au >= aujourd'hui` seulement : un code expiré ne s'applique plus, et
 * le signaler ferait du bruit à chaque campagne terminée — un contrôle bruyant
 * finit par n'être plus lu. Les codes à venir, eux, sont inclus : leur
 * divergence compte dès maintenant, puisqu'on la corrige avant qu'ils ne
 * servent.
 */
async function lireInternes(url, cleService) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const reponse = await fetch(
    `${url}/rest/v1/codes_promo?select=code,remise_pct,valide_au&valide_au=gte.${aujourdhui}`,
    { headers: { apikey: cleService, Authorization: `Bearer ${cleService}` } },
  );
  if (!reponse.ok) throw new Error(`Kolek a répondu ${reponse.status}`);
  return reponse.json();
}

async function lireDistants(cleApi) {
  const reponse = await fetch(`${CHARIOW_API_URL}/discounts?status=active`, {
    headers: { Authorization: `Bearer ${cleApi}`, Accept: 'application/json' },
  });
  if (!reponse.ok) throw new Error(`Chariow a répondu ${reponse.status}`);
  const corps = await reponse.json();
  return corps.data ?? [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.SUPABASE_URL;
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cleApi = process.env.CHARIOW_CLE_API;

  if (!url || !cleService || !cleApi) {
    console.error(
      'Il manque SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou CHARIOW_CLE_API. ' +
        'Ce contrôle interroge les deux catalogues : sans les deux clés, il ne peut rien affirmer.',
    );
    process.exit(1);
  }

  const [internes, distants] = await Promise.all([
    lireInternes(url, cleService),
    lireDistants(cleApi),
  ]);
  const divergences = comparer(internes, distants);

  if (divergences.length === 0) {
    console.log(`Les ${internes.length} code(s) de Kolek correspondent à ceux de Chariow.`);
    process.exit(0);
  }

  console.error(`${divergences.length} divergence(s) entre les deux catalogues de remises :`);
  for (const d of divergences) {
    if (d.genre === 'absent') {
      console.error(`  - ${d.code} : Kolek promet -${d.interne} %, Chariow ne connaît pas ce code.`);
    } else if (d.genre === 'divergent') {
      console.error(`  - ${d.code} : Kolek -${d.interne} %, Chariow -${d.distant} %.`);
    } else {
      console.error(`  - ${d.code} : -${d.distant} % chez Chariow, inconnu de Kolek.`);
    }
  }
  process.exit(1);
}

import { verifierCible } from '../../scripts/garde-base-locale.mjs';

process.loadEnvFile('supabase/tests/.env.test');

// `loadEnvFile` n'écrase pas une variable déjà posée dans l'environnement : le
// fichier ci-dessus, pourtant réécrit en local par `npm run db:env`, perd contre
// un `SUPABASE_URL` exporté dans le shell. On contrôle donc la valeur
// **effective**, après chargement, et non ce que le fichier contient.
//
// Ce qui est en jeu tient en une ligne d'`avis-drainage.test.ts` :
// `admin.from('avis_clients').delete().not('id','is',null)`, dans un
// `beforeEach`, avec la clé de rôle service. Voir `scripts/garde-base-locale.mjs`.
const reproches = verifierCible(process.env.SUPABASE_URL);
if (reproches.length > 0) {
  throw new Error(`\n\n${reproches.join('\n')}\n`);
}

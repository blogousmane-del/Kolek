// Le DNS, avant tout le reste.
//
// Pendant une propagation, « est-ce que ça répond ? » se pose toutes les dix
// minutes — et se répond mal à l'œil. Deux raisons, et aucune n'est évidente :
//
// 1. **Le cache négatif.** Une adresse interrogée *avant* la création de son
//    enregistrement fait mémoriser au résolveur qu'elle n'existe pas, pour la
//    durée déclarée par le SOA de la zone. On regarde ensuite un DNS déjà juste
//    en croyant qu'il ne l'est pas.
// 2. **Le doublon.** Hostinger pose de son propre chef un `A` vers sa page
//    d'attente. Le laisser en place donne deux `A` sur l'apex, et le visiteur
//    tombe une fois sur deux sur « domaine réservé ». Une résolution unique
//    répond « oui » et ne dit rien du second.
//
// Ce script interroge un résolveur public par défaut — pas celui du poste, qui
// est justement celui qui ment — et compare l'ensemble des réponses, pas la
// première.
//
//   node scripts/verifier-dns.mjs             # via 1.1.1.1
//   node scripts/verifier-dns.mjs --systeme   # via le résolveur du poste
//
// Sortie non nulle tant qu'un enregistrement manque ou diverge.

import { Resolver } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

/** Le résolveur interrogé par défaut. Public, et hors du cache du poste. */
export const RESOLVEUR_PUBLIC = '1.1.1.1';

/**
 * Ce que la zone doit contenir.
 *
 * L'apex prend un `A` et non un `CNAME` : la spécification interdit un `CNAME`
 * à la racine d'une zone, et Hostinger le refuserait. C'est la raison pour
 * laquelle Netlify publie une IP de répartiteur — à relire dans son tableau de
 * bord si ce contrôle échoue sur l'apex seul, une IP recopiée vieillit.
 */
export const ATTENDUS = [
  { hote: 'kolek.cash', type: 'A', valeur: '75.2.60.5' },
  { hote: 'www.kolek.cash', type: 'CNAME', valeur: 'kolek-site.netlify.app' },
  { hote: 'app.kolek.cash', type: 'CNAME', valeur: 'kolek-collecteur.netlify.app' },
  { hote: 'admin.kolek.cash', type: 'CNAME', valeur: 'kolek-admin.netlify.app' },
];

/**
 * Met un nom d'hôte sous une forme comparable.
 *
 * Un résolveur rend le nom pleinement qualifié — point de la racine compris — et
 * ne garantit pas la casse. Comparer les chaînes brutes ferait échouer un DNS
 * parfaitement juste, ce qui est la pire façon de perdre une heure.
 */
export function normaliser(valeur) {
  return String(valeur).trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Ce qui manque, ou ce qui diverge, dans un relevé de zone.
 *
 * Fonction pure : elle reçoit des réponses déjà obtenues plutôt que d'interroger
 * elle-même. C'est ce qui permet de la vérifier sur les trois cas qui comptent —
 * absence, valeur fausse, doublon — sans dépendre du réseau du poste.
 */
export function manquesDns(observe, attendus = ATTENDUS) {
  const manques = [];

  for (const { hote, type, valeur } of attendus) {
    const trouves = observe[hote]?.[type];

    if (!trouves || trouves.length === 0) {
      manques.push(`${hote} — ${type} introuvable`);
      continue;
    }

    if (trouves.length > 1) {
      // Le cas Hostinger. On le nomme, parce qu'un « valeur inattendue » ferait
      // corriger la bonne ligne au lieu de supprimer la mauvaise.
      manques.push(
        `${hote} — ${trouves.length} enregistrements ${type} : ${trouves.join(', ')}. ` +
          "Un seul est attendu — supprimer l'enregistrement de parking.",
      );
      continue;
    }

    if (normaliser(trouves[0]) !== normaliser(valeur)) {
      manques.push(`${hote} — ${type} vaut ${trouves[0]}, attendu ${valeur}`);
    }
  }

  return manques;
}

/** Interroge un résolveur pour chaque enregistrement attendu. */
async function relever(attendus, serveur) {
  const resolveur = new Resolver();
  if (serveur) resolveur.setServers([serveur]);

  const observe = {};
  for (const { hote, type } of attendus) {
    observe[hote] ??= {};
    try {
      observe[hote][type] =
        type === 'A' ? await resolveur.resolve4(hote) : await resolveur.resolveCname(hote);
    } catch {
      // `ENOTFOUND` comme `ENODATA` disent la même chose ici : l'enregistrement
      // n'est pas publié. On laisse la clé absente, et `manquesDns` le formule.
      // Distinguer les deux codes n'apporterait rien à qui attend une
      // propagation.
    }
  }
  return observe;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const serveur = process.argv.includes('--systeme') ? null : RESOLVEUR_PUBLIC;
  const source = serveur ?? 'le résolveur du système';

  const manques = manquesDns(await relever(ATTENDUS, serveur));

  if (manques.length === 0) {
    console.log(`Le DNS répond, d'après ${source}. Les quatre enregistrements sont en place.`);
    process.exit(0);
  }

  console.error(`Le DNS n'est pas prêt, d'après ${source} :`);
  for (const manque of manques) console.error(`  x ${manque}`);
  console.error(
    "\nSi ces enregistrements viennent d'être créés, attendre et relancer : un " +
      'résolveur garde en mémoire une réponse négative aussi longtemps qu’une positive.',
  );
  process.exit(1);
}

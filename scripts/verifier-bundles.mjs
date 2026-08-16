import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MOTIFS = [
  { nom: 'libellé service_role', regex: /service_role/ },
  {
    nom: 'JWT de rôle service',
    // Trois alternatives car le fragment base64 de "service_role" dépend de
    // son décalage d'octet dans le payload JSON (dépend des champs qui le
    // précèdent) — un JWT Supabase réel n'utilise pas toujours le même.
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*(c2VydmljZV9yb2xl|cnZpY2Vfcm9s|ZXJ2aWNlX3Jv)/,
  },
];

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

/** Renvoie la liste des fuites trouvées sous `dossier`. */
export function chercherFuites(dossier) {
  if (!existsSync(dossier)) return [];

  const fuites = [];
  for (const chemin of fichiers(dossier)) {
    const contenu = readFileSync(chemin, 'utf8');
    for (const motif of MOTIFS) {
      if (motif.regex.test(contenu)) {
        fuites.push({ chemin, motif: motif.nom });
      }
    }
  }
  return fuites;
}

// La détection du JWT par motif base64 est un filet secondaire : le contrôle
// qui compte est le libellé service_role, présent dans toute clé de service.

// Comparaison via pathToFileURL plutôt qu'un gabarit `file://${...}` : ce
// dernier échoue sous Windows (séparateurs `\`, absence d'encodage URL), ce
// qui empêche silencieusement le bloc CLI de s'exécuter.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dossiers = ['apps/collecteur/dist', 'apps/admin/dist'];
  const fuites = dossiers.flatMap(chercherFuites);

  if (fuites.length > 0) {
    console.error('Clé de service détectée dans un artefact de build :');
    for (const f of fuites) console.error(`  ${f.chemin} — ${f.motif}`);
    process.exit(1);
  }
  console.log('Aucune fuite de clé de service dans les artefacts.');
}

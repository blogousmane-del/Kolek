import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exporté : `verifier-en-ligne.mjs` applique les mêmes motifs, mais aux
// fichiers réellement servis par Netlify plutôt qu'au dossier `dist` local.
export const MOTIFS = [
  { nom: 'libellé service_role', regex: /service_role/ },
  {
    nom: 'JWT de rôle service',
    // Trois alternatives car le fragment base64 de "service_role" dépend de
    // son décalage d'octet dans le payload JSON (dépend des champs qui le
    // précèdent) — un JWT Supabase réel n'utilise pas toujours le même.
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*(c2VydmljZV9yb2xl|cnZpY2Vfcm9s|ZXJ2aWNlX3Jv)/,
  },
  { nom: 'clé secrète Supabase', regex: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  // La forme du jeton Chariow n'est pas documentée, donc on ne la cherche pas :
  // on cherche l'**usage** qui la ferait fuir. Le front n'appelle jamais
  // Chariow — il passe par une Edge Function, qui seule détient la clé. Une
  // adresse du fournisseur dans un artefact signifie qu'un appel part du
  // navigateur, et un appel authentifié depuis le navigateur emporte la clé.
  //
  // L'hôte d'API et lui seul : la page de paiement hébergée, dont l'adresse
  // vient de la réponse `checkout_url`, vit ailleurs, et un motif sur le nom du
  // fournisseur refuserait un jour le seul chemin de paiement prévu.
  { nom: 'appel direct à Chariow', regex: /api\.chariow\.com/ },
  // Et le cas franc : quelqu'un a préfixé la clé d'un `VITE_`, ce qui la publie
  // quel que soit le nom du fichier où elle est écrite. Les deux autres préfixes
  // pour le jour où un écran serait porté sous Next ou Create React App.
  { nom: 'clé Chariow exposée', regex: /(VITE|REACT_APP|NEXT_PUBLIC)_CHARIOW/ },
];

/** Renvoie les noms des motifs de fuite trouvés dans un texte. */
export function chercherFuitesTexte(texte) {
  return MOTIFS.filter((motif) => motif.regex.test(texte)).map((motif) => motif.nom);
}

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
  // Toute application publiée entre ici. Le site public n'appelle aucune API
  // aujourd'hui, mais un artefact non contrôlé est un artefact où une clé peut
  // arriver sans que personne ne le voie.
  const dossiers = ['apps/collecteur/dist', 'apps/admin/dist', 'apps/site/dist'];

  const manquants = dossiers.filter((dossier) => !existsSync(dossier));
  if (manquants.length > 0) {
    console.error('Dossier de build absent — le contrôle ne peut pas passer en silence :');
    for (const dossier of manquants) console.error(`  ${dossier}`);
    process.exit(1);
  }

  const fuites = dossiers.flatMap(chercherFuites);

  if (fuites.length > 0) {
    console.error('Fuite détectée dans un artefact de build :');
    for (const f of fuites) console.error(`  ${f.chemin} — ${f.motif}`);
    process.exit(1);
  }
  console.log('Aucune fuite dans les artefacts.');
}

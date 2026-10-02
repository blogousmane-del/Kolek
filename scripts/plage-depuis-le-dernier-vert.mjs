import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Qu'est-ce qui a changé sous un chemin depuis le dernier run vert de `main` ?
 *
 *   node scripts/plage-depuis-le-dernier-vert.mjs --chemin supabase/functions \
 *     --depuis <commit du dernier run vert> --jusqua <commit poussé>
 *
 * Lu par `.github/workflows/verification.yml`, pour décider du déploiement des
 * Edge Functions et du rappel des migrations.
 *
 * ## Le défaut que ce script ferme
 *
 * Les deux jobs mesuraient leur plage depuis la poussée précédente :
 * `github.event.before` pour les fonctions, `HEAD~1` pour les migrations. Or
 * une poussée sur `main` n'a pas toujours son run. Le 2026-10-02, la #18 et la
 * #19 ont été fusionnées à deux minutes d'écart : le run de la première a été
 * annulé par la seconde, et la seconde a comparé sa propre fusion à la
 * première. Ce que la #18 apportait sous `supabase/` n'entrait dans aucune
 * plage — un déploiement sauté, avec un CI vert pour le dire. C'est la faute du
 * 2026-09-09 sous une autre forme.
 *
 * Ce jour-là la #18 n'apportait rien sous `supabase/`, et le trou est resté
 * sans effet. Ne plus annuler les runs de `main` ne suffit pas à le fermer :
 * GitHub ne garde qu'une exécution en attente par groupe, et une troisième
 * poussée remplace la deuxième, qui ne tourne alors jamais.
 *
 * ## La base
 *
 * Le commit du dernier run **vert** de `verification.yml` sur une poussée vers
 * `main`, que le workflow lit dans l'API de GitHub. Un run vert y veut dire :
 * testé, et déployé ou rien à déployer. Un run annulé, remplacé ou rouge ne
 * fait pas avancer la base : la plage suivante reprend ce qu'il n'a pas fait.
 *
 * ## Le repli couvre, il ne saute pas
 *
 * Base absente, introuvable dans l'historique, ou qui n'est plus un ancêtre de
 * la tête : la plage est déclarée incertaine, et touchée. Même règle que le
 * 2026-09-09 — redéployer pour rien remplace du code par le même code, sauter
 * un déploiement laisse la production en arrière sans que rien ne le dise.
 */

/**
 * @param {object} p
 * @param {string} p.depuis Le commit du dernier run vert, ou une chaîne vide.
 * @param {string} [p.jusqua] Le commit poussé.
 * @param {string} p.chemin Le chemin dont on veut savoir s'il a changé.
 * @param {string} [p.depot] Le répertoire du dépôt.
 * @returns {{ touche: boolean, certaine: boolean, raison: string, fichiers: string[] }}
 */
export function plage({ depuis, jusqua = 'HEAD', chemin, depot = process.cwd() }) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: depot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const incertaine = (raison) => ({
    touche: true,
    certaine: false,
    raison: `${raison} La plage couvre tout, par précaution.`,
    fichiers: [],
  });

  if (!depuis) return incertaine("Base inconnue : aucun run vert sur main, ou l'API n'a pas répondu.");

  // Quand l'API échoue, `gh api` écrit le corps de l'erreur sur sa sortie
  // standard : sans ce contrôle, un JSON d'erreur passerait pour un commit.
  if (!/^[0-9a-f]{7,40}$/.test(depuis)) {
    return incertaine(`La base reçue n'est pas une empreinte de commit : ${depuis.slice(0, 80)}.`);
  }

  try {
    git('cat-file', '-e', `${depuis}^{commit}`);
  } catch {
    return incertaine(`Le commit du dernier run vert, ${depuis}, est introuvable dans l'historique.`);
  }

  try {
    git('merge-base', '--is-ancestor', depuis, jusqua);
  } catch {
    return incertaine(`${depuis} n'est pas un ancêtre de ${jusqua} : l'historique a été réécrit.`);
  }

  let sortie;
  try {
    sortie = git('diff', '--name-only', depuis, jusqua, '--', chemin);
  } catch {
    return incertaine(`git diff a échoué entre ${depuis} et ${jusqua}.`);
  }

  const fichiers = sortie ? sortie.split('\n') : [];
  const de = depuis.slice(0, 7);
  return fichiers.length
    ? {
        touche: true,
        certaine: true,
        raison: `${fichiers.length} fichier(s) sous ${chemin} depuis le dernier run vert (${de}) :`,
        fichiers,
      }
    : {
        touche: false,
        certaine: true,
        raison: `Rien sous ${chemin} depuis le dernier run vert (${de}).`,
        fichiers,
      };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  /** La valeur qui suit `--nom`, une chaîne vide si elle manque, `undefined` sans l'option. */
  const option = (nom) => {
    const i = process.argv.indexOf(`--${nom}`);
    return i < 0 ? undefined : (process.argv[i + 1] ?? '');
  };

  const chemin = option('chemin');
  if (!chemin) {
    console.error(
      'Usage : node scripts/plage-depuis-le-dernier-vert.mjs --chemin <chemin> --depuis <commit> [--jusqua <commit>]',
    );
    process.exit(2);
  }

  const resultat = plage({
    depuis: option('depuis') ?? '',
    jusqua: option('jusqua') || process.env.GITHUB_SHA || 'HEAD',
    chemin,
  });

  console.log(resultat.raison);
  for (const fichier of resultat.fichiers) console.log(`  ${fichier}`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `touche=${resultat.touche ? 'oui' : 'non'}\ncertaine=${resultat.certaine ? 'oui' : 'non'}\n`,
    );
  }
}

/**
 * Export CSV des tableaux de l'administration.
 *
 * Trois boutons « Exporter » étaient éteints depuis l'origine. Ils le sont
 * restés longtemps pour une bonne raison — un bouton qui ne fait rien vaut mieux
 * qu'un bouton qui produit un fichier faux — mais l'export lui-même n'a rien de
 * compliqué : les données sont déjà en mémoire, entièrement, puisque l'écran les
 * affiche.
 *
 * ## Les décisions qui font qu'un CSV s'ouvre correctement à Abidjan
 *
 * **Le point-virgule, pas la virgule.** Excel en configuration francophone
 * découpe sur le point-virgule ; avec des virgules, tout atterrit dans la
 * première colonne et l'exploitant conclut que l'export est cassé.
 *
 * **Une BOM UTF-8 en tête.** Sans elle, Excel lit le fichier en codage local et
 * « Adjamé » devient « AdjamÃ© ». Les noms de marchés et de clients ivoiriens
 * sont pleins d'accents ; c'est la première chose qu'on verrait.
 *
 * **Les montants en nombres bruts, sans séparateur de milliers ni « FCFA ».**
 * Un CSV se recalcule. `2 000 FCFA` est du texte pour un tableur, `2000` est un
 * nombre — et le destinataire de cet export veut faire des sommes.
 *
 * **Les dates en ISO.** Elles se trient. `21/08/2026` ne se trie pas.
 */

/** Échappe une valeur pour le format CSV. */
function champ(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  const texte = String(valeur);
  // Guillemets, séparateur ou saut de ligne : la valeur doit être encadrée, et
  // ses guillemets doublés. Sans ça, un nom de marché contenant un point-virgule
  // décalerait toutes les colonnes suivantes de cette ligne — et d'elle seule,
  // ce qui rend le défaut particulièrement difficile à voir.
  if (/[";\n\r]/.test(texte)) return `"${texte.replace(/"/g, '""')}"`;
  return texte;
}

export function versCsv(entetes: string[], lignes: Array<Array<unknown>>): string {
  return [entetes, ...lignes].map((ligne) => ligne.map(champ).join(';')).join('\r\n');
}

/**
 * Déclenche le téléchargement d'un CSV.
 *
 * `URL.revokeObjectURL` n'est pas une politesse : sans lui, le blob reste en
 * mémoire tant que l'onglet vit, et un administrateur qui exporte plusieurs fois
 * dans la journée les accumule tous.
 */
export function telechargerCsv(nomFichier: string, contenu: string): void {
  // ﻿ : la marque d'ordre des octets. Voir l'explication en tête de module.
  const blob = new Blob([`﻿${contenu}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);

  URL.revokeObjectURL(url);
}

/** Horodatage court pour les noms de fichiers : `kolek-collecteurs-2026-08-21.csv`. */
export function dateDuJour(): string {
  return new Date().toISOString().slice(0, 10);
}

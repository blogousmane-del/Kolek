/**
 * Où va chaque module au moment de la construction.
 *
 * Passé à `build.rollupOptions.output.manualChunks` par les trois applications.
 *
 * ## Pourquoi découper les bibliothèques et non les écrans
 *
 * L'audit du 2026-09-09 relevait un seul morceau de 565 ko par application et
 * suggérait de passer les écrans lourds en `import()` dynamique. La mesure
 * corrige la conclusion : le service worker du collecteur **précharge tout** ce
 * que la construction produit — vérifié dans `dist/sw.js`. Un écran chargé à la
 * demande serait donc téléchargé quand même, pendant l'installation, et la
 * première visite ne coûterait pas un octet de moins. Le découpage par écran
 * n'améliore que le temps avant interaction.
 *
 * Le préchargement est en revanche révisionné **par URL**. Un morceau dont le
 * contenu n'a pas bougé garde son nom haché, et workbox ne le retélécharge pas
 * à la mise à jour suivante. Sortir React et `supabase-js` — qui ne changent
 * qu'aux montées de version — retire donc leur poids de chaque mise à jour.
 *
 * Mesuré sur le collecteur : 158 ko compressés en un seul morceau, devenus
 * 45 ko de code applicatif plus deux morceaux stables. Une correction livrée
 * coûte 45 ko au lieu de 158, sur une connexion mobile d'Abidjan.
 *
 * ## Pourquoi une fonction partagée
 *
 * Trois copies de huit lignes dérivent. Celle-ci est en plus **pure**, donc
 * éprouvée par des tests plutôt que par une lecture de la sortie de build — et
 * le cas qui compte, les chemins Windows, ne se voit pas autrement : sans
 * normalisation des barres, aucun motif ne mord et la construction reste verte
 * en ne découpant rien.
 */

/** Les paquets qui forment le socle React. Bornés, pas cherchés en sous-chaîne. */
const SOCLE_REACT = new Set(['react', 'react-dom', 'scheduler']);

/**
 * Le nom du morceau pour ce module, ou `undefined` pour le laisser dans le
 * morceau applicatif.
 */
export function decouperLib(id) {
  const chemin = id.split('\\').join('/');
  const apres = chemin.split('/node_modules/').pop();
  if (apres === chemin) return undefined;

  const segments = apres.split('/');
  const paquet = segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];

  if (paquet === '@supabase/supabase-js') return 'lib-supabase';
  if (SOCLE_REACT.has(paquet)) return 'lib-react';
  return undefined;
}

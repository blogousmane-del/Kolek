import { describe, expect, it } from 'vitest';
import { decouperLib } from './decouper-lib.mjs';

/**
 * Le découpage des bibliothèques, et pourquoi il vaut mieux que le découpage
 * des écrans.
 *
 * Le service worker du collecteur précharge **tout** ce que la construction
 * produit — neuf entrées, mesurées dans `dist/sw.js`. Passer les écrans lourds
 * en `import()`, ce que l'audit du 2026-09-09 suggérait, ne retire donc pas un
 * octet à la première installation : workbox les téléchargerait de toute façon
 * pendant l'installation. Ça n'améliore que le temps avant interaction.
 *
 * Le préchargement est en revanche **révisionné par URL**. Un morceau dont le
 * contenu n'a pas bougé garde son nom haché et n'est pas retéléchargé à la mise
 * à jour suivante. Sortir React et `supabase-js`, qui ne changent qu'aux montées
 * de version, retire donc leur poids de chaque mise à jour du produit.
 *
 * Mesuré sur le collecteur : 158 ko compressés en un seul morceau, devenus
 * 45 ko de code applicatif plus deux morceaux stables. Une correction livrée au
 * collecteur coûte désormais 45 ko au lieu de 158.
 */
describe('decouperLib', () => {
  it('range supabase-js dans son propre morceau', () => {
    expect(decouperLib('/projet/node_modules/@supabase/supabase-js/dist/module/index.js')).toBe(
      'lib-supabase',
    );
  });

  it('range react et react-dom ensemble', () => {
    expect(decouperLib('/projet/node_modules/react/index.js')).toBe('lib-react');
    expect(decouperLib('/projet/node_modules/react-dom/client.js')).toBe('lib-react');
  });

  it('emmène scheduler avec react', () => {
    // `scheduler` est une dépendance interne de react-dom. Laissée dans le
    // morceau applicatif, elle le ferait changer de hachage à chaque montée de
    // version de React — exactement ce que ce découpage cherche à éviter.
    expect(decouperLib('/projet/node_modules/scheduler/index.js')).toBe('lib-react');
  });

  it('ne prend pas un paquet dont le nom contient seulement « react »', () => {
    // Le piège d'une comparaison par sous-chaîne : ces deux-là partiraient dans
    // `lib-react` et le feraient changer à chaque montée de version d'une
    // bibliothèque qui n'est pas React.
    expect(decouperLib('/projet/node_modules/react-hook-form/dist/index.js')).toBeUndefined();
    expect(decouperLib('/projet/node_modules/@tanstack/react-query/build/index.js')).toBeUndefined();
  });

  it('laisse le code du dépôt dans le morceau applicatif', () => {
    expect(decouperLib('/projet/apps/collecteur/src/ecrans/Clients.tsx')).toBeUndefined();
    expect(decouperLib('/projet/packages/ui/src/Bouton.tsx')).toBeUndefined();
  });

  it('reconnaît les chemins Windows', () => {
    // Rollup rend des identifiants à barres inversées sur ce poste. Sans
    // normalisation, aucun motif ne mordrait et le découpage serait
    // silencieusement inopérant — une construction verte qui ne découpe rien.
    expect(decouperLib('C:\\projet\\node_modules\\@supabase\\supabase-js\\dist\\index.js')).toBe(
      'lib-supabase',
    );
    expect(decouperLib('C:\\projet\\node_modules\\react\\index.js')).toBe('lib-react');
  });
});

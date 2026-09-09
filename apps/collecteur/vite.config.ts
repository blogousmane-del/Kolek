import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error — module JavaScript partagé, hors du graphe TypeScript des applications.
import { decouperLib } from '../../scripts/decouper-lib.mjs';
// @ts-expect-error — même raison.
import { gardeEnv } from '../../scripts/garde-env.mjs';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // ## Pourquoi séparer les bibliothèques, et pourquoi pas découper les écrans
  //
  // Le service worker précharge **tout** ce que la construction produit : sept
  // entrées, mesurées dans `dist/sw.js`. Passer les écrans lourds en `import()`
  // — ce que l'audit du 2026-09-09 suggérait — ne retirerait donc pas un octet
  // à la première installation, puisque workbox les téléchargerait quand même
  // pendant l'installation. Ça n'améliore que le temps avant interaction.
  //
  // Ce qui réduit vraiment la donnée est ailleurs. Le préchargement est
  // révisionné par URL : un morceau dont le contenu n'a pas changé garde son
  // nom haché et n'est **pas** retéléchargé à la mise à jour suivante. Sortir
  // React et `supabase-js` — qui ne bougent qu'aux montées de version — retire
  // donc leur poids de chaque mise à jour du produit.
  //
  // C'est le bon calcul pour ce produit : le collecteur installe une fois et
  // met à jour souvent, sur une connexion mobile d'Abidjan.
  build: {
    rollupOptions: {
      output: { manualChunks: decouperLib },
    },
  },
  plugins: [
    // En tête, comme dans les deux autres applications : il lève dans le hook
    // `config`, avant que quoi que ce soit ne soit écrit dans `dist/`.
    //
    // Il était importé sans être posé — de la ligne 6 jusqu'ici, rien. L'import
    // mort rendait la ligne crédible à la relecture, et `oxlint` le signalait
    // depuis toujours sans que personne ne lise sa sortie : aucun script ne le
    // lançait. Constaté le 2026-09-09.
    gardeEnv(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Le nouveau service worker prend la main sans attendre la fermeture
        // de tous les onglets, et `src/maj-service-worker.ts` recharge alors
        // l'écran. Sans ces trois lignes, une version corrigée n'atteint le
        // collecteur qu'au deuxième lancement de l'application.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Kolek — Collecteur',
        short_name: 'Kolek',
        description: 'Carnet de collecte numérique, hors-ligne d’abord',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        // `canvas` et `primary` de `tokens.ts`, recopiés ici parce que ce
        // fichier est bâti sous `moduleResolution: node16`, où un import de
        // `packages/core` demande une extension que la source n'a pas.
        //
        // Le manifeste a porté `#FBFAF6` du 2026-09-04 au 2026-09-09 — le
        // jeton `paper`, supprimé le 4 : l'écran de démarrage de l'application
        // installée est resté cinq jours la dernière surface du produit peinte
        // dans une couleur que le Design System ne connaissait plus. Invisible
        // parce qu'elle ne vit dans aucune feuille de style et ne réapparaît
        // que dans un artefact engendré.
        //
        // `npm run verifier:manifeste` extrait ces deux valeurs et les compare
        // aux jetons. Une recopie qui dérive fait échouer la vérification.
        background_color: '#F4F5F2',
        theme_color: '#14402C',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});

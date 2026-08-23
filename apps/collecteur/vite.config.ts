import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error — module JavaScript partagé, hors du graphe TypeScript des applications.
import { gardeEnv } from '../../scripts/garde-env.mjs';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
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
        background_color: '#FBFAF6',
        theme_color: '#14402C',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});

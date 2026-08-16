import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
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

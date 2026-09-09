import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error — module JavaScript partagé, hors du graphe TypeScript des applications.
import { decouperLib } from '../../scripts/decouper-lib.mjs';
// @ts-expect-error — même raison.
import { gardeEnv } from '../../scripts/garde-env.mjs';

export default defineConfig({
  // Voir `scripts/decouper-lib.mjs` : React et `supabase-js` sortent du morceau
  // applicatif pour que leur poids ne soit pas retéléchargé à chaque mise à
  // jour du produit.
  build: {
    rollupOptions: {
      output: { manualChunks: decouperLib },
    },
  },
  plugins: [gardeEnv(), react(), tailwindcss()],
});

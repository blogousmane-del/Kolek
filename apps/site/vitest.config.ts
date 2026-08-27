import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Même gabarit que `apps/admin/vitest.config.ts` et `packages/ui/vitest.config.ts` :
// un seul modèle de configuration dans le dépôt, pour que celui qui ouvre l'un
// reconnaisse l'autre.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Même valeur et même raison que `packages/ui/vitest.config.ts`, qui la
    // porte en toutes lettres.
    testTimeout: 20000,
  },
});

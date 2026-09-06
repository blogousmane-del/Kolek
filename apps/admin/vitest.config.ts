import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Même forme que `packages/ui/vitest.config.ts` : un seul gabarit de test dans
// le dépôt, pour que celui qui ouvre l'un reconnaisse l'autre.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Même valeur et même raison que `packages/ui/vitest.config.ts`, qui la
    // porte en toutes lettres.
    testTimeout: 20000,
    // Le même `localStorage` en mémoire que `packages/ui`, et une seule copie :
    // Node prive jsdom du sien, et sans lui un test qui vérifie qu'on n'écrit
    // rien dans le navigateur passerait faute de navigateur.
    setupFiles: ['../../packages/ui/vitest.setup.ts'],
  },
});

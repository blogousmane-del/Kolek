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
    // Jamais la production depuis une épreuve : `.env` vise le projet réel, et
    // Vitest le charge. Une épreuve qui oublie de simuler Supabase échoue ici,
    // sur une adresse injoignable, au lieu de lire ou d'écrire en production.
    // `garde-epreuves.test.ts` vérifie que cette ligne tient.
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'cle-des-epreuves' },
  },
});

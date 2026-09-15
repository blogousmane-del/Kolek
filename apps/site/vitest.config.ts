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
    // Jamais la production depuis une épreuve : `.env` vise le projet réel, et
    // Vitest le charge. Une épreuve qui oublie de simuler Supabase échoue ici,
    // sur une adresse injoignable, au lieu de lire ou d'écrire en production.
    // `garde-epreuves.test.ts` vérifie que cette ligne tient.
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'cle-des-epreuves' },
  },
});

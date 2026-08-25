import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Le délai par défaut de 5 s suppose une machine au repos. Construire
    // l'environnement jsdom domine ici tout le reste — un fichier de test lancé
    // seul montre `environment 24 s` pour `tests 3 s` — et quand plusieurs
    // espaces de travail s'enchaînent, ou qu'une compilation tourne à côté, des
    // tests sans aucun rapport avec la modification en cours tombent par simple
    // dépassement. Un rapport où l'échec ne désigne pas la cause ne sert à rien.
    //
    // Attendre plus longtemps n'affaiblit aucune assertion : ce qui doit
    // apparaître apparaît, ou le test échoue quand même. 20 s est déjà la valeur
    // retenue par `supabase/tests/vitest.config.ts`.
    testTimeout: 20000,
  },
});

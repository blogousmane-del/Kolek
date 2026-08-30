import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    setupFiles: ['supabase/tests/charger-env.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    // Le harnais crée des comptes Auth dans `beforeAll` — un hook coûte donc
    // autant qu'un test, et les 10 s par défaut mordaient dès trois comptes sur
    // une machine où Docker est déjà à l'étroit.
    hookTimeout: 20000,
  },
});

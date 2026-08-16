import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    setupFiles: ['supabase/tests/charger-env.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});

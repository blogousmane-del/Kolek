import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error — module JavaScript partagé, hors du graphe TypeScript des applications.
import { gardeEnv } from '../../scripts/garde-env.mjs';

export default defineConfig({
  plugins: [gardeEnv(), react(), tailwindcss()],
});

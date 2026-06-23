import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// Resolve @dataflow/shared to its TypeScript source for the web bundle. The
// package's `main` points at the built CJS dist (so the Node services can
// require() it at runtime), but Rollup can't statically analyze named exports
// re-exported through CJS — pointing the bundler at the source fixes that and
// also gives instant HMR when shared types change.
const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@dataflow/shared': sharedSrc } },
  server: { port: 3000, proxy: { '/api': 'http://localhost:4000' } },
});

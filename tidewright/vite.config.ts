import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path on the user's site.
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 4096 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
} as any);

import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built page works from any folder or a file:// URL.
  base: './',
  server: { port: 5173, strictPort: false },
  build: { target: 'es2022', sourcemap: true },
});

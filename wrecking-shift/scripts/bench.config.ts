import { defineConfig } from 'vite';
// separate vitest config for scripts/bench-level.test.ts (kept out of the unit suite)
export default defineConfig({ test: { include: ['scripts/bench-level.test.ts'], testTimeout: 600000 } } as any);

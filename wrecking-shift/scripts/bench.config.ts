import { defineConfig } from 'vite';
// separate vitest config for the level bench / probe scripts (kept out of the unit suite)
export default defineConfig({ test: { include: ['scripts/bench-level.test.ts', 'scripts/dbg-level.test.ts', 'scripts/dbg-quads.test.ts', 'scripts/dbg-stand.test.ts', 'scripts/dbg-stand2.test.ts', 'scripts/dbg-debris.test.ts', 'scripts/dbg-hole.test.ts', 'scripts/dbg-quads2.test.ts'], testTimeout: 600000 } } as any);

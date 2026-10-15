import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Embedded PostgreSQL/WASM startup exhausts this laptop under fork fan-out.
    // Serialize by default; assertions and hook deadlines remain unchanged.
    maxWorkers: 1,
    include: ['src/**/*.test.ts'],
    // Live-network integration tests are opt-in via RUN_LIVE_TESTS=1
    testTimeout: 30000,
  },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./', import.meta.url)) };

// Shared exclusions. NOTE: the include patterns below are deliberately
// convention-based (file suffix) rather than an allowlist of directories.
// The previous allowlist silently skipped every test under lib/, which is
// where the business logic lives.
const baseExclude = [
  '**/node_modules/**',
  '.next/**',
  '.dynamodb-local*/**',
  'backend/**',
  'e2e/**',
];

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      thresholds: {
        'lib/game/**': { lines: 90, branches: 85, functions: 90 },
        'lib/collection.ts': { lines: 90, branches: 85 },
        'lib/api/**': { lines: 85, branches: 80 },
        'lib/scratch-card/**': { lines: 80, branches: 70 },
        // Raised once the integration project's coverage is merged in.
        'lib/dynamo/**': { lines: 40 },
        'app/api/**': { lines: 30 },
      },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: [...baseExclude, '**/*.db.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude: baseExclude,
          setupFiles: ['./test/setup.dom.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['**/*.db.test.ts'],
          exclude: baseExclude,
          globalSetup: ['./test/setup.integration.ts'],
          // DynamoDB Local runs with -sharedDb: one database, so no parallelism.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});

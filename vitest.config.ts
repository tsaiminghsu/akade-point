import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: [
      'components/minecraft/**/*.test.ts',
      'components/minecraft/**/*.test.tsx',
      'lib/dynamo/**/*.test.ts',
      'components/city-game/**/*.test.ts',
      'components/ship-tracker/**/*.test.ts',
      'components/dice-game/**/*.test.ts',
    ],
    exclude: ['node_modules', '.next'],
    passWithNoTests: true,
  },
});

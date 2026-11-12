import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { 'server-only': new URL('./test/server-only.ts', import.meta.url).pathname },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['{apps,packages}/*/{src,test}/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['{apps,packages}/*/{src,test}/**/*.int.test.ts'],
          globalSetup: ['./test/integration-setup.ts'],
          setupFiles: ['./test/integration-env.ts'],
          environment: 'node',
          // They share one test database: no parallelism across files.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})

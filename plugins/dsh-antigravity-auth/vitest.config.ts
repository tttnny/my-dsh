import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // The published ui-primitives Node entry is a barrel over build-time-only
      // dependencies the Web shell inlines; Node cannot load it. The specs render
      // the settings card, so they use the faithful local stand-in instead.
      '@deepseek-ai/dsh-client-ui-primitives': resolve(projectRoot, 'tests/ui-primitives.stub.tsx'),
      'dsh-antigravity-auth/wire-identity': resolve(projectRoot, 'src/wire-identity.ts'),
      'dsh-antigravity-auth/invariant': resolve(projectRoot, 'src/invariant.ts'),
      'dsh-antigravity-auth/project-context': resolve(projectRoot, 'src/project-context.ts'),
      'dsh-antigravity-auth': resolve(projectRoot, 'src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    restoreMocks: true,
    // Keeps every test away from a real Antigravity credential store.
    setupFiles: ['tests/setup-isolate-data-home.ts'],
  },
})

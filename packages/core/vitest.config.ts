import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', '../../scripts/*.test.mjs', '../../site/*.test.mjs'],
    environmentMatchGlobs: [
      ['tests/modal.test.ts', 'jsdom'],
      ['../../site/kit.icon.test.mjs', 'jsdom'],
    ],
  },
})

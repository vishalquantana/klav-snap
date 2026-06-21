import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['tests/modal.test.ts', 'jsdom'],
    ],
  },
})

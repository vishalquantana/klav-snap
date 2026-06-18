import { defineConfig } from 'vite'
import { resolve } from 'path'

// Separate config for the embeddable IIFE widget bundle.
// Run with: npx vite build --config vite.widget.config.ts
// Deps (html-to-image, @klavity/core/sim) are intentionally INLINED (no external).
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/widget.ts'),
      name: 'KlavityWidget',
      formats: ['iife'],
      fileName: () => 'klavity-widget.iife.js',
    },
    rollupOptions: {
      // Override Vite lib mode's auto-externalize: bundle ALL deps into the IIFE.
      external: [],
    },
  },
})

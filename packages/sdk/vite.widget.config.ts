import { defineConfig } from 'vite'
import { resolve } from 'path'

// Separate config for the embeddable IIFE widget bundle.
// Run with: npx vite build --config vite.widget.config.ts
// Deps (html-to-image, @klavity/core/sim) are intentionally INLINED (no external) — EXCEPT heic2any.
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
      // Bundle ALL deps into the IIFE, EXCEPT heic2any: it embeds libheif compiled to WASM whose
      // Emscripten/embind glue calls new Function() at module-eval. Strict-CSP customer sites
      // (script-src without 'unsafe-eval') throw an EvalError on that, which crashed the widget on
      // mount. Keeping heic2any out of the bundle makes the widget eval-free (and ~1.3 MB smaller);
      // modal.ts's dynamic import('heic2any') then fails-soft to raw file upload on the widget.
      external: ['heic2any'],
    },
  },
})

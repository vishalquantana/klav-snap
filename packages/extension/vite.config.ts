import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import manifest from './manifest.json'

// crxjs ties each content script's web_accessible_resources matches to that script's
// `matches`. We declare the content script narrowly (localhost) so it isn't auto-injected
// across all sites — but it IS injected on demand via activeTab (Analyze/Report) and
// registered dynamically on the specific origins a user/admin has granted. For the injected
// loader to import the content MODULE on those third-party origins, the module must be
// web-accessible there. Widen the content resources' WAR matches to <all_urls>. This is
// resource accessibility only: it does NOT grant host permissions and does NOT trigger the
// "read and change all your data on all websites" install warning.
function widenContentWar() {
  return {
    name: 'klavity-widen-content-war',
    closeBundle() {
      const p = resolve(process.cwd(), 'dist/manifest.json')
      let m: any
      try { m = JSON.parse(readFileSync(p, 'utf8')) } catch { return }
      if (!Array.isArray(m.web_accessible_resources)) return
      for (const war of m.web_accessible_resources) {
        if ((war.resources || []).some((r: string) => r.includes('content.ts'))) {
          war.matches = ['<all_urls>']
        }
      }
      writeFileSync(p, JSON.stringify(m, null, 2))
    },
  }
}

export default defineConfig({
  plugins: [crx({ manifest }), widenContentWar()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})

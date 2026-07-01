#!/usr/bin/env node
// Inline-JS syntax guard — ENFORCING: exits non-zero if any inline <script>
// in user-facing HTML fails to parse. Catches the smart-quote corruption class
// (e.g. `let x = ‘widget’`) that silently killed /onboarding signup on prod.
// JSON-LD / JSON / src= scripts are skipped. Run: node scripts/check-inline-js.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const DIRS = ['site', 'prototype/public']
const SCRIPT_RE = /<script([^>]*)>([\s\S]*?)<\/script>/gi

let failures = 0
for (const dir of DIRS) {
  let entries = []
  try { entries = readdirSync(dir) } catch { continue }
  for (const name of entries) {
    if (!name.endsWith('.html')) continue
    const file = join(dir, name)
    const html = readFileSync(file, 'utf-8')
    let i = 0
    for (const m of html.matchAll(SCRIPT_RE)) {
      const [, attrs, js] = m
      i++
      if (/\bsrc\s*=/.test(attrs)) continue
      if (/ld\+json|application\/json|text\/template/.test(attrs)) continue
      if (!js.trim()) continue
      // type="module" scripts MUST go through --input-type=module via stdin:
      // file-based `node --check` mis-detects the module context and silently
      // passed a curly-quote SyntaxError that killed /app on prod (2026-07-02).
      const isModule = /type\s*=\s*["']?module/.test(attrs)
      try {
        if (isModule) {
          execFileSync('node', ['--input-type=module', '--check'], { input: js, stdio: 'pipe' })
        } else {
          const tmp = join(tmpdir(), 'klav-inline-check.js')
          writeFileSync(tmp, js)
          execFileSync('node', ['--check', tmp], { stdio: 'pipe' })
        }
      } catch (e) {
        failures++
        const line = String(e.stderr).split('\n').find(l => l.includes('Error')) || 'parse error'
        console.error(`FAIL ${file} <script> #${i}: ${line.trim()}`)
      }
    }
  }
}

if (failures) {
  console.error(`\nInline-JS guard FAILED — ${failures} unparsable inline script(s). Fix before merging.`)
  process.exit(1)
}
console.log('Inline-JS guard passed — all inline scripts parse.')

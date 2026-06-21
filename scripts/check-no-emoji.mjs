// scripts/check-no-emoji.mjs
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const GLOBS = ['site', 'prototype/public', 'packages/core/src', 'packages/sdk/src', 'packages/extension/src'];
const EXCLUDE = /(icons\.generated\.(ts|js)|\.test\.|\.snap$)/; // generated maps + tests excluded
// NOTE: deliberately excludes U+2190–21FF (basic arrows) — that range contains
// legitimate keycap glyphs like ⇧ (U+21E7) used in keyboard shortcuts (⌘⇧K).
// Emoji arrows (➡ U+27A1, ⬅⬆⬇ U+2B05–07) are covered by the ranges below.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const reportOnly = process.argv.includes('--report');

const files = execSync(`git ls-files ${GLOBS.join(' ')}`, { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !EXCLUDE.test(f));

const hits = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('emoji-ok')) return; // explicit allow
    if (EMOJI.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
  });
}

if (hits.length) {
  console.error(`Found ${hits.length} emoji in user-facing source:`);
  hits.forEach((h) => console.error('  ' + h));
  console.error('\nUse @klavity/core icon() / Klav.icon() instead. Add `emoji-ok` on the line to allow.');
  if (!reportOnly) process.exit(1);
} else {
  console.log('No emoji in user-facing source.');
}

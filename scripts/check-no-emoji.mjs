// scripts/check-no-emoji.mjs
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const GLOBS = ['site', 'prototype/public', 'packages/core/src', 'packages/sdk/src', 'packages/extension/src'];
// Excluded: generated icon maps, test files, snapshots, and binary assets
// (fonts/images/media read as utf8 produce spurious matches against the emoji ranges).
const EXCLUDE = /(icons\.generated\.(ts|js)|\.test\.|\.snap$|\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|ico|mp4|webm|pdf|zip)$)/i;
// NOTE: deliberately excludes U+2190–21FF (basic arrows) — that range contains
// legitimate keycap glyphs like ⇧ (U+21E7) and ↻ (U+21BB replay arrow, converted
// manually) used in keyboard shortcuts (⌘⇧K). ↻/U+21BB is converted but not
// guard-enforced by design (entire U+2190–21FF keycap-arrow range is excluded).
// Deliberately excludes ⌘ U+2318 (keyboard symbol, falls in U+2300–23FF block —
// we only add the media-transport sub-range U+23E9–23FA to avoid catching ⌘).
// Deliberately excludes text bullet shapes (▸▾ in U+25A0–25FF) — only adds the
// specific play/reverse triangles U+25B6 and U+25C0 and emoji squares U+25FB–25FE.
// Added: U+231A–231B (watch/hourglass), U+23E9–23FA (media transport + clocks,
// incl. ⏸ U+23F8 pause), U+25B6 (play ▶), U+25C0 (reverse ◀), U+25FB–25FE
// (emoji squares).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{231A}-\u{231B}\u{23E9}-\u{23FA}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/u;
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
  console.error('\nUse @klavity/core icon(), site KlavityKit.icon(), or prototype kicon() instead. Add `emoji-ok` on the line to allow.');
  if (!reportOnly) process.exit(1);
} else {
  console.log('No emoji in user-facing source.');
}

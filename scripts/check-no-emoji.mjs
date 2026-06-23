// scripts/check-no-emoji.mjs — ENFORCING: exits non-zero on any emoji hit.
// Run via: node scripts/check-no-emoji.mjs
// CI runs this as a blocking step; there is no --report / allow-failure mode.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const GLOBS = ['site', 'prototype/public', 'packages/core/src', 'packages/sdk/src', 'packages/extension/src'];
// Excluded: generated icon maps, test files, snapshots, binary assets, and compiled
// JS bundles in prototype/public/ (widget.js, klavity-sim.js, icons.generated.js).
// Binary formats read as utf8 can produce spurious matches against emoji ranges.
const EXCLUDE = /(icons\.generated\.(ts|js)|\.test\.|\.snap$|\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|ico|mp4|webm|pdf|zip)$|^prototype\/public\/[^/]+\.js$)/i;
// NOTE: deliberately excludes U+2190–21FF (basic arrows) — that range contains
// legitimate keycap glyphs like ⇧ (U+21E7) and ↻ (U+21BB replay arrow)
// used in keyboard shortcuts (⌘⇧K). Deliberately excludes ⌘ U+2318 (keyboard
// symbol). Deliberately excludes text bullet shapes (▸▾ in U+25A0–25FF) — only
// adds the specific play/reverse triangles U+25B6 and U+25C0 and emoji squares.
// Added: U+231A–231B (watch/hourglass), U+23E9–23FA (media transport + clocks,
// incl. ⏸ U+23F8 pause), U+25B6 (play ▶), U+25C0 (reverse ◀), U+25FB–25FE.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{231A}-\u{231B}\u{23E9}-\u{23FA}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/u;

const files = execSync(`git ls-files ${GLOBS.join(' ')}`, { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !EXCLUDE.test(f));

const hits = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('emoji-ok')) return; // explicit per-line allow
    if (EMOJI.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
  });
}

if (hits.length) {
  console.error(`\nEmoji guard FAILED — ${hits.length} emoji in user-facing source:`);
  hits.forEach((h) => console.error('  ' + h));
  console.error('\nFix: use @klavity/core icon(), site KlavityKit.icon(), or prototype kicon().');
  console.error('To allow a single line: add `emoji-ok` as a comment on that line.\n');
  process.exit(1);
}

console.log('Emoji guard passed — no emoji in user-facing source.');

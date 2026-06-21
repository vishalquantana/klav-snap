import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
test('regex flags dirty fixture', () => {
  expect(EMOJI.test(readFileSync(join(__dirname, 'fixtures/dirty.txt'), 'utf8'))).toBe(true);
});
test('regex passes clean fixture', () => {
  expect(EMOJI.test(readFileSync(join(__dirname, 'fixtures/clean.txt'), 'utf8'))).toBe(false);
});

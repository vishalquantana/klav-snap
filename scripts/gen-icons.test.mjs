// scripts/gen-icons.test.mjs
import { test, expect } from 'vitest';
import { ICONS } from '../packages/core/src/icons.generated.ts';

test('every requested icon is generated and non-empty', () => {
  for (const name of ['search', 'bug', 'dna', 'heart', 'x-circle']) {
    expect(ICONS[name]).toBeTruthy();
  }
});

test('search icon contains a circle (sanity vs lucide source)', () => {
  expect(ICONS['search']).toContain('<circle');
});

// site/kit.icon.test.mjs
// Run from packages/core: npx vitest run ../../site/kit.icon.test.mjs --environment jsdom
import { test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  // load generated map + kit.js into the jsdom global
  // kit.js exposes window.KlavityKit (not window.Klav) — icon() is added there
  global.window = global;
  // Stub DOM APIs that kit.js references at boot (not needed for icon helper)
  global.document = global.document || {
    readyState: 'complete',
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  global.window.matchMedia = global.window.matchMedia || (() => ({ matches: false }));
  new Function(readFileSync(join(dir, 'icons.generated.js'), 'utf8'))();
  new Function(readFileSync(join(dir, 'kit.js'), 'utf8'))();
});

test('KlavityKit.icon emits svg with currentColor', () => {
  const s = window.KlavityKit.icon('search');
  expect(s).toContain('stroke="currentColor"');
  expect(s).toContain('class="icon"');
});

test('KlavityKit.icon label makes it semantic', () => {
  const s = window.KlavityKit.icon('heart', { label: 'Loved it' });
  expect(s).toContain('<title>Loved it</title>');
});

test('KlavityKit.icon unknown name throws', () => {
  expect(() => window.KlavityKit.icon('nonexistent')).toThrow('Unknown icon: nonexistent');
});

test('KlavityKit.icon custom class and size', () => {
  const s = window.KlavityKit.icon('check', { class: 'my-cls', size: 24 });
  expect(s).toContain('class="icon my-cls"');
  expect(s).toContain('width="24"');
  expect(s).toContain('height="24"');
});

test('KlavityKit.icon decorative by default has aria-hidden', () => {
  const s = window.KlavityKit.icon('zap');
  expect(s).toContain('aria-hidden="true"');
});

test('KlavityKit.icon with label has role=img', () => {
  const s = window.KlavityKit.icon('zap', { label: 'Lightning' });
  expect(s).toContain('role="img"');
});

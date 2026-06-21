// packages/core/src/icons.test.ts
import { describe, it, expect } from 'vitest';
import { icon } from './icons';

describe('icon()', () => {
  it('emits an svg with the standard wrapper attrs', () => {
    const s = icon('search');
    expect(s).toContain('stroke="currentColor"');
    expect(s).toContain('viewBox="0 0 24 24"');
    expect(s).toContain('class="icon"');
    expect(s).toContain('width="18"');
  });
  it('decorative by default (aria-hidden, no role)', () => {
    const s = icon('bug');
    expect(s).toContain('aria-hidden="true"');
    expect(s).not.toContain('role="img"');
  });
  it('semantic when given a label (role + title, no aria-hidden)', () => {
    const s = icon('heart', { label: 'Loved it' });
    expect(s).toContain('role="img"');
    expect(s).toContain('<title>Loved it</title>');
    expect(s).not.toContain('aria-hidden');
  });
  it('honors size and extra class', () => {
    const s = icon('zap', { size: 24, class: 'big' });
    expect(s).toContain('width="24"');
    expect(s).toContain('class="icon big"');
  });
  it('throws on unknown name', () => {
    // @ts-expect-error invalid name
    expect(() => icon('not-a-real-icon')).toThrow();
  });
});

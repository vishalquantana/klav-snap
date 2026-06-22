// packages/core/src/icons.ts
import { ICONS } from './icons.generated';

export type IconName = keyof typeof ICONS;

export interface IconOpts {
  size?: number;
  /** When set, the icon is semantic: gets role="img" + <title>. Otherwise decorative (aria-hidden). */
  label?: string;
  class?: string;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function icon(name: IconName, opts: IconOpts = {}): string {
  const body = ICONS[name];
  if (!body) throw new Error(`Unknown icon: ${String(name)}`);
  const size = opts.size ?? 18;
  const cls = opts.class ? `icon ${opts.class}` : 'icon';
  const a11y = opts.label
    ? `role="img"`
    : `aria-hidden="true"`;
  const title = opts.label ? `<title>${escapeAttr(opts.label)}</title>` : '';
  // vertical-align:-0.125em nudges the inline SVG off the text baseline so it sits
  // centered against adjacent label text (inline SVGs default to baseline = lopsided).
  // Inline style so it holds in injected widget/extension contexts with no .icon CSS.
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.125em" ${a11y}>${title}${body}</svg>`;
}

export { ICONS };

// Dev helper: print an icon's inline SVG. Usage: node scripts/print-icon.mjs <name> [size] [label]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const dir = dirname(fileURLToPath(import.meta.url));
globalThis.window = {};
new Function(readFileSync(join(dir, '..', 'site', 'icons.generated.js'), 'utf8'))();
const I = window.KLAV_ICONS;
const [name, size = '18', label] = process.argv.slice(2);
if (!I[name]) { console.error('Unknown icon: ' + name); process.exit(1); }
const a11y = label ? 'role="img"' : 'aria-hidden="true"';
const title = label ? `<title>${label}</title>` : '';
console.log(`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${title}${I[name]}</svg>`);

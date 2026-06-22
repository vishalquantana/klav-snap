export type ModalTheme = 'light' | 'dark' | 'glass' | 'neon' | 'custom' | 'liquid'
export const ALLOWED_THEMES: ModalTheme[] = ['light', 'dark', 'glass', 'neon', 'custom', 'liquid']

export interface ModalConfig {
  theme?: ModalTheme
  primary?: string
  secondary?: string
  background?: string
  font?: string
  thankYou?: string
}

const HEX = /^#[0-9a-fA-F]{3,8}$/
const FONT_OK = /^[\w \-,'"().]+$/
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const hex = (v: unknown): string | undefined => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : undefined)
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const fontStr = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const t = v.trim().slice(0, 120)
  return t && FONT_OK.test(t) ? t : undefined
}

// CSS-variable palettes per built-in theme (ported from packages/core/demo/popup-themes.html).
const THEMES: Record<Exclude<ModalTheme, 'custom'>, Record<string, string>> = {
  // Default = warm cream (matches the marketing home --ink #f5f3ee), not a dull stark white. The modal sits
  // a touch lighter than the page so it reads as a raised warm panel; chips/inputs/border are warm-tinted to match.
  light: { '--kl-overlay': 'rgba(28,22,40,.30)', '--kl-bg': '#faf7f1', '--kl-fg': '#1d1a17', '--kl-muted': '#8a8276', '--kl-border': '#e9e1d4', '--kl-chip': '#f1ece1', '--kl-input-bg': '#fffdf8', '--kl-accent': '#5b5bf0', '--kl-on-accent': '#fff', '--kl-accent2': '#f59e0b', '--kl-radius': '16px', '--kl-shadow': '0 24px 60px rgba(40,28,70,.20)', '--kl-backdrop': 'none' },
  dark: { '--kl-overlay': 'rgba(0,0,0,.5)', '--kl-bg': '#1e1e2e', '--kl-fg': '#cdd6f4', '--kl-muted': '#a6adc8', '--kl-border': '#45475a', '--kl-chip': '#313244', '--kl-input-bg': '#181825', '--kl-accent': '#89b4fa', '--kl-on-accent': '#1e1e2e', '--kl-accent2': '#fab387', '--kl-radius': '12px', '--kl-shadow': '0 20px 60px rgba(0,0,0,.5)', '--kl-backdrop': 'none' },
  glass: { '--kl-overlay': 'rgba(10,10,18,.25)', '--kl-bg': 'rgba(255,255,255,.14)', '--kl-fg': '#fff', '--kl-muted': 'rgba(255,255,255,.7)', '--kl-border': 'rgba(255,255,255,.28)', '--kl-chip': 'rgba(255,255,255,.16)', '--kl-input-bg': 'rgba(255,255,255,.10)', '--kl-accent': 'rgba(255,255,255,.92)', '--kl-on-accent': '#15121d', '--kl-accent2': 'rgba(255,255,255,.55)', '--kl-radius': '22px', '--kl-shadow': '0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25)', '--kl-backdrop': 'blur(22px) saturate(180%)' },
  neon: { '--kl-overlay': 'rgba(8,4,20,.55)', '--kl-bg': '#0e0b1e', '--kl-fg': '#f4f0ff', '--kl-muted': '#a99fd6', '--kl-border': '#3a2d6b', '--kl-chip': '#1c1640', '--kl-input-bg': '#140f2c', '--kl-accent': '#ff2d95', '--kl-on-accent': '#fff', '--kl-accent2': '#15e0ff', '--kl-radius': '14px', '--kl-shadow': '0 0 0 1px rgba(255,45,149,.4), 0 24px 70px rgba(255,45,149,.25)', '--kl-backdrop': 'none' },
  // 'liquid' on a real page can't do clone-refraction; render as frosted glass.
  liquid: { '--kl-overlay': 'rgba(10,10,18,.25)', '--kl-bg': 'rgba(255,255,255,.10)', '--kl-fg': '#fff', '--kl-muted': 'rgba(255,255,255,.7)', '--kl-border': 'rgba(255,255,255,.4)', '--kl-chip': 'rgba(255,255,255,.16)', '--kl-input-bg': 'rgba(255,255,255,.08)', '--kl-accent': 'rgba(255,255,255,.92)', '--kl-on-accent': '#15121d', '--kl-accent2': 'rgba(255,255,255,.55)', '--kl-radius': '22px', '--kl-shadow': '0 30px 90px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.5)', '--kl-backdrop': 'blur(14px) saturate(170%)' },
}

function luminance(hexColor: string): number {
  let h = hexColor.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function resolveModalConfig(raw: unknown): ModalConfig & { theme: ModalTheme } {
  const r = isObj(raw) ? raw : {}
  const theme = (typeof r.theme === 'string' && (ALLOWED_THEMES as string[]).includes(r.theme)) ? (r.theme as ModalTheme) : 'light'
  const out: ModalConfig & { theme: ModalTheme } = { theme }
  const p = hex(r.primary), s = hex(r.secondary), bg = hex(r.background), ty = str(r.thankYou, 140), f = fontStr(r.font)
  if (p) out.primary = p
  if (s) out.secondary = s
  if (bg) out.background = bg
  if (f) out.font = f
  if (ty) out.thankYou = ty
  return out
}

export function themeCss(config: ModalConfig): string {
  const c = resolveModalConfig(config)
  const base = c.theme === 'custom' ? { ...THEMES.light } : { ...THEMES[c.theme] }
  if (c.theme === 'custom') {
    if (c.primary) base['--kl-accent'] = c.primary
    if (c.secondary) base['--kl-accent2'] = c.secondary
    if (c.background) {
      base['--kl-bg'] = c.background
      const dark = luminance(c.background) < 140
      base['--kl-fg'] = dark ? '#f4f4f7' : '#1d1d24'
      base['--kl-muted'] = dark ? 'rgba(255,255,255,.6)' : '#8a8a96'
      base['--kl-border'] = dark ? 'rgba(255,255,255,.16)' : '#e6e6ec'
      base['--kl-chip'] = dark ? 'rgba(255,255,255,.08)' : '#f4f4f7'
      base['--kl-input-bg'] = dark ? 'rgba(255,255,255,.05)' : '#fafafb'
    }
  }
  if (c.font) base['--kl-font'] = c.font
  // Image-outline color (make-interfaces-feel-better): a subtle 1px separator on screenshot thumbnails.
  // MUST be pure black on light surfaces / pure white on dark — never a tinted neutral (tints read as dirt
  // on the image edge). Derived per theme; glass/liquid/dark/neon are dark surfaces (white fg).
  const darkSurface = c.theme === 'dark' || c.theme === 'neon' || c.theme === 'glass' || c.theme === 'liquid'
    || (c.theme === 'custom' && !!c.background && luminance(c.background) < 140)
  base['--kl-img-outline'] = darkSurface ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)'
  // Warm on-brand glow layered over the modal background — mirrors the marketing home (a soft Klavity-purple
  // glow at the top + an amber glow at the bottom-right) so the form isn't a flat box. Subtler on dark surfaces.
  base['--kl-glow'] = darkSurface
    ? 'radial-gradient(120% 80% at 50% -12%, rgba(139,92,246,.20), transparent 60%), radial-gradient(95% 75% at 108% 112%, rgba(255,170,90,.08), transparent 58%)'
    : 'radial-gradient(120% 80% at 50% -12%, rgba(124,107,247,.13), transparent 58%), radial-gradient(95% 75% at 108% 112%, rgba(232,162,74,.10), transparent 55%)'
  const vars = Object.entries(base).map(([k, v]) => `${k}:${v};`).join('')
  return `:host{${vars}}`
}

export function validateModalConfigInput(body: unknown, opts: { isPro: boolean }): { ok: true; config: ModalConfig } | { ok: false; error: string } {
  if (!isObj(body)) return { ok: false, error: 'Invalid body.' }
  if (typeof body.theme !== 'string' || !(ALLOWED_THEMES as string[]).includes(body.theme)) {
    return { ok: false, error: 'Unknown theme.' }
  }
  const config: ModalConfig = { theme: body.theme as ModalTheme }
  const ty = str(body.thankYou, 140)
  if (ty) config.thankYou = ty
  if (opts.isPro) {
    const p = hex(body.primary), s = hex(body.secondary), bg = hex(body.background), f = fontStr(body.font)
    if (p) config.primary = p
    if (s) config.secondary = s
    if (bg) config.background = bg
    if (f) config.font = f
  }
  if (JSON.stringify(config).length > 2048) return { ok: false, error: 'Config too large.' }
  return { ok: true, config }
}

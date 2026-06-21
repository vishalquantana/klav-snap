// Weekly social carousel renderer — agent-curated WeeklyNewsData → brand-styled
// HTML slides → PNG buffers (Playwright/chromium @2× DPR). Render-only; posting is
// a separate, deferred step. Pure + deterministic (no network except web fonts).
//
// Brand: Klavity. Dark social variant of the marketing palette (kit.css).
import { chromium, type BrowserContext } from "playwright"

export interface NewsItem {
  headline: string   // what happened — factual, one line, SOURCED (no hallucinated news)
  takeaway: string   // actionable advice for the audience — "what you should do"
  emoji: string      // one leading glyph
}
export interface WeeklyNewsData {
  weekLabel: string  // e.g. "WEEK OF JUN 21, 2026" (uppercased)
  items: NewsItem[]  // 4–6 items
}

// Slide config
const W = 1080, H = 1350, DPR = 2
const VERTICAL = "AI QA"                 // "This Week in <VERTICAL>"
const HANDLE = "@klavity"
// Rotating accent trio per detail slide (main / glow-tint / card-bg), Klavity phase colors.
const ACCENTS = [
  { main: "#818cf8", glow: "rgba(99,102,241,.20)", card: "rgba(99,102,241,.12)" }, // indigo (Snap)
  { main: "#f472b6", glow: "rgba(219,39,119,.20)", card: "rgba(219,39,119,.12)" }, // rose  (Sims)
  { main: "#34d39f", glow: "rgba(15,157,107,.22)", card: "rgba(15,157,107,.13)" }, // green (AutoSim)
  { main: "#e8a24a", glow: "rgba(217,131,36,.20)", card: "rgba(217,131,36,.12)" }, // amber (heal)
]
const PAPER = "#19140f"      // deep ink — slide background
const CREAM = "#f5f3ee"      // primary text
const DIM = "#b6 af a4".replace(/ /g, "") // muted text
const FAINT = "#8a8076"

export function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// The open "( )" Klavity mark, stroked in cream — same paths as the site logo.
const MARK = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="${CREAM}" stroke-width="1.7" stroke-linecap="round"><path d="M10 3C6 7 6 17 10 21"/><path d="M14 3C18 7 18 17 14 21"/><path d="M7.5 8h9M7.5 16h9" stroke-width="1.2" opacity=".5"/></svg>`

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Hanken+Grotesk:wght@400..800&family=JetBrains+Mono:wght@500;700&display=swap');`

const shell = (body: string, accent = ACCENTS[0]) => `<!doctype html><html><head><meta charset="utf-8"><style>
${FONTS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
.slide{position:relative;width:${W}px;height:${H}px;background:${PAPER};color:${CREAM};
  font-family:'Hanken Grotesk',system-ui,sans-serif;overflow:hidden;
  padding:96px 90px;display:flex;flex-direction:column}
.bar{position:absolute;top:0;left:0;right:0;height:10px;background:linear-gradient(90deg,${ACCENTS[0].main},${ACCENTS[1].main},${ACCENTS[2].main},${ACCENTS[3].main})}
.glow{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none}
.eyebrow{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:24px;letter-spacing:.22em;text-transform:uppercase}
.foot{position:absolute;left:90px;right:90px;bottom:64px;display:flex;align-items:center;justify-content:space-between;
  font-family:'JetBrains Mono',monospace;font-size:21px;color:${FAINT};letter-spacing:.04em}
.foot .brand{display:flex;align-items:center;gap:13px;color:${CREAM};font-family:'Fraunces',serif;font-weight:600;font-size:30px}
em{font-style:italic}
${body}
</style></head><body>`

export function coverSlideHtml(d: WeeklyNewsData): string {
  const list = d.items.map((it) => `
    <li><span class="li-emoji">${esc(it.emoji)}</span><span class="li-txt">${esc(it.headline)}</span></li>`).join("")
  const css = `
.glow.g1{width:560px;height:560px;background:${ACCENTS[0].glow};top:-120px;right:-140px}
.glow.g2{width:520px;height:520px;background:${ACCENTS[2].glow};bottom:-160px;left:-160px}
.kicker{color:${ACCENTS[0].main}}
h1{font-family:'Fraunces',serif;font-weight:600;font-size:96px;line-height:1.02;letter-spacing:-.02em;margin:26px 0 0}
h1 em{color:${ACCENTS[1].main}}
.rule{width:120px;height:6px;border-radius:6px;background:${ACCENTS[0].main};margin:34px 0 0}
ul{list-style:none;margin:auto 0;display:flex;flex-direction:column;gap:0}
li{display:flex;gap:22px;align-items:flex-start;padding:30px 0;border-bottom:1px solid rgba(245,243,238,.10);font-size:36px;line-height:1.28}
li:last-child{border-bottom:none}
.li-emoji{font-size:38px;flex:none;line-height:1.2}
.li-txt{color:${CREAM};font-weight:500}`
  return shell(`
    <div class="slide">
      <div class="bar"></div><div class="glow g1"></div><div class="glow g2"></div>
      <div class="eyebrow kicker">${esc(d.weekLabel)}</div>
      <h1>This Week in <em>${esc(VERTICAL)}</em></h1>
      <div class="rule"></div>
      <ul>${list}</ul>
      <div class="foot">
        <span class="brand">${MARK} Klavity</span>
        <span>1 / ${d.items.length + 1} · Swipe for takeaways →</span>
      </div>
    </div>` + `<style>${css}</style>`)
}

export function detailSlideHtml(it: NewsItem, i: number, total: number, weekLabel: string): string {
  const a = ACCENTS[i % ACCENTS.length]
  const css = `
.glow.g1{width:600px;height:600px;background:${a.glow};top:-160px;right:-180px}
.tag{color:${a.main}}
.emoji{font-size:88px;margin:30px 0 18px}
h2{font-family:'Fraunces',serif;font-weight:600;font-size:74px;line-height:1.06;letter-spacing:-.015em;color:${CREAM}}
.divider{height:1px;background:rgba(245,243,238,.12);margin:54px 0 0}
.do-label{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:23px;letter-spacing:.18em;text-transform:uppercase;color:${FAINT};margin:48px 0 22px}
.card{background:${a.card};border-left:7px solid ${a.main};border-radius:16px;padding:42px 44px;
  font-size:42px;line-height:1.34;color:${CREAM};font-weight:500}`
  return shell(`
    <div class="slide">
      <div class="bar"></div><div class="glow g1"></div>
      <div class="eyebrow tag">What happened</div>
      <div class="emoji">${esc(it.emoji)}</div>
      <h2>${esc(it.headline)}</h2>
      <div class="divider"></div>
      <div class="do-label">What you should do</div>
      <div class="card">${esc(it.takeaway)}</div>
      <div class="foot">
        <span>${esc(HANDLE)} · ${esc(weekLabel)}</span>
        <span>${i + 2} / ${total + 1}</span>
      </div>
    </div>` + `<style>${css}</style>`, a)
}

async function renderPage(ctx: BrowserContext, html: string): Promise<Buffer> {
  const page = await ctx.newPage()
  await page.setContent(html, { waitUntil: "networkidle" }) // waits for web fonts
  const png = await page.screenshot({ type: "png" })
  await page.close()
  return Buffer.from(png)
}

export async function generateWeeklyNewsCarousel(d: WeeklyNewsData): Promise<Buffer[]> {
  if (!d.items?.length) throw new Error("WeeklyNewsData.items is empty")
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
    const out: Buffer[] = [await renderPage(ctx, coverSlideHtml(d))]
    for (let i = 0; i < d.items.length; i++)
      out.push(await renderPage(ctx, detailSlideHtml(d.items[i], i, d.items.length, d.weekLabel)))
    return out
  } finally {
    await browser.close()
  }
}

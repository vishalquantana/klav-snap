#!/usr/bin/env bun
// Deterministic blog publisher. Claude (the scheduled routine) authors a JSON
// { meta, bodyHtml } of GENUINELY HELPFUL content; this script assembles the
// full static HTML page (kit.css + Article/FAQ/Breadcrumb/Speakable JSON-LD),
// writes site/blog/<slug>.html, registers it in site/blog/index.json, and
// regenerates the /blog index page. No LLM here — pure assembly.
//
// Usage:  bun scripts/blog-publish.ts <path-to-post.json>
//   post.json = { meta: BlogMeta, bodyHtml: string }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"

const SITE = join(import.meta.dir, "..", "..", "site")
const BLOG = join(SITE, "blog")
const REG = join(BLOG, "index.json")
const BASE = "https://klavity.quantana.top"

export interface BlogFaq { question: string; answer: string }
export interface BlogMeta {
  title: string          // 50–65 chars, SEO
  slug: string           // kebab-case
  excerpt: string        // 120–155 chars
  category: string       // e.g. "Guides" | "Insights" | "Compare" | "Learn"
  date: string           // ISO YYYY-MM-DD
  author?: string
  tldr: string           // 2–3 sentences, the most citable benchmark — Speakable target
  faqs?: BlogFaq[]
  takeaways?: string[]
  relatedSlugs?: string[]
}
interface RegEntry { slug: string; title: string; excerpt: string; category: string; date: string }

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70)

// ── canonical site nav/footer (kept consistent with the marketing pages) ──
const MARK = `<span class="mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M10 3C6 7 6 17 10 21"/><path d="M14 3C18 7 18 17 14 21"/><path d="M7.5 8h9M7.5 16h9" stroke-width="1.2" opacity=".5"/></svg></span>`
const NAV = `<nav class="nav" aria-label="Primary"><div class="wrap nav-in">
  <a class="brand" href="/">${MARK}Klavity</a>
  <div class="nav-links">
    <a href="/#how">How it works</a><a class="s-snap" href="/snap">Snap</a>
    <a class="s-sims" href="/sims">Sims</a><a class="s-autosim" href="/autosim">AutoSim</a>
    <a href="/blog" aria-current="page">Blog</a>
    <a href="https://github.com/vishalquantana/klav-snap" target="_blank" rel="noopener">GitHub ↗</a>
  </div>
  <div class="nav-cta"><a class="btn btn-ghost" href="/login">Log in</a><a class="btn btn-primary" href="/onboarding">Get started</a></div>
</div></nav>`
const FOOTER = `<footer class="footer"><div class="wrap foot-in">
  <a class="brand" href="/">${MARK}Klavity</a>
  <div class="foot-links"><a href="/">Home</a><a href="/snap">Snap</a><a href="/sims">Sims</a><a href="/autosim">AutoSim</a><a href="/blog">Blog</a><a href="https://github.com/vishalquantana/klav-snap" target="_blank" rel="noopener">GitHub</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
  <span class="sp"></span><span class="mono">© <span data-year>${new Date().getFullYear()}</span> Klavity</span>
</div></footer>`

function head(meta: BlogMeta, jsonld: object[]): string {
  const url = `${BASE}/blog/${meta.slug}`
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} · Klavity</title>
<meta name="description" content="${esc(meta.excerpt)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="any">
<meta property="og:type" content="article"><meta property="og:site_name" content="Klavity">
<meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.excerpt)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${BASE}/favicon.svg">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(meta.title)}"><meta name="twitter:description" content="${esc(meta.excerpt)}"><meta name="twitter:image" content="${BASE}/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Hanken+Grotesk:wght@400..800&family=JetBrains+Mono:wght@500;700&display=optional">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Hanken+Grotesk:wght@400..800&family=JetBrains+Mono:wght@500;700&display=optional" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Hanken+Grotesk:wght@400..800&family=JetBrains+Mono:wght@500;700&display=optional"></noscript>
<link rel="stylesheet" href="/kit.css"><script src="/kit.js" defer></script>
<style>
.post{max-width:720px;margin:0 auto;padding:40px 22px 80px}
.post .crumb{font-family:var(--mono);font-size:12.5px;color:var(--paper-faint);letter-spacing:.04em;margin-bottom:18px}
.post h1{font-family:var(--display);font-weight:600;font-size:clamp(34px,6vw,52px);line-height:1.06;letter-spacing:-.02em;margin:0 0 10px}
.post .by{font-family:var(--mono);font-size:12.5px;color:var(--paper-faint);margin-bottom:26px}
.tldr-box{background:var(--ink-2,#efe9df);border:1px solid var(--line);border-left:4px solid var(--accent-text,var(--indigo));border-radius:14px;padding:18px 20px;margin:0 0 30px;font-size:17px;line-height:1.5}
.tldr-box b{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--paper-faint);display:block;margin-bottom:6px}
.prose{font-size:18px;line-height:1.72;color:var(--paper-dim)}
.prose h2{font-family:var(--display);font-weight:600;font-size:28px;color:var(--paper);margin:42px 0 12px;line-height:1.15}
.prose h3{font-weight:700;font-size:20px;color:var(--paper);margin:30px 0 8px}
.prose p{margin:0 0 18px}.prose ul,.prose ol{margin:0 0 18px;padding-left:24px}.prose li{margin:6px 0}
.prose a{color:var(--accent-text,var(--indigo));text-decoration:underline}
.prose strong{color:var(--paper)}
.faq{margin:48px 0 0;border-top:1px solid var(--line);padding-top:30px}
.faq h2{font-family:var(--display);font-size:26px;margin:0 0 16px}
.faq details{border-bottom:1px solid var(--line);padding:14px 0}.faq summary{font-weight:600;cursor:pointer;font-size:17px}
.faq p{margin:10px 0 0;color:var(--paper-dim);line-height:1.6}
.takeaways{margin:40px 0 0;background:var(--ink-2,#efe9df);border-radius:16px;padding:24px 26px}
.takeaways h2{font-family:var(--display);font-size:22px;margin:0 0 12px}.takeaways ul{margin:0;padding-left:20px}.takeaways li{margin:8px 0;line-height:1.5}
.cta{margin:48px 0 0;text-align:center;padding:34px;border:1px solid var(--line);border-radius:18px}
.cta h2{font-family:var(--display);font-size:24px;margin:0 0 8px}.cta p{color:var(--paper-dim);margin:0 0 18px}
</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head><body style="--accent:var(--indigo);--accent-text:var(--indigo-text)">
<a class="skip-link" href="#main">Skip to content</a>${NAV}<main id="main">`
}

export function renderPost(meta: BlogMeta, bodyHtml: string): string {
  const url = `${BASE}/blog/${meta.slug}`
  const jsonld: object[] = [
    { "@context": "https://schema.org", "@type": "Article", headline: meta.title, description: meta.excerpt,
      datePublished: meta.date, dateModified: meta.date, author: { "@type": "Person", name: meta.author || "Klavity" },
      publisher: { "@type": "Organization", name: "Klavity", logo: { "@type": "ImageObject", url: `${BASE}/favicon.svg` } },
      mainEntityOfPage: url, inLanguage: "en" },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${BASE}/blog` },
      { "@type": "ListItem", position: 3, name: meta.title, item: url } ] },
    { "@context": "https://schema.org", "@type": "WebPage", speakable: { "@type": "SpeakableSpecification", cssSelector: ["h1", ".tldr-box", ".prose > p:first-of-type"] }, url },
  ]
  if (meta.faqs?.length) jsonld.push({ "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: meta.faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) })

  const faqHtml = meta.faqs?.length ? `<section class="faq"><h2>FAQ</h2>${meta.faqs.map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join("")}</section>` : ""
  const takeHtml = meta.takeaways?.length ? `<section class="takeaways"><h2>Key takeaways</h2><ul>${meta.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>` : ""
  return head(meta, jsonld) + `
  <article class="post">
    <div class="crumb"><a href="/blog">Blog</a> · ${esc(meta.category)} · ${esc(meta.date)}</div>
    <h1>${esc(meta.title)}</h1>
    <div class="by">${esc(meta.author || "Klavity")}</div>
    <div class="tldr-box"><b>TL;DR</b>${esc(meta.tldr)}</div>
    <div class="prose">${bodyHtml}</div>
    ${takeHtml}${faqHtml}
    <section class="cta"><h2>Catch bugs the moment a human sees them</h2><p>Klavity: right-click bug reports, AI personas that review your product, and self-healing tests.</p><a class="btn btn-primary" href="/onboarding">Get started free</a></section>
  </article></main>${FOOTER}</body></html>`
}

function loadReg(): RegEntry[] { return existsSync(REG) ? JSON.parse(readFileSync(REG, "utf8")) : [] }

function renderIndex(reg: RegEntry[]): string {
  const cards = reg.sort((a, b) => b.date.localeCompare(a.date)).map((p) => `
    <a class="bcard reveal" href="/blog/${p.slug}"><div class="bcat">${esc(p.category)} · ${esc(p.date)}</div><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></a>`).join("")
  const metaIndex: BlogMeta = { title: "Klavity Blog — AI bug reporting, QA & testing", slug: "", excerpt: "Helpful, specific guides on AI bug reporting, user-persona testing, and self-healing QA — from the team building Klavity.", category: "Blog", date: new Date().toISOString().slice(0, 10), tldr: "" }
  return head(metaIndex, [{ "@context": "https://schema.org", "@type": "Blog", url: `${BASE}/blog`, name: "Klavity Blog" }]).replace('aria-current="page">Blog', 'aria-current="page">Blog') + `
  <div class="wrap" style="max-width:900px;padding:48px 22px 80px">
    <p class="eyebrow">The Klavity blog</p>
    <h1 style="font-family:var(--display);font-weight:600;font-size:clamp(34px,6vw,52px);letter-spacing:-.02em;margin:8px 0 8px">Helpful, specific, no fluff.</h1>
    <p style="color:var(--paper-dim);font-size:18px;max-width:60ch;margin:0 0 36px">Practical guides on AI bug reporting, persona-driven testing, and self-healing QA.</p>
    <div class="bgrid">${cards || '<p style="color:var(--paper-faint)">First post coming soon.</p>'}</div>
  </div>
  <style>.bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
  .bcard{display:block;border:1px solid var(--line);border-radius:16px;padding:22px;transition:transform .15s,border-color .2s}
  .bcard:hover{transform:translateY(-3px);border-color:var(--paper-faint)}
  .bcard .bcat{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--paper-faint)}
  .bcard h3{font-family:var(--display);font-weight:600;font-size:21px;margin:8px 0 6px;color:var(--paper)}
  .bcard p{color:var(--paper-dim);font-size:15px;line-height:1.5;margin:0}</style>
  </main>${FOOTER}</body></html>`
}

// ── main ──
if (import.meta.main) {
  const inPath = process.argv[2]
  if (!inPath) { console.error("usage: bun scripts/blog-publish.ts <post.json>"); process.exit(1) }
  const { meta, bodyHtml } = JSON.parse(readFileSync(inPath, "utf8")) as { meta: BlogMeta; bodyHtml: string }
  if (!meta?.title || !bodyHtml) { console.error("post.json needs meta.title + bodyHtml"); process.exit(1) }
  meta.slug = slugify(meta.slug || meta.title)
  meta.date = meta.date || new Date().toISOString().slice(0, 10)
  if (!existsSync(BLOG)) mkdirSync(BLOG, { recursive: true })
  let reg = loadReg()
  if (reg.some((r) => r.slug === meta.slug)) meta.slug = `${meta.slug}-${Date.now().toString(36).slice(-4)}`
  writeFileSync(join(BLOG, `${meta.slug}.html`), renderPost(meta, bodyHtml))
  reg = reg.filter((r) => r.slug !== meta.slug)
  reg.push({ slug: meta.slug, title: meta.title, excerpt: meta.excerpt, category: meta.category, date: meta.date })
  writeFileSync(REG, JSON.stringify(reg, null, 2))
  writeFileSync(join(BLOG, "index.html"), renderIndex(reg))
  console.log(`published: site/blog/${meta.slug}.html  (${reg.length} posts in registry)`)
}

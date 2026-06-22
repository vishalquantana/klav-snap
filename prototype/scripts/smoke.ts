// Post-deploy synthetic smoke test — headless Playwright against LIVE prod.
//
// Asserts REAL rendered behavior (not just marker presence), catching the render-regression class our
// marker-based integrity check misses:
//   (a) dashboard — the 4 overview stat NUMBERS populate within ~8s (no .sk skeleton left, non-empty)
//   (b) the report widget mounts on a public page + right-click opens its menu (.klm-menu)
//   (c) each nav view (Sims, Tickets, Triage, Team, Settings) renders without an error/stuck-skeleton state
//   (d) ZERO console errors / failed (4xx-5xx / network-failure) same-origin requests on load
//
// Run:  cd prototype && bun run smoke      (one command — the merge-loop calls this post-deploy)
// Exits non-zero and prints every failure. SMOKE_BASE_URL / SMOKE_EMAIL override the defaults.
//
// Auth: the dashboard needs a session. With Turso creds in env (the prod/merge-loop context) we seed a
// short-lived session for the test user and clean it up after. WITHOUT creds, or if the test user has no
// account, we run the public widget check only and report that the authed checks were skipped.
import { chromium } from "playwright"
import { createClient } from "@libsql/client"
import { randomBytes, createHash } from "node:crypto"

const BASE = (process.env.SMOKE_BASE_URL || "https://klavity.quantana.top").replace(/\/$/, "")
const EMAIL = process.env.SMOKE_EMAIL || "vishal@quantana.com.au"
const HOST = new URL(BASE).hostname

const fails: string[] = []
const FAIL = (m: string) => { fails.push(m); console.log("  ✗ " + m) }
const PASS = (m: string) => console.log("  ✓ " + m)

// Same-origin requests that are expected to be absent/unauth on a public load — not real failures.
const BENIGN = [/\/favicon\./i, /\/api\/extension-token/i, /\/api\/widget\/ping/i]
const realErrors = (errs: string[]) => errs.filter(e => !BENIGN.some(rx => rx.test(e)))

function watch(page: import("playwright").Page): string[] {
  const errs: string[] = []
  page.on("console", m => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 220)) })
  page.on("pageerror", e => errs.push("pageerror: " + String(e?.message || e).slice(0, 220)))
  page.on("requestfailed", r => { const u = r.url(); if (u.startsWith(BASE)) errs.push(`requestfailed ${r.method()} ${u} (${r.failure()?.errorText || "?"})`) })
  page.on("response", r => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400) errs.push(`http ${r.status()} ${u}`) })
  return errs
}

async function turso() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL
  if (!url) return null
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined })
}

// Seed a short-lived session for the test user (createSession stores sha256(id); we send the raw token
// as the klav_session cookie — getSession dual-reads). Returns the cookie value, or null if unavailable.
async function seedSession(): Promise<string | null> {
  const c = await turso(); if (!c) return null
  try {
    const u = (await c.execute({ sql: "SELECT email FROM users WHERE email=?", args: [EMAIL] })).rows
    if (!u.length) { console.log(`  [auth] test user ${EMAIL} not found — skipping authed checks`); return null }
    const token = "sess_smoke_" + randomBytes(18).toString("hex")
    const now = Date.now()
    await c.execute({ sql: "INSERT INTO sessions (id, email, created_at, expires_at) VALUES (?,?,?,?)", args: [createHash("sha256").update(token).digest("hex"), EMAIL, now, now + 20 * 60 * 1000] })
    return token
  } catch (e: any) { console.log("  [auth] session seed failed: " + (e?.message || e)); return null }
}
async function dropSession(token: string) {
  const c = await turso(); if (!c) return
  await c.execute({ sql: "DELETE FROM sessions WHERE id=?", args: [createHash("sha256").update(token).digest("hex")] }).catch(() => {})
}

const main = async () => {
  console.log(`Post-deploy smoke → ${BASE}\n`)
  const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox"]
  // headless:true defaults to the chrome-headless-shell build; if it isn't installed, fall back to the
  // full chromium binary that IS installed (chromium.executablePath()).
  const browser = await chromium.launch({ headless: true, args: launchArgs })
    .catch(() => chromium.launch({ headless: true, args: launchArgs, executablePath: chromium.executablePath() }))
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  try {
    // ── (b) + (d) public: widget mounts + right-click menu, zero errors on the home page ──
    console.log("[public] home page — widget + console/network")
    const hp = await ctx.newPage(); const herr = watch(hp)
    await hp.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 })
    await hp.waitForTimeout(1800) // deferred /widget.js mount
    await hp.mouse.click(640, 460, { button: "right" }).catch(() => {})
    try { await hp.locator(".klm-menu").first().waitFor({ state: "visible", timeout: 6000 }); PASS("report widget mounted + right-click menu opened") }
    catch { FAIL("report widget right-click menu (.klm-menu) did not open on the home page") }
    for (const e of realErrors(herr)) FAIL("home: " + e)
    if (!realErrors(herr).length) PASS("home: no console errors / failed requests")
    await hp.close()

    // ── auth ──
    const token = await seedSession()
    if (!token) {
      FAIL("authenticated dashboard checks SKIPPED (no Turso creds or test user) — see auth note")
    } else {
      await ctx.addCookies([{ name: "klav_session", value: token, domain: HOST, path: "/", httpOnly: true, secure: true, sameSite: "Lax" }])
      console.log("[auth] seeded short-lived session for " + EMAIL)

      console.log("[dashboard] overview stat numbers populate (no skeleton)")
      const dp = await ctx.newPage(); const derr = watch(dp)
      await dp.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 })
      const STAT_IDS = ["stFeedback", "stSims", "stTeam", "stTickets"]
      try {
        // every stat: skeleton gone AND non-empty text — within 8s (the exact bug that slipped through)
        await dp.waitForFunction((ids) => ids.every((id) => {
          const e = document.getElementById(id)
          return !!e && !e.querySelector(".sk") && (e.textContent || "").trim().length > 0
        }), STAT_IDS, { timeout: 8000 })
        const vals = await dp.evaluate((ids) => ids.map((id) => (document.getElementById(id)?.textContent || "").trim()), STAT_IDS)
        PASS(`overview stats populated: ${STAT_IDS.map((id, i) => id.replace("st", "") + "=" + vals[i]).join("  ")}`)
      } catch {
        for (const id of STAT_IDS) {
          const e = dp.locator("#" + id)
          const skel = await e.locator(".sk").count().catch(() => 0)
          const txt = (await e.textContent().catch(() => "") || "").trim()
          if (skel > 0) FAIL(`dashboard #${id} STILL SHOWING SKELETON after 8s (number never populated)`)
          else if (!txt) FAIL(`dashboard #${id} empty after 8s`)
        }
        if (!fails.some(f => f.includes("#st"))) FAIL("dashboard stats did not populate within 8s")
      }

      // ── (c) each nav view renders without an error / stuck skeleton ──
      console.log("[dashboard] nav views render")
      for (const view of ["sims", "tickets", "triage", "team", "settings"]) {
        await dp.click(`.side .nv[data-go="${view}"]`).catch(() => {})
        await dp.waitForTimeout(1500)
        const view_active = await dp.evaluate(v => document.body.getAttribute("data-view") === v, view)
        // Only count error/skeleton state that is actually RENDERED (visible). The dashboard ships hidden
        // error placeholders (e.g. "Couldn't load — try refreshing.") and the error strings appear in
        // <script> source — page-wide text matching counts those and false-positives. Walk the live DOM and
        // require a non-script element with a real box (offsetParent + size) to flag a genuine error state.
        const probe = await dp.evaluate((v) => {
          const errRx = /couldn.?t load|failed to load|something went wrong/i
          const visible = (el: Element) => { const r = el.getBoundingClientRect(); return !!(el as HTMLElement).offsetParent && r.width > 0 && r.height > 0 }
          // scope to the active view's own container(s); a stray visible error/skeleton elsewhere on the
          // page (e.g. the always-present overview activity feed) shouldn't be charged to this nav view.
          const scopes = Array.from(document.querySelectorAll(`[data-view~="${v}"]`)).filter(visible)
          const roots = scopes.length ? scopes : [document.body]
          let err: string | null = null, stuckSk = false
          for (const root of roots) for (const el of Array.from(root.querySelectorAll("*"))) {
            if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue
            if (!err) {
              const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent || "").join("")
              if (errRx.test(own) && visible(el)) err = own.trim().slice(0, 80)
            }
            if (!stuckSk && el.classList.contains("sk") && visible(el)) stuckSk = true
          }
          return { err, stuckSk }
        }, view).catch(() => ({ err: null as string | null, stuckSk: false }))
        if (!view_active) FAIL(`nav ${view}: view did not activate`)
        else if (probe.err) FAIL(`nav ${view}: error state visible — "${probe.err}"`)
        else if (probe.stuckSk) FAIL(`nav ${view}: stuck skeleton (content never rendered)`)
        else PASS(`nav ${view} rendered`)
      }
      for (const e of realErrors(derr)) FAIL("dashboard: " + e)
      if (!realErrors(derr).length) PASS("dashboard: no console errors / failed requests")
      await dp.close()
      await dropSession(token)
    }
  } finally {
    await ctx.close(); await browser.close()
  }

  if (fails.length) { console.log(`\nSMOKE FAILED — ${fails.length} issue(s):`); for (const f of fails) console.log("  • " + f); process.exit(1) }
  console.log("\nSMOKE PASSED ✔"); process.exit(0)
}

main().catch((e) => { console.error("smoke crashed:", e?.stack || e); process.exit(2) })

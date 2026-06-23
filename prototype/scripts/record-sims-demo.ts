/**
 * record-sims-demo.ts
 *
 * Records a .webm video of the Klavity on-page Sims flow on bigidea.quantana.top:
 *   load page -> right-click -> Deploy all Sims -> 3 avatars dock WATCHING -> (optionally react)
 *
 * DEFAULT: anonymous mode — no auth required. Sims deploy + dock visually; review
 * returns 401 but the deploy/dock animation still plays. Use this to get a video NOW.
 *
 * AUTH modes (for the full AI-reacting version):
 *   KLAV_BEARER_TOKEN=ext_xxx  pass a pre-minted extension token directly
 *   KLAV_SESSION=<cookie-val>  raw klav_session value; script fetches a Bearer token
 *   KLAV_EMAIL=you@example.com  (no OTP) -> requests OTP and exits with instructions
 *   KLAV_EMAIL=x KLAV_OTP=123456 -> verifies OTP, gets session, records with auth
 *   KLAV_HEADED=1              -> opens headed browser on klavity.quantana.top for
 *                                 interactive OTP login (requires display)
 *
 * Output: ~/Downloads/sims-bigidea-demo.webm  (override: KLAV_VIDEO_OUT=<path>)
 *
 * Usage:
 *   cd prototype
 *   bun scripts/record-sims-demo.ts                        # anonymous, works immediately
 *   KLAV_BEARER_TOKEN=ext_xxx bun scripts/record-sims-demo.ts  # authed, full reactions
 *   KLAV_EMAIL=you@example.com bun scripts/record-sims-demo.ts # request OTP then exit
 *   KLAV_EMAIL=x KLAV_OTP=123456 bun scripts/record-sims-demo.ts # verify + record
 */

import { chromium } from "@playwright/test"
import { existsSync, mkdirSync, renameSync, copyFileSync, unlinkSync, rmdirSync } from "fs"
import { resolve, dirname } from "path"
import { homedir } from "os"

const BIGIDEA_URL      = "https://bigidea.quantana.top"
const KLAV_URL         = "https://klavity.quantana.top"
const WIDGET_TOKEN_KEY = "klavity_widget_token"

const VIDEO_OUT = process.env.KLAV_VIDEO_OUT
  || resolve(homedir(), "Downloads", "sims-bigidea-demo.webm")

function log(msg: string) { console.log(`[sims-demo] ${msg}`) }
async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function mintTokenFromSession(session: string): Promise<string | null> {
  try {
    const res = await fetch(`${KLAV_URL}/api/extension/config`, {
      headers: { cookie: `klav_session=${session}` },
    })
    if (!res.ok) { log(`extension/config -> ${res.status}`); return null }
    const data = await res.json()
    return data?.token || null
  } catch (e: any) { log(`mintTokenFromSession: ${e.message}`); return null }
}

async function otpRequest(email: string): Promise<void> {
  const r = await fetch(`${KLAV_URL}/api/auth/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`OTP request failed: ${JSON.stringify(d)}`)
  log(`OTP sent to ${email}. Now run:`)
  log(`  KLAV_EMAIL=${email} KLAV_OTP=<6-digit-code> bun scripts/record-sims-demo.ts`)
}

async function otpVerify(email: string, otp: string): Promise<string | null> {
  const r = await fetch(`${KLAV_URL}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: otp }),
  })
  if (!r.ok) { log(`OTP verify failed: ${r.status}`); return null }
  const m = (r.headers.get("set-cookie") || "").match(/klav_session=([^;]+)/)
  return m ? m[1] : null
}

// ── Resolve bearer token (or null for anonymous) ──────────────────────────────

async function resolveAuth(): Promise<{ token: string | null; method: string }> {
  // Direct bearer token
  if (process.env.KLAV_BEARER_TOKEN) {
    log("Using KLAV_BEARER_TOKEN")
    return { token: process.env.KLAV_BEARER_TOKEN, method: "env-bearer" }
  }

  // Session cookie -> bearer
  if (process.env.KLAV_SESSION) {
    log("Minting bearer from KLAV_SESSION...")
    const token = await mintTokenFromSession(process.env.KLAV_SESSION)
    if (token) return { token, method: "session->bearer" }
  }

  // OTP flow: KLAV_EMAIL only -> request OTP and exit
  if (process.env.KLAV_EMAIL && !process.env.KLAV_OTP) {
    await otpRequest(process.env.KLAV_EMAIL)
    process.exit(0)
  }

  // OTP flow: KLAV_EMAIL + KLAV_OTP -> verify and mint bearer
  if (process.env.KLAV_EMAIL && process.env.KLAV_OTP) {
    log("Verifying OTP...")
    const session = await otpVerify(process.env.KLAV_EMAIL, process.env.KLAV_OTP)
    if (session) {
      const token = await mintTokenFromSession(session)
      if (token) return { token, method: "otp->bearer" }
    }
  }

  // Headed browser login (requires display + KLAV_HEADED=1)
  if (process.env.KLAV_HEADED === "1") {
    log("KLAV_HEADED=1: launching headed browser for interactive login...")
    return { token: null, method: "headed-pending" }
  }

  // Default: anonymous
  return { token: null, method: "anonymous" }
}

// ── Record the demo ───────────────────────────────────────────────────────────

async function record(bearerToken: string | null): Promise<void> {
  const videoDir = dirname(VIDEO_OUT)
  mkdirSync(videoDir, { recursive: true })
  const tmpVideoDir = resolve(videoDir, ".klav-video-tmp")
  mkdirSync(tmpVideoDir, { recursive: true })

  const headless = process.env.KLAV_HEADED !== "1"
  log(`Launching ${headless ? "headless" : "headed"} Chromium...`)

  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  // ── Optional: headed login to get session then bearer ──
  if (!bearerToken && process.env.KLAV_HEADED === "1") {
    log("Opening klavity.quantana.top — enter email + OTP in the browser window...")
    const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const loginPage = await loginCtx.newPage()
    await loginPage.goto(`${KLAV_URL}/dashboard`, { waitUntil: "networkidle" })
    await loginPage.waitForURL(/\/dashboard/, { timeout: 3 * 60 * 1000 })
    const cookies = await loginCtx.cookies()
    const sessionVal = cookies.find(c => c.name === "klav_session")?.value
    if (sessionVal) bearerToken = await mintTokenFromSession(sessionVal)
    await loginCtx.close()
    if (bearerToken) log("Headed login succeeded; got bearer token")
    else log("Headed login did not yield a token; falling back to anonymous recording")
  }

  // ── Recording context ──
  log(`Recording to: ${VIDEO_OUT}`)
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: tmpVideoDir, size: { width: 1440, height: 900 } },
    ...(bearerToken ? {
      storageState: {
        origins: [{ origin: BIGIDEA_URL, localStorage: [{ name: WIDGET_TOKEN_KEY, value: bearerToken }] }],
        cookies: [],
      },
    } : {}),
  })
  const page = await ctx.newPage()

  // ── Navigate ──
  log(`Navigating to ${BIGIDEA_URL}...`)
  await page.goto(BIGIDEA_URL, { waitUntil: "domcontentloaded", timeout: 30_000 })

  // Wait for Klavity widget host element
  log("Waiting for Klavity widget to boot...")
  await page.waitForFunction(
    () => !!document.getElementById("klavity-widget-host"),
    { timeout: 15_000 }
  ).catch(() => log("Widget host not detected after 15s — continuing"))

  // Ensure token is in localStorage even if storageState injection missed it
  if (bearerToken) {
    const stored = await page.evaluate((key) => localStorage.getItem(key), WIDGET_TOKEN_KEY)
    if (!stored) {
      await page.evaluate(
        ([key, val]) => localStorage.setItem(key, val as string),
        [WIDGET_TOKEN_KEY, bearerToken]
      )
      log("Token injected via page.evaluate")
    } else {
      log(`Token confirmed in localStorage (${stored.slice(0, 10)}...)`)
    }
  }

  // Brief pause so the page fully settles before right-click
  await sleep(2_000)

  // ── Right-click to open Klavity context menu ──
  log("Right-clicking to open Klavity context menu...")
  await page.mouse.move(720, 400)
  await sleep(200)
  await page.mouse.click(720, 400, { button: "right" })
  await sleep(1_200)

  // ── Click "Deploy all Sims" ──
  // First try Playwright's shadow-piercing getByText, then JS fallback
  const deployBtn = page.getByText("Deploy all Sims", { exact: true })
  const isVisible = await deployBtn.isVisible({ timeout: 6_000 }).catch(() => false)

  if (isVisible) {
    log('Clicking "Deploy all Sims"...')
    await deployBtn.click()
  } else {
    log('getByText miss — using shadow DOM evaluate fallback...')
    const clicked = await page.evaluate(() => {
      const host = document.getElementById("klavity-widget-host")
      if (!host?.shadowRoot) return false
      for (const el of host.shadowRoot.querySelectorAll("button, [role=button]")) {
        if ((el as HTMLElement).textContent?.trim() === "Deploy all Sims") {
          (el as HTMLElement).click()
          return true
        }
      }
      return false
    })
    if (!clicked) log("WARN: Could not find Deploy all Sims button — recording anyway")
  }

  // ── Wait for dock + reactions ──
  log("Waiting for Sims to dock (WATCHING state)...")
  await sleep(2_500)

  if (bearerToken) {
    log("Waiting up to 45s for AI reactions...")
    await page.waitForFunction(
      () => {
        const dockHost = document.getElementById("kl-sims-dock-host")
          || document.querySelector("[id^='kl-sims']")
        if (dockHost?.shadowRoot) {
          if (dockHost.shadowRoot.querySelectorAll(".ksl-pin,.ksl-walker,.ksl-obs").length > 0) return true
        }
        return false
      },
      { timeout: 45_000 }
    ).catch(() => log("No reaction nodes found in 45s — capturing current state"))
  } else {
    // Anonymous: 12s is enough for the 3 avatars to jump in and show WATCHING
    log("Anonymous: waiting 12s for avatars to dock...")
    await sleep(12_000)
  }

  // 4s steady-state hold so the final frame is clean
  await sleep(4_000)

  // ── Flush and save ──
  log("Closing context — Playwright will flush the video...")
  const videoPath = await page.video()?.path()
  await ctx.close()
  await browser.close()

  if (!videoPath || !existsSync(videoPath)) {
    log(`WARN: No video file found at path: ${videoPath}`)
    return
  }

  try {
    renameSync(videoPath, VIDEO_OUT)
  } catch {
    copyFileSync(videoPath, VIDEO_OUT)
    unlinkSync(videoPath)
  }
  try { rmdirSync(tmpVideoDir) } catch {}

  log(`Video saved: ${VIDEO_OUT}`)
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const { token, method } = await resolveAuth()
  log(`Auth method: ${method}`)
  if (!token) log("Recording anonymous deploy+dock flow (no AI reactions)")
  await record(token)
  log(token ? "Full authed flow recorded (AI reactions)" : "Anonymous flow recorded (deploy+dock only)")
}

main().catch(e => { console.error(e); process.exit(1) })

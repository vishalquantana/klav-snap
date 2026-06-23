/**
 * Records and verifies the production Klavity Sims reaction flow on bigidea.
 *
 * Authenticated run:
 *   KLAV_EMAIL=vishal@quantana.com.au KLAV_OTP=666666 \
 *     bun scripts/record-sims-demo.ts
 *
 * Output:
 *   ~/Downloads/sims-bigidea-reacting.webm
 */

import { chromium, type Page } from "@playwright/test"
import { copyFileSync, existsSync, mkdirSync, renameSync, rmdirSync, unlinkSync } from "fs"
import { homedir } from "os"
import { dirname, resolve } from "path"

const BIGIDEA_ORIGIN = "https://bigidea.quantana.top"
const BIGIDEA_PROJECT_ID = process.env.KLAV_PROJECT_ID || "proj_6d574acf-c927-48c8-b2d8-88364af3ca3a"
const KLAV_URL = process.env.KLAV_API_ORIGIN || "https://klavity.quantana.top"
const WIDGET_TOKEN_KEY = "klavity_widget_token"
const RUN_ID = process.env.KLAV_RUN_ID || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const TARGET_URL = process.env.KLAV_TARGET_URL || `${BIGIDEA_ORIGIN}/?klav_verify=${encodeURIComponent(RUN_ID)}`
const VIDEO_OUT = process.env.KLAV_VIDEO_OUT || resolve(homedir(), "Downloads", "sims-bigidea-reacting.webm")

type ReviewResponse = {
  reviews?: Array<{ observations?: unknown[] }>
}

function log(message: string): void {
  console.log(`[sims-demo] ${message}`)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function otpRequest(email: string): Promise<void> {
  const response = await fetch(`${KLAV_URL}/api/auth/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`OTP request failed: ${JSON.stringify(body)}`)
  }
  log(`OTP sent to ${email}. Re-run with KLAV_EMAIL=${email} KLAV_OTP=<code>`)
}

async function otpVerify(email: string, otp: string): Promise<string | null> {
  const response = await fetch(`${KLAV_URL}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: otp }),
  })
  const body = await response.text().catch(() => "")
  if (!response.ok) {
    throw new Error(`OTP verify failed (${response.status}): ${body}`)
  }
  const cookie = response.headers.get("set-cookie") || ""
  const match = cookie.match(/klav_session=([^;]+)/)
  return match?.[1] || null
}

async function mintWidgetTokenFromSession(session: string): Promise<string> {
  const response = await fetch(`${KLAV_URL}/api/widget/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `klav_session=${session}`,
    },
    body: JSON.stringify({
      projectId: BIGIDEA_PROJECT_ID,
      origin: BIGIDEA_ORIGIN,
    }),
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Widget token mint failed (${response.status}): ${body}`)
  }
  const json = JSON.parse(body) as { token?: string }
  if (!json.token) {
    throw new Error(`Widget token mint returned no token: ${body}`)
  }
  return json.token
}

async function resolveAuth(): Promise<{ token: string | null; method: string }> {
  if (process.env.KLAV_BEARER_TOKEN) {
    return { token: process.env.KLAV_BEARER_TOKEN, method: "env-bearer" }
  }

  if (process.env.KLAV_SESSION) {
    const token = await mintWidgetTokenFromSession(process.env.KLAV_SESSION)
    return { token, method: "session->widget-token" }
  }

  const email = process.env.KLAV_EMAIL
  const otp = process.env.KLAV_OTP
  if (email && !otp) {
    await otpRequest(email)
    process.exit(0)
  }
  if (email && otp) {
    const session = await otpVerify(email, otp)
    if (!session) {
      throw new Error("OTP verify succeeded but no klav_session cookie was returned")
    }
    const token = await mintWidgetTokenFromSession(session)
    return { token, method: "otp->widget-token" }
  }

  return { token: null, method: "anonymous" }
}

async function installToken(page: Page, token: string | null): Promise<void> {
  if (!token) {
    return
  }
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key as string, value as string)
    },
    [WIDGET_TOKEN_KEY, token],
  )
}

async function openKlavityMenu(page: Page): Promise<void> {
  const cards = page.locator("#klavity-widget-host .klm-card")
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.mouse.move(720, 400)
    await page.mouse.click(720, 400, { button: "right" })
    await sleep(500)
    if ((await cards.count()) > 0) {
      return
    }

    await page.evaluate(() => {
      const x = Math.round(window.innerWidth * 0.55)
      const y = Math.round(window.innerHeight * 0.45)
      const target = document.elementFromPoint(x, y) || document.body
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      )
    })
    await sleep(500)
    if ((await cards.count()) > 0) {
      return
    }
  }
  throw new Error("Klavity context menu did not open")
}

function parseRenderMs(logs: string[]): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const match = logs[i].match(/\brenderMs=(\d+)/)
    if (match) {
      return Number(match[1])
    }
  }
  return null
}

async function waitForRenderMs(logs: string[], timeoutMs: number): Promise<number | null> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const renderMs = parseRenderMs(logs)
    if (renderMs !== null) {
      return renderMs
    }
    await sleep(250)
  }
  return null
}

async function record(token: string | null): Promise<void> {
  const videoDir = dirname(VIDEO_OUT)
  mkdirSync(videoDir, { recursive: true })
  const tmpVideoDir = resolve(videoDir, ".klav-video-tmp")
  mkdirSync(tmpVideoDir, { recursive: true })

  const browser = await chromium.launch({
    headless: process.env.KLAV_HEADED !== "1",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: tmpVideoDir, size: { width: 1440, height: 900 } },
    ...(token
      ? {
          storageState: {
            origins: [
              {
                origin: BIGIDEA_ORIGIN,
                localStorage: [{ name: WIDGET_TOKEN_KEY, value: token }],
              },
            ],
            cookies: [],
          },
        }
      : {}),
  })

  const page = await context.newPage()
  await installToken(page, token)

  const benchLogs: string[] = []
  let reviewResponse: unknown = null
  page.on("console", (msg) => {
    const text = msg.text()
    if (text.includes("[bench-sim-review]")) {
      benchLogs.push(text)
    }
    console.log(`[browser:${msg.type()}] ${text}`)
  })
  page.on("response", async (response) => {
    if (!response.url().includes("/api/sim/review")) {
      return
    }
    try {
      reviewResponse = await response.json()
    } catch {
      reviewResponse = await response.text().catch(() => null)
    }
  })

  let assertionError: Error | null = null
  try {
    log(`Recording to: ${VIDEO_OUT}`)
    log(`Navigating to ${TARGET_URL}`)
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 45_000 })
    await page.waitForFunction(() => Boolean((window as any).KlavitySims), null, { timeout: 30_000 })
    await page.waitForFunction(
      () => Boolean((document.getElementById("klavity-widget-host") as HTMLElement & { shadowRoot?: ShadowRoot })?.shadowRoot),
      null,
      { timeout: 30_000 },
    )

    await openKlavityMenu(page)
    const deploy = page.locator("#klavity-widget-host .klm-card").filter({ hasText: "Deploy all Sims" })
    const deployCount = await deploy.count()
    if (deployCount === 0) {
      throw new Error("Deploy all Sims was not found in the Klavity shadow menu")
    }
    log('Clicking "Deploy all Sims"')
    const deployClickedAt = Date.now()
    await deploy.first().click()

    log("Waiting for review reactions")
    await page.waitForFunction(
      () => {
        const dock = document.getElementById("klav-sims-live") as HTMLElement & { shadowRoot?: ShadowRoot }
        const shadowCount = dock?.shadowRoot?.querySelectorAll(".ksl-bubble").length || 0
        const lightCount = document.querySelectorAll(".klav-halo,.klav-pin,.klav-walker").length
        return shadowCount + lightCount > 0
      },
      null,
      { timeout: 90_000 },
    )
    const reactionNodeAppearedAt = Date.now()

    const counts = await page.evaluate(() => {
      const dock = document.getElementById("klav-sims-live") as HTMLElement & { shadowRoot?: ShadowRoot }
      const overlay = document.getElementById("klav-sims-overlay") as HTMLElement & { shadowRoot?: ShadowRoot }
      const bubbles = dock?.shadowRoot?.querySelectorAll(".ksl-bubble").length || 0
      const slots = dock?.shadowRoot?.querySelectorAll(".ksl-slot").length || 0
      const halos = document.querySelectorAll(".klav-halo").length
      const pins = document.querySelectorAll(".klav-pin").length
      const walkers = document.querySelectorAll(".klav-walker").length
      const overlayChildren = overlay?.shadowRoot?.childElementCount || 0
      return { bubbles, slots, halos, pins, walkers, overlayChildren, total: bubbles + halos + pins + walkers }
    })

    const review = reviewResponse as ReviewResponse | null
    const observationCount =
      review?.reviews?.reduce(
        (sum, item) => sum + (Array.isArray(item.observations) ? item.observations.length : 0),
        0,
      ) || 0
    if (observationCount <= 0) {
      throw new Error(`Review response did not include observations: ${JSON.stringify(reviewResponse)}`)
    }

    const renderMs = await waitForRenderMs(benchLogs, 15_000)
    const verifierRenderMs = reactionNodeAppearedAt - deployClickedAt
    if (renderMs === null) {
      throw new Error(`Expected a production renderMs bench log. Logs: ${JSON.stringify(benchLogs)}`)
    }
    if (verifierRenderMs <= 0) {
      throw new Error(`Expected positive verifier render duration; got ${verifierRenderMs}`)
    }
    if (counts.total <= 0) {
      throw new Error(`Expected reaction nodes; got ${JSON.stringify(counts)}`)
    }

    log(`Reaction DOM assertion passed: ${JSON.stringify(counts)}`)
    log(`Review response observations: ${observationCount}`)
    log(`production renderMs: ${renderMs}; verifier renderMs: ${verifierRenderMs}`)
    await sleep(6_000)
  } catch (error) {
    assertionError = error instanceof Error ? error : new Error(String(error))
    console.error(`[sims-demo] Assertion failed: ${assertionError.message}`)
    await sleep(3_000)
  } finally {
    const videoPath = await page.video()?.path()
    await context.close()
    await browser.close()

    if (videoPath && existsSync(videoPath)) {
      try {
        renameSync(videoPath, VIDEO_OUT)
      } catch {
        copyFileSync(videoPath, VIDEO_OUT)
        unlinkSync(videoPath)
      }
      log(`Video saved: ${VIDEO_OUT}`)
    } else {
      log(`WARN: no Playwright video was produced at ${videoPath}`)
    }
    try {
      rmdirSync(tmpVideoDir)
    } catch {}
  }

  if (assertionError) {
    throw assertionError
  }
}

async function main(): Promise<void> {
  const { token, method } = await resolveAuth()
  log(`Auth method: ${method}${token ? " (token installed)" : ""}`)
  if (!token) {
    throw new Error("Authenticated recording is required for reaction verification")
  }
  await record(token)
  log("Full authed flow recorded and verified")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

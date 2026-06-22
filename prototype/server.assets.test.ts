// Static asset routes. Regression guard for the icons-not-emojis breakage:
// every served HTML page does <script src="/icons.generated.js"> and calls
// kicon()/window.KLAV_ICONS, but the server had NO route for it → 404 →
// "kicon is not defined" → the dashboard (and every page) failed to render.
// Spawns a real server subprocess (mirrors server.widget.test.ts) and asserts
// the asset is served as executable JS with the helper + icon data.

import { test, expect, beforeAll, afterAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-assets-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")

let serverPort: number
let serverProc: ReturnType<typeof Bun.spawn>
let base: string

beforeAll(async () => {
  serverPort = 30000 + Math.floor(Math.random() * 1000)
  base = `http://localhost:${serverPort}`
  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(serverPort),
      TURSO_DATABASE_URL: "file:" + srvDbFile,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET,
      KLAV_BASE_URL: base,
      KLAV_ALLOWED_DOMAINS: "test.local",
      KLAV_DEV_SHOW_OTP: "1",
      SENDGRID_API_KEY: "",
      KLAV_MAIL_FROM: "",
      OPENROUTER_API_KEY: "test-key",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const r = await fetch(`${base}/favicon.svg`).catch(() => null)
    if (r && r.status < 500) break
    await Bun.sleep(150)
  }
})

afterAll(() => { serverProc?.kill() })

test("GET /icons.generated.js is served as executable JS (not 404)", async () => {
  const r = await fetch(base + "/icons.generated.js")
  expect(r.status).toBe(200)
  // Must be an executable JS MIME or the browser refuses to run it (strict MIME checking).
  expect((r.headers.get("content-type") || "").toLowerCase()).toContain("javascript")
})

test("the served icons bundle defines window.kicon and the icon data", async () => {
  const body = await fetch(base + "/icons.generated.js").then((r) => r.text())
  // app pages (dashboard/login/sim-studio) rely on the self-contained helper
  expect(body).toContain("window.kicon")
  // both site + app pages read the raw icon map from here
  expect(body).toContain("window.KLAV_ICONS")
  // a couple of icons the dashboard actually renders
  expect(body).toContain('"dna"')
  expect(body).toContain('"bug"')
})

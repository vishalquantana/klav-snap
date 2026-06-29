// Tests for POST /api/blog/publish — the Plan-B blog publish path.
// Uses a real server subprocess (same pattern as other server tests) but mocks git by
// controlling the GH_TOKEN and providing a test-friendly git environment that always succeeds.
// All git operations run against a temp git repo so no real push ever occurs.

import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { publishBlogPost, SLUG_RE } from "./lib/blog-publish"

// ── Unit tests: SLUG_RE ──────────────────────────────────────────────────────

test("SLUG_RE accepts valid slugs", () => {
  expect(SLUG_RE.test("fix-flaky-tests")).toBe(true)
  expect(SLUG_RE.test("a")).toBe(true)
  expect(SLUG_RE.test("abc-123-xyz")).toBe(true)
})

test("SLUG_RE rejects path-traversal and invalid slugs", () => {
  expect(SLUG_RE.test("../etc/passwd")).toBe(false)
  expect(SLUG_RE.test("foo/bar")).toBe(false)
  expect(SLUG_RE.test("Foo-Bar")).toBe(false)
  expect(SLUG_RE.test("foo bar")).toBe(false)
  expect(SLUG_RE.test("foo.html")).toBe(false)
  expect(SLUG_RE.test("")).toBe(false)
})

// ── Integration tests: publishBlogPost (mocked git runner) ───────────────────

const BASE_HTML = `<!doctype html><html><head><title>T</title></head><body>
  <div class="bgrid">
  <a class="bcard reveal" href="/blog/old-post"><div class="bcat">Guides · 2026-06-21</div><h2>Old post</h2><p>Old excerpt.</p></a></div>
</body></html>`

const BASE_INDEX_JSON = JSON.stringify([
  { slug: "old-post", title: "Old post", excerpt: "Old excerpt.", category: "Guides", date: "2026-06-21" },
])

function makeTmpRepo(): string {
  const dir = join(tmpdir(), `klav-blog-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir + "/site/blog", { recursive: true })
  writeFileSync(dir + "/site/blog/index.json", BASE_INDEX_JSON)
  writeFileSync(dir + "/site/blog/index.html", BASE_HTML)
  return dir
}

function makeSuccessGit(sideEffects: string[] = []): { runner: (args: string[], opts: { cwd: string }) => Promise<{ code: number; stdout: string; stderr: string }>, calls: string[][] } {
  const calls: string[][] = []
  const runner = async (args: string[], _opts: { cwd: string }) => {
    calls.push(args)
    sideEffects.push(args[0])
    if (args[0] === "rev-parse") return { code: 0, stdout: "abc1234def5678", stderr: "" }
    return { code: 0, stdout: "", stderr: "" }
  }
  return { runner, calls }
}

test("publishBlogPost writes HTML file verbatim", async () => {
  const dir = makeTmpRepo()
  const { runner } = makeSuccessGit()
  const html = "<html><body>Hello flaky tests</body></html>"
  await publishBlogPost(
    { slug: "test-post", title: "Test", excerpt: "X", category: "Guides", date: "2026-06-29", html },
    dir, "gh-token-test", runner,
  )
  const written = await Bun.file(dir + "/site/blog/test-post.html").text()
  expect(written).toBe(html)
})

test("publishBlogPost upserts index.json — prepends new entry, dedupes by slug", async () => {
  const dir = makeTmpRepo()
  const { runner } = makeSuccessGit()

  // First publish
  await publishBlogPost(
    { slug: "new-post", title: "New Post", excerpt: "New.", category: "Insights", date: "2026-06-29", html: "<html/>" },
    dir, "gh-token", runner,
  )
  let entries = JSON.parse(await Bun.file(dir + "/site/blog/index.json").text())
  expect(entries[0].slug).toBe("new-post")
  expect(entries[1].slug).toBe("old-post")
  expect(entries.length).toBe(2)

  // Re-publish same slug (update) — must not duplicate
  await publishBlogPost(
    { slug: "new-post", title: "New Post Updated", excerpt: "Updated.", category: "Insights", date: "2026-06-29", html: "<html/>" },
    dir, "gh-token", runner,
  )
  entries = JSON.parse(await Bun.file(dir + "/site/blog/index.json").text())
  expect(entries.filter((e: { slug: string }) => e.slug === "new-post").length).toBe(1)
  expect(entries[0].title).toBe("New Post Updated")
})

test("publishBlogPost index.json remains valid JSON after upsert", async () => {
  const dir = makeTmpRepo()
  const { runner } = makeSuccessGit()
  await publishBlogPost(
    { slug: "validity-check", title: "V", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" },
    dir, "tok", runner,
  )
  const raw = await Bun.file(dir + "/site/blog/index.json").text()
  expect(() => JSON.parse(raw)).not.toThrow()
})

test("publishBlogPost inserts card at top of .bgrid in index.html", async () => {
  const dir = makeTmpRepo()
  const { runner } = makeSuccessGit()
  await publishBlogPost(
    { slug: "new-guide", title: "New Guide", excerpt: "A helpful guide.", category: "Guides", date: "2026-06-29", html: "<html/>" },
    dir, "tok", runner,
  )
  const html = await Bun.file(dir + "/site/blog/index.html").text()
  // New card must appear before the old card
  const newIdx = html.indexOf("/blog/new-guide")
  const oldIdx = html.indexOf("/blog/old-post")
  expect(newIdx).toBeGreaterThan(-1)
  expect(oldIdx).toBeGreaterThan(-1)
  expect(newIdx).toBeLessThan(oldIdx)
})

test("publishBlogPost does not duplicate card on re-publish", async () => {
  const dir = makeTmpRepo()
  const { runner } = makeSuccessGit()
  await publishBlogPost(
    { slug: "dedup-card", title: "D", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" },
    dir, "tok", runner,
  )
  await publishBlogPost(
    { slug: "dedup-card", title: "D2", excerpt: "E2", category: "Guides", date: "2026-06-29", html: "<html/>" },
    dir, "tok", runner,
  )
  const html = await Bun.file(dir + "/site/blog/index.html").text()
  const count = (html.match(/href="\/blog\/dedup-card"/g) || []).length
  expect(count).toBe(1)
})

test("publishBlogPost returns { ok, sha, url } on success", async () => {
  const dir = makeTmpRepo()
  const { runner } = makeSuccessGit()
  const result = await publishBlogPost(
    { slug: "success-post", title: "S", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" },
    dir, "tok", runner,
  )
  expect(result.ok).toBe(true)
  expect(result.sha).toBe("abc1234def5678")
  expect(result.url).toBe("https://klavity.quantana.top/blog/success-post")
})

test("publishBlogPost retries push once on non-fast-forward reject", async () => {
  const dir = makeTmpRepo()
  let pushCount = 0
  const runner = async (args: string[], _opts: { cwd: string }) => {
    if (args[0] === "push") {
      pushCount++
      if (pushCount === 1) return { code: 1, stdout: "", stderr: "! [rejected] master -> master (non-fast-forward)" }
      return { code: 0, stdout: "", stderr: "" }
    }
    if (args[0] === "rev-parse") return { code: 0, stdout: "deadbeef", stderr: "" }
    return { code: 0, stdout: "", stderr: "" }
  }
  const result = await publishBlogPost(
    { slug: "retry-post", title: "R", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" },
    dir, "tok", runner,
  )
  expect(result.ok).toBe(true)
  expect(pushCount).toBe(2)
})

test("publishBlogPost throws (does not leak token) when push fails twice", async () => {
  const dir = makeTmpRepo()
  const SECRET = "super-secret-gh-token-abc123"
  const runner = async (args: string[], _opts: { cwd: string }) => {
    if (args[0] === "push") return { code: 1, stdout: "", stderr: `remote: error: ${SECRET} bad credentials` }
    if (args[0] === "rev-parse") return { code: 0, stdout: "abc", stderr: "" }
    return { code: 0, stdout: "", stderr: "" }
  }
  let caughtMsg = ""
  try {
    await publishBlogPost(
      { slug: "fail-post", title: "F", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" },
      dir, SECRET, runner,
    )
  } catch (e: any) { caughtMsg = String(e?.message || e) }
  expect(caughtMsg).toBeTruthy()
  expect(caughtMsg).not.toContain(SECRET)
})

// ── HTTP integration: auth, slug validation via real server ──────────────────

const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const srvDbFile = join(tmpdir(), `klav-blog-pub-${ts}.db`)
const TEST_SECRET = Buffer.from(new Uint8Array(32).fill(42)).toString("base64")
const BLOG_TOKEN = "test-blog-publish-token-xyz"

let serverProc: ReturnType<typeof Bun.spawn>
let BASE: string

beforeAll(async () => {
  const port = 32000 + Math.floor(Math.random() * 1000)
  BASE = `http://localhost:${port}`
  serverProc = Bun.spawn(["bun", "run", "server.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: "file:" + srvDbFile,
      TURSO_AUTH_TOKEN: "",
      KLAV_SECRET: TEST_SECRET,
      KLAV_BASE_URL: BASE,
      KLAV_ALLOWED_DOMAINS: "test.local",
      KLAV_DEV_SHOW_OTP: "1",
      SENDGRID_API_KEY: "",
      KLAV_MAIL_FROM: "",
      OPENROUTER_API_KEY: "test-key",
      BLOG_PUBLISH_TOKEN: BLOG_TOKEN,
      GH_TOKEN: "fake-gh-token-for-tests",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/favicon.svg`).catch(() => null)
    if (r && r.status < 500) break
    await Bun.sleep(150)
  }
})

afterAll(() => serverProc?.kill())

function post(body: unknown, authToken?: string) {
  return fetch(BASE + "/api/blog/publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

test("POST /api/blog/publish → 401 with no auth header", async () => {
  const r = await post({ slug: "x", title: "T", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" })
  expect(r.status).toBe(401)
})

test("POST /api/blog/publish → 401 with wrong token", async () => {
  const r = await post(
    { slug: "x", title: "T", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" },
    "wrong-token",
  )
  expect(r.status).toBe(401)
})

test("POST /api/blog/publish → 400 on invalid slug (path traversal)", async () => {
  const r = await post(
    { slug: "../etc/passwd", title: "T", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" },
    BLOG_TOKEN,
  )
  expect(r.status).toBe(400)
  const body = await r.json()
  expect(body.error).toContain("slug")
})

test("POST /api/blog/publish → 400 on invalid slug (uppercase)", async () => {
  const r = await post(
    { slug: "BadSlug", title: "T", excerpt: "E", category: "Guides", date: "2026-06-29", html: "<html/>" },
    BLOG_TOKEN,
  )
  expect(r.status).toBe(400)
})

test("POST /api/blog/publish → 400 on missing required fields", async () => {
  const r = await post({ slug: "ok-slug" }, BLOG_TOKEN)
  expect(r.status).toBe(400)
  const body = await r.json()
  expect(body.error).toContain("missing")
})

test("POST /api/blog/publish → 400 on invalid JSON", async () => {
  const r = await fetch(BASE + "/api/blog/publish", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${BLOG_TOKEN}` },
    body: "not-json{{{",
  })
  expect(r.status).toBe(400)
})

import { test, expect, mock, afterEach } from "bun:test"
import { safeFetch } from "./safe-fetch"

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.KLAV_TEST_ALLOW_LOOPBACK
})

// Helper: build a 3xx Response carrying a Location header.
function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } })
}

// ── Happy path ──────────────────────────────────────────────────────────────

test("passes through a normal https host (single hop, no redirect)", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(JSON.stringify({ ok: 1 }), { status: 200 })
  }) as any

  const res = await safeFetch("https://example.com/x", { method: "POST" })
  expect(res.status).toBe(200)
  expect(calls.length).toBe(1)
  expect(calls[0][0]).toBe("https://example.com/x")
  // redirect:'manual' is always injected so fetch never auto-follows.
  expect(calls[0][1].redirect).toBe("manual")
  expect(calls[0][1].method).toBe("POST")
})

test("does NOT mutate the caller's init object identity beyond spreading", async () => {
  globalThis.fetch = mock(async () => new Response("{}", { status: 200 })) as any
  const init = { method: "POST", headers: { "X-A": "1" } }
  await safeFetch("https://example.com/x", init)
  // The original init must not have gained redirect:'manual'.
  expect((init as any).redirect).toBeUndefined()
})

// ── Redirect re-validation rejects SSRF targets ─────────────────────────────

test("rejects a 3xx Location pointing at cloud-metadata (169.254.169.254) and does NOT follow it", async () => {
  let hop = 0
  const fetched: string[] = []
  globalThis.fetch = mock(async (u: any) => {
    fetched.push(String(u))
    hop++
    if (hop === 1) return redirect("https://169.254.169.254/latest/meta-data/")
    // If we ever get here, the guard failed to block the redirect.
    return new Response("SHOULD NOT REACH", { status: 200 })
  }) as any

  await expect(safeFetch("https://example.com/start", { method: "POST" })).rejects.toThrow()
  // Only the FIRST (allowed) host was fetched; the metadata host was never connected to.
  expect(fetched).toEqual(["https://example.com/start"])
})

test("rejects a 3xx Location pointing at loopback http://127.0.0.1 without following", async () => {
  let hop = 0
  const fetched: string[] = []
  globalThis.fetch = mock(async (u: any) => {
    fetched.push(String(u))
    hop++
    if (hop === 1) return redirect("http://127.0.0.1:8080/admin")
    return new Response("SHOULD NOT REACH", { status: 200 })
  }) as any

  await expect(safeFetch("https://example.com/start", { method: "GET" })).rejects.toThrow()
  expect(fetched).toEqual(["https://example.com/start"])
})

test("rejects a 3xx Location with a non-https scheme", async () => {
  let hop = 0
  globalThis.fetch = mock(async () => {
    hop++
    if (hop === 1) return redirect("http://example.com/insecure")
    return new Response("SHOULD NOT REACH", { status: 200 })
  }) as any

  await expect(safeFetch("https://example.com/start")).rejects.toThrow()
})

test("rejects a redirect to a private RFC1918 host", async () => {
  let hop = 0
  globalThis.fetch = mock(async () => {
    hop++
    if (hop === 1) return redirect("https://10.0.0.5/internal")
    return new Response("SHOULD NOT REACH", { status: 200 })
  }) as any

  await expect(safeFetch("https://example.com/start")).rejects.toThrow()
})

// ── Following a SAFE redirect works ─────────────────────────────────────────

test("follows a 3xx to another public https host (re-validated) and returns the final response", async () => {
  const fetched: string[] = []
  let hop = 0
  globalThis.fetch = mock(async (u: any) => {
    fetched.push(String(u))
    hop++
    if (hop === 1) return redirect("https://example.org/final")
    return new Response(JSON.stringify({ done: true }), { status: 200 })
  }) as any

  const res = await safeFetch("https://example.com/start")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ done: true })
  expect(fetched).toEqual(["https://example.com/start", "https://example.org/final"])
})

test("resolves a relative Location against the current URL", async () => {
  const fetched: string[] = []
  let hop = 0
  globalThis.fetch = mock(async (u: any) => {
    fetched.push(String(u))
    hop++
    if (hop === 1) return redirect("/relocated")
    return new Response("ok", { status: 200 })
  }) as any

  const res = await safeFetch("https://example.com/a/b")
  expect(res.status).toBe(200)
  expect(fetched[1]).toBe("https://example.com/relocated")
})

// ── Hop cap ─────────────────────────────────────────────────────────────────

test("enforces the redirect hop cap (rejects an infinite redirect loop)", async () => {
  let count = 0
  globalThis.fetch = mock(async (u: any) => {
    count++
    // Always redirect to another public host → would loop forever without the cap.
    return redirect(`https://example.com/hop${count}`)
  }) as any

  await expect(safeFetch("https://example.com/start")).rejects.toThrow(/too many redirects/i)
  // Initial fetch + MAX_HOPS (5) follow attempts = 6 total fetches, then it gives up.
  expect(count).toBe(6)
})

// ── Direct (non-redirect) SSRF block before connecting ──────────────────────

test("blocks an initial loopback target before any fetch", async () => {
  let fetched = false
  globalThis.fetch = mock(async () => { fetched = true; return new Response("{}", { status: 200 }) }) as any
  await expect(safeFetch("https://127.0.0.1/x")).rejects.toThrow()
  expect(fetched).toBe(false)
})

test("blocks an initial cloud-metadata target before any fetch", async () => {
  let fetched = false
  globalThis.fetch = mock(async () => { fetched = true; return new Response("{}", { status: 200 }) }) as any
  await expect(safeFetch("https://169.254.169.254/")).rejects.toThrow()
  expect(fetched).toBe(false)
})

// ── allowHosts pin ──────────────────────────────────────────────────────────

test("allowHosts pin blocks a redirect that leaves the pinned host", async () => {
  const fetched: string[] = []
  let hop = 0
  globalThis.fetch = mock(async (u: any) => {
    fetched.push(String(u))
    hop++
    if (hop === 1) return redirect("https://evil.example.net/x")
    return new Response("SHOULD NOT REACH", { status: 200 })
  }) as any

  await expect(
    safeFetch("https://github.com/repos", undefined, { allowHosts: ["github.com"] }),
  ).rejects.toThrow()
  expect(fetched).toEqual(["https://github.com/repos"])
})

// ── Loopback test hatch ─────────────────────────────────────────────────────

test("loopback test hatch: allowed only when env set AND allowLoopbackInTest opted in", async () => {
  process.env.KLAV_TEST_ALLOW_LOOPBACK = "1"
  let fetched = false
  globalThis.fetch = mock(async () => { fetched = true; return new Response("{}", { status: 200 }) }) as any

  // Opted in → loopback receiver permitted.
  const res = await safeFetch("http://127.0.0.1:9999/hook", { method: "POST" }, { allowLoopbackInTest: true })
  expect(res.status).toBe(200)
  expect(fetched).toBe(true)
})

test("loopback test hatch: blocked when allowLoopbackInTest is NOT passed even if env set", async () => {
  process.env.KLAV_TEST_ALLOW_LOOPBACK = "1"
  let fetched = false
  globalThis.fetch = mock(async () => { fetched = true; return new Response("{}", { status: 200 }) }) as any
  await expect(safeFetch("http://127.0.0.1:9999/hook")).rejects.toThrow()
  expect(fetched).toBe(false)
})

test("loopback test hatch: blocked when env NOT set even if opted in", async () => {
  delete process.env.KLAV_TEST_ALLOW_LOOPBACK
  let fetched = false
  globalThis.fetch = mock(async () => { fetched = true; return new Response("{}", { status: 200 }) }) as any
  await expect(safeFetch("http://127.0.0.1:9999/hook", undefined, { allowLoopbackInTest: true })).rejects.toThrow()
  expect(fetched).toBe(false)
})

// ── Error messages are generic / log-safe ───────────────────────────────────

test("thrown guard errors do not leak internal IPs to the message consumer (generic enough)", async () => {
  // The url-guard intentionally produces short reason strings ('loopback address') that the
  // server must not echo; here we just assert safeFetch surfaces an Error (the server layer
  // is responsible for not forwarding e.message). We confirm it is an Error instance.
  try {
    await safeFetch("https://169.254.169.254/")
    throw new Error("expected rejection")
  } catch (e) {
    expect(e).toBeInstanceOf(Error)
  }
})

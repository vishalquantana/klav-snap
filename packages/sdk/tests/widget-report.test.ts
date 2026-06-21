// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { submitFeedback } from "../src/widget"

describe("submitFeedback", () => {
  beforeEach(() => vi.restoreAllMocks())
  it("first-party posts with credentials:include and no Bearer, returns issue url", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "fb1", saved: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const res = await submitFeedback(
      { backendUrl: "https://klavity.quantana.top", projectId: "p1", firstParty: true, token: "" },
      { type: "bug", description: "x", pageUrl: "https://klavity.quantana.top/dashboard", screenshots: [] },
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(init.credentials).toBe("include")
    expect(init.headers?.authorization).toBeUndefined()
    expect(res.issueKey).toBe("fb1")
  })
  it("cross-origin posts Bearer token, no credentials", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "fb2", saved: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await submitFeedback(
      { backendUrl: "https://klavity.quantana.top", projectId: "p1", firstParty: false, token: "ext_abc" },
      { type: "bug", description: "x", pageUrl: "https://app.acme.com/p", screenshots: [] },
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.authorization).toBe("Bearer ext_abc")
    expect(init.credentials).toBeUndefined()
  })

  it("attaches the captured dev-tools context to the /api/feedback payload (G2/G5)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "fb3", saved: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await submitFeedback(
      { backendUrl: "https://klavity.quantana.top", projectId: "p1", firstParty: true, token: "" },
      {
        type: "bug", description: "x", pageUrl: "https://klavity.quantana.top/d", screenshots: [],
        context: {
          pageUrl: "https://klavity.quantana.top/d", userAgent: "UA/1", screenSize: "1920x1080", viewportSize: "1280x720",
          consoleErrors: [{ message: "boom", timestamp: 1, level: "error" }],
          networkFailures: [{ url: "https://api/x", status: 500, method: "GET", timestamp: 1, durationMs: 5 }],
          identity: { id: "u1", email: "a@b.com" }, metadata: { plan: "pro" },
        },
      },
    )
    const [, init] = fetchMock.mock.calls[0]
    const ctx = JSON.parse((init.body as FormData).get("context") as string)
    expect(ctx.userAgent).toBe("UA/1")
    expect(ctx.consoleErrors[0].message).toBe("boom")
    expect(ctx.networkFailures[0].status).toBe(500)
    expect(ctx.identity.id).toBe("u1")
    expect(ctx.metadata.plan).toBe("pro")
  })
})

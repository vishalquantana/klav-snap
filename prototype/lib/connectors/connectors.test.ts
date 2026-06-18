import { test, expect, mock } from "bun:test"
import { getConnector, listConnectorTypes } from "./index"

const TICKET = {
  title: "Bug",
  body: "desc",
  severity: "high",
  url: "https://app/x",
  simName: "Vamshi",
  createdAt: 1,
  klavityUrl: "https://klavity.quantana.top/dashboard",
}

// ── Registry ──────────────────────────────────────────────────────────────────

test("registry exposes all five types with fields", () => {
  expect(listConnectorTypes().map((t) => t.type).sort()).toEqual([
    "github",
    "jira",
    "linear",
    "plane",
    "webhook",
  ])
})

test("getConnector returns null for unknown type", () => {
  expect(getConnector("unknown")).toBeNull()
})

// ── Webhook ───────────────────────────────────────────────────────────────────

test("webhook createIssue posts to url with ticket body", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(JSON.stringify({ id: "wh_123" }), { status: 200 })
  }) as any

  const r = await getConnector("webhook")!.createIssue(TICKET, {
    url: "https://webhook.site/abc",
    secret: "mysecret",
  })
  expect(calls[0][0]).toBe("https://webhook.site/abc")
  expect(calls[0][1].method).toBe("POST")
  expect(calls[0][1].headers["X-Klavity-Signature"]).toBe("mysecret")
  const body = JSON.parse(calls[0][1].body)
  expect(body.ticket.title).toBe("Bug")
  expect(r.externalUrl).toBe("https://webhook.site/abc")
  expect(r.externalKey).toBe("wh_123")
})

test("webhook createIssue without secret omits header", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(JSON.stringify({}), { status: 200 })
  }) as any

  await getConnector("webhook")!.createIssue(TICKET, { url: "https://hook.example/x" })
  expect(calls[0][1].headers["X-Klavity-Signature"]).toBeUndefined()
})

test("webhook createIssue handles non-JSON 2xx response", async () => {
  globalThis.fetch = mock(async () => new Response("OK", { status: 200 })) as any
  const r = await getConnector("webhook")!.createIssue(TICKET, { url: "https://hook.example/x" })
  expect(r.externalUrl).toBe("https://hook.example/x")
  expect(r.externalKey).toBeNull()
})

test("webhook createIssue throws on non-2xx", async () => {
  globalThis.fetch = mock(async () => new Response("Bad Request", { status: 400 })) as any
  await expect(
    getConnector("webhook")!.createIssue(TICKET, { url: "https://hook.example/x" })
  ).rejects.toThrow()
})

test("webhook validate flags missing url", () => {
  expect(getConnector("webhook")!.validate({}).ok).toBe(false)
  expect(getConnector("webhook")!.validate({ url: "https://x" }).ok).toBe(true)
})

// ── Plane ─────────────────────────────────────────────────────────────────────

test("plane createIssue posts to plane api and extracts key+url", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(
      JSON.stringify({ id: "issue-uuid-1", sequence_id: 42 }),
      { status: 201 }
    )
  }) as any

  const r = await getConnector("plane")!.createIssue(TICKET, {
    host: "https://api.plane.so",
    workspace: "my-workspace",
    project_id: "proj-uuid",
    token: "plane-token",
  })

  expect(calls[0][0]).toBe(
    "https://api.plane.so/api/v1/workspaces/my-workspace/projects/proj-uuid/issues/"
  )
  expect(calls[0][1].method).toBe("POST")
  expect(calls[0][1].headers["X-API-Key"]).toBe("plane-token")
  const body = JSON.parse(calls[0][1].body)
  expect(body.name).toBe("Bug")
  // externalKey = sequence_id or id
  expect(r.externalKey).toBe("42")
  // externalUrl = host (without /api) / workspace / projects / project_id / issues / id
  expect(r.externalUrl).toContain("my-workspace")
  expect(r.externalUrl).toContain("issue-uuid-1")
})

test("plane createIssue throws on non-2xx", async () => {
  globalThis.fetch = mock(async () => new Response("Forbidden", { status: 403 })) as any
  await expect(
    getConnector("plane")!.createIssue(TICKET, {
      host: "https://api.plane.so",
      workspace: "ws",
      project_id: "p",
      token: "t",
    })
  ).rejects.toThrow()
})

test("plane validate flags missing required fields", () => {
  expect(getConnector("plane")!.validate({}).ok).toBe(false)
  expect(getConnector("plane")!.validate({ workspace: "ws", project_id: "p", token: "t" }).ok).toBe(true)
})

// ── GitHub ────────────────────────────────────────────────────────────────────

test("github createIssue posts to repo and extracts number+url", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(JSON.stringify({ number: 12, html_url: "https://gh/i/12" }), {
      status: 201,
    })
  }) as any

  const r = await getConnector("github")!.createIssue(TICKET, {
    owner: "o",
    repo: "r",
    token: "t",
  })
  expect(calls[0][0]).toBe("https://api.github.com/repos/o/r/issues")
  expect(calls[0][1].method).toBe("POST")
  expect(calls[0][1].headers["Authorization"]).toBe("Bearer t")
  expect(calls[0][1].headers["Accept"]).toBe("application/vnd.github+json")
  expect(calls[0][1].headers["User-Agent"]).toBe("Klavity")
  expect(JSON.parse(calls[0][1].body).title).toBe("Bug")
  expect(r).toEqual({ externalKey: "#12", externalUrl: "https://gh/i/12" })
})

test("github createIssue throws on non-2xx", async () => {
  globalThis.fetch = mock(async () => new Response("Unauthorized", { status: 401 })) as any
  await expect(
    getConnector("github")!.createIssue(TICKET, { owner: "o", repo: "r", token: "t" })
  ).rejects.toThrow()
})

test("github validate flags missing repo", () => {
  expect(getConnector("github")!.validate({ owner: "o", token: "t" }).ok).toBe(false)
  expect(getConnector("github")!.validate({ owner: "o", repo: "r", token: "t" }).ok).toBe(true)
})

// ── Jira ──────────────────────────────────────────────────────────────────────

test("jira createIssue posts with basic auth and ADF body", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(JSON.stringify({ key: "PROJ-42" }), { status: 201 })
  }) as any

  const r = await getConnector("jira")!.createIssue(TICKET, {
    host: "https://my.atlassian.net",
    email: "user@example.com",
    token: "jira-token",
    project_key: "PROJ",
    issue_type: "Bug",
  })

  expect(calls[0][0]).toBe("https://my.atlassian.net/rest/api/3/issue")
  expect(calls[0][1].method).toBe("POST")
  // Authorization is Basic base64(email:token)
  const expectedBase64 = Buffer.from("user@example.com:jira-token").toString("base64")
  expect(calls[0][1].headers["Authorization"]).toBe(`Basic ${expectedBase64}`)
  const body = JSON.parse(calls[0][1].body)
  expect(body.fields.project.key).toBe("PROJ")
  expect(body.fields.issuetype.name).toBe("Bug")
  expect(body.fields.summary).toBe("Bug")
  expect(r.externalKey).toBe("PROJ-42")
  expect(r.externalUrl).toBe("https://my.atlassian.net/browse/PROJ-42")
})

test("jira createIssue uses default issue_type Task when omitted", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(JSON.stringify({ key: "PROJ-1" }), { status: 201 })
  }) as any

  await getConnector("jira")!.createIssue(TICKET, {
    host: "https://my.atlassian.net",
    email: "user@example.com",
    token: "jira-token",
    project_key: "PROJ",
  })
  const body = JSON.parse(calls[0][1].body)
  expect(body.fields.issuetype.name).toBe("Task")
})

test("jira createIssue throws on non-2xx", async () => {
  globalThis.fetch = mock(async () => new Response("Bad Request", { status: 400 })) as any
  await expect(
    getConnector("jira")!.createIssue(TICKET, {
      host: "https://my.atlassian.net",
      email: "e",
      token: "t",
      project_key: "P",
    })
  ).rejects.toThrow()
})

test("jira validate flags missing required fields", () => {
  expect(getConnector("jira")!.validate({ host: "https://my.atlassian.net", email: "e", token: "t" }).ok).toBe(false)
  expect(
    getConnector("jira")!.validate({
      host: "https://my.atlassian.net",
      email: "e",
      token: "t",
      project_key: "P",
    }).ok
  ).toBe(true)
})

// ── Linear ────────────────────────────────────────────────────────────────────

test("linear createIssue posts graphql and extracts identifier+url", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(
      JSON.stringify({
        data: {
          issueCreate: { issue: { identifier: "ENG-42", url: "https://linear.app/team/issue/ENG-42" } },
        },
      }),
      { status: 200 }
    )
  }) as any

  const r = await getConnector("linear")!.createIssue(TICKET, {
    api_key: "lin_api_key",
    team_id: "TEAM-UUID",
  })

  expect(calls[0][0]).toBe("https://api.linear.app/graphql")
  expect(calls[0][1].method).toBe("POST")
  expect(calls[0][1].headers["Authorization"]).toBe("lin_api_key")
  const body = JSON.parse(calls[0][1].body)
  expect(body.variables.t).toBe("Bug")
  expect(body.variables.tm).toBe("TEAM-UUID")
  expect(r).toEqual({
    externalKey: "ENG-42",
    externalUrl: "https://linear.app/team/issue/ENG-42",
  })
})

test("linear throws on graphql errors", async () => {
  globalThis.fetch = mock(
    async () =>
      new Response(JSON.stringify({ errors: [{ message: "bad" }] }), { status: 200 })
  ) as any
  await expect(
    getConnector("linear")!.createIssue(TICKET, { api_key: "k", team_id: "tm" })
  ).rejects.toThrow()
})

test("linear createIssue throws on non-2xx", async () => {
  globalThis.fetch = mock(async () => new Response("Unauthorized", { status: 401 })) as any
  await expect(
    getConnector("linear")!.createIssue(TICKET, { api_key: "k", team_id: "tm" })
  ).rejects.toThrow()
})

test("linear validate flags missing required fields", () => {
  expect(getConnector("linear")!.validate({ api_key: "k" }).ok).toBe(false)
  expect(getConnector("linear")!.validate({ api_key: "k", team_id: "tm" }).ok).toBe(true)
})

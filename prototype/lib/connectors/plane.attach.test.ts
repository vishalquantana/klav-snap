import { test, expect, mock } from "bun:test"
import { getConnector } from "./index"
import type { TicketAttachment } from "./index"

const BASE_TICKET = {
  title: "Bug",
  body: "desc",
  severity: "high",
  url: "https://app/x",
  simName: "Vamshi",
  createdAt: 1,
  klavityUrl: "https://klavity.quantana.top/dashboard",
}

const CFG = {
  host: "https://api.plane.so",
  workspace: "my-workspace",
  project_id: "proj-uuid",
  token: "plane-token",
}

const ATTACHMENT: TicketAttachment = {
  filename: "shot.png",
  contentType: "image/png",
  bytes: new Uint8Array([1, 2, 3, 4]),
  url: "https://klavity.quantana.top/img/abc.hmac",
}

const ISSUE_URL = "https://api.plane.so/api/v1/workspaces/my-workspace/projects/proj-uuid/issues/"
const ATTACH_URL =
  "https://api.plane.so/api/v1/workspaces/my-workspace/projects/proj-uuid/issues/issue-uuid-1/issue-attachments/"

function issueResponse() {
  return new Response(JSON.stringify({ id: "issue-uuid-1", sequence_id: 42 }), { status: 201 })
}

// (1) With attachments present, after issue creation a request hits the /issue-attachments/
//     endpoint with X-API-Key and a FormData body.
test("plane createIssue uploads attachment to issue-attachments endpoint with FormData + X-API-Key", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    if (String(u).endsWith("/issue-attachments/")) {
      return new Response(JSON.stringify({ id: "att-1" }), { status: 201 })
    }
    return issueResponse()
  }) as any

  const r = await getConnector("plane")!.createIssue(
    { ...BASE_TICKET, attachments: [ATTACHMENT] },
    CFG,
  )

  // Issue creation still returns normally.
  expect(r.externalKey).toBe("42")
  expect(r.externalUrl).toContain("issue-uuid-1")

  // First call = issue creation; a later call = attachment upload.
  expect(calls[0][0]).toBe(ISSUE_URL)
  const attachCall = calls.find(([u]) => String(u) === ATTACH_URL)
  expect(attachCall).toBeDefined()
  expect(attachCall[1].method).toBe("POST")
  expect(attachCall[1].headers["X-API-Key"]).toBe("plane-token")
  // No manually-set Content-Type — fetch derives the multipart boundary.
  expect(attachCall[1].headers["Content-Type"]).toBeUndefined()
  // Body is a Web FormData carrying the asset field.
  expect(attachCall[1].body).toBeInstanceOf(FormData)
  expect((attachCall[1].body as FormData).has("asset")).toBe(true)
})

// (2) If the attachment request fails, createIssue STILL resolves normally (graceful).
test("plane createIssue resolves normally when attachment upload returns non-2xx", async () => {
  const calls: any[] = []
  const warn = console.warn
  console.warn = () => {}
  try {
    globalThis.fetch = mock(async (u: any, o: any) => {
      calls.push([u, o])
      if (String(u).endsWith("/issue-attachments/")) {
        return new Response("nope", { status: 500 })
      }
      return issueResponse()
    }) as any

    const r = await getConnector("plane")!.createIssue(
      { ...BASE_TICKET, attachments: [ATTACHMENT] },
      CFG,
    )
    expect(r.externalKey).toBe("42")
    expect(r.externalUrl).toContain("issue-uuid-1")
    // The attachment endpoint was indeed attempted.
    expect(calls.some(([u]) => String(u) === ATTACH_URL)).toBe(true)
  } finally {
    console.warn = warn
  }
})

test("plane createIssue resolves normally when attachment upload throws", async () => {
  const warn = console.warn
  console.warn = () => {}
  try {
    globalThis.fetch = mock(async (u: any) => {
      if (String(u).endsWith("/issue-attachments/")) {
        throw new Error("network boom")
      }
      return issueResponse()
    }) as any

    const r = await getConnector("plane")!.createIssue(
      { ...BASE_TICKET, attachments: [ATTACHMENT] },
      CFG,
    )
    expect(r.externalKey).toBe("42")
    expect(r.externalUrl).toContain("issue-uuid-1")
  } finally {
    console.warn = warn
  }
})

// (3) No attachment request when attachments empty/undefined.
test("plane createIssue makes no attachment request when attachments undefined", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return issueResponse()
  }) as any

  await getConnector("plane")!.createIssue(BASE_TICKET, CFG)
  expect(calls.length).toBe(1)
  expect(calls.some(([u]) => String(u).endsWith("/issue-attachments/"))).toBe(false)
})

test("plane createIssue makes no attachment request when attachments empty array", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return issueResponse()
  }) as any

  await getConnector("plane")!.createIssue({ ...BASE_TICKET, attachments: [] }, CFG)
  expect(calls.length).toBe(1)
  expect(calls.some(([u]) => String(u).endsWith("/issue-attachments/"))).toBe(false)
})

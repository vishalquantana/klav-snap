import { test, expect, mock } from "bun:test"
import { getConnector } from "./index"
import type { TicketAttachment } from "./index"

const BASE_TICKET = {
  title: "Bug",
  body: "desc with permanent link",
  severity: "high",
  url: "https://app/x",
  simName: "Vamshi",
  createdAt: 1,
  klavityUrl: "https://klavity.quantana.top/dashboard",
}

const CFG = {
  host: "https://my.atlassian.net",
  email: "user@example.com",
  token: "jira-token",
  project_key: "PROJ",
  issue_type: "Bug",
}

function makeAttachment(name = "shot.png"): TicketAttachment {
  return {
    filename: name,
    contentType: "image/png",
    bytes: new Uint8Array([1, 2, 3, 4]),
    url: "https://klavity.quantana.top/img/abc.hmac",
  }
}

// (1) attachment present → second request hits the attachments endpoint with the
//     X-Atlassian-Token: no-check header and a multipart/FormData body.
test("jira createIssue uploads attachment to attachments endpoint with FormData + X-Atlassian-Token", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    if (String(u).endsWith("/rest/api/3/issue")) {
      return new Response(JSON.stringify({ key: "PROJ-42" }), { status: 201 })
    }
    return new Response(JSON.stringify([{ id: "att1" }]), { status: 200 })
  }) as any

  const r = await getConnector("jira")!.createIssue(
    { ...BASE_TICKET, attachments: [makeAttachment()] },
    CFG,
  )

  // Issue create first, attachment upload second.
  expect(calls.length).toBe(2)
  expect(calls[0][0]).toBe("https://my.atlassian.net/rest/api/3/issue")
  expect(calls[1][0]).toBe("https://my.atlassian.net/rest/api/3/issue/PROJ-42/attachments")
  expect(calls[1][1].method).toBe("POST")
  expect(calls[1][1].headers["X-Atlassian-Token"]).toBe("no-check")
  // Basic auth carried over to the attachment request.
  const expectedBase64 = Buffer.from("user@example.com:jira-token").toString("base64")
  expect(calls[1][1].headers["Authorization"]).toBe(`Basic ${expectedBase64}`)
  // Body is a Web FormData (boundary set automatically — no manual Content-Type).
  expect(calls[1][1].body).toBeInstanceOf(FormData)
  expect(calls[1][1].headers["Content-Type"]).toBeUndefined()
  const form = calls[1][1].body as FormData
  const file = form.get("file") as Blob
  expect(file).toBeInstanceOf(Blob)
  expect(file.type).toBe("image/png")

  // Normal result still returned.
  expect(r.externalKey).toBe("PROJ-42")
  expect(r.externalUrl).toBe("https://my.atlassian.net/browse/PROJ-42")
})

test("jira createIssue uploads one request per attachment", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    if (String(u).endsWith("/rest/api/3/issue")) {
      return new Response(JSON.stringify({ key: "PROJ-7" }), { status: 201 })
    }
    return new Response("[]", { status: 200 })
  }) as any

  await getConnector("jira")!.createIssue(
    { ...BASE_TICKET, attachments: [makeAttachment("a.png"), makeAttachment("b.png")] },
    CFG,
  )

  const attachCalls = calls.filter(([u]) => String(u).endsWith("/attachments"))
  expect(attachCalls.length).toBe(2)
})

// (2a) attachment upload returns non-2xx → createIssue still resolves normally.
test("jira createIssue resolves normally when attachment upload returns non-2xx", async () => {
  globalThis.fetch = mock(async (u: any) => {
    if (String(u).endsWith("/rest/api/3/issue")) {
      return new Response(JSON.stringify({ key: "PROJ-99" }), { status: 201 })
    }
    return new Response("Payload too large", { status: 413 })
  }) as any

  const r = await getConnector("jira")!.createIssue(
    { ...BASE_TICKET, attachments: [makeAttachment()] },
    CFG,
  )

  expect(r).toEqual({
    externalKey: "PROJ-99",
    externalUrl: "https://my.atlassian.net/browse/PROJ-99",
  })
})

// (2b) attachment upload throws → createIssue still resolves normally (graceful).
test("jira createIssue resolves normally when attachment upload throws", async () => {
  globalThis.fetch = mock(async (u: any) => {
    if (String(u).endsWith("/rest/api/3/issue")) {
      return new Response(JSON.stringify({ key: "PROJ-100" }), { status: 201 })
    }
    throw new Error("network down")
  }) as any

  const r = await getConnector("jira")!.createIssue(
    { ...BASE_TICKET, attachments: [makeAttachment()] },
    CFG,
  )

  expect(r).toEqual({
    externalKey: "PROJ-100",
    externalUrl: "https://my.atlassian.net/browse/PROJ-100",
  })
})

// (3) no attachments → no attachment request is made.
test("jira createIssue makes no attachment request when attachments is undefined", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(JSON.stringify({ key: "PROJ-1" }), { status: 201 })
  }) as any

  await getConnector("jira")!.createIssue(BASE_TICKET, CFG)

  expect(calls.length).toBe(1)
  expect(calls.every(([u]) => !String(u).endsWith("/attachments"))).toBe(true)
})

test("jira createIssue makes no attachment request when attachments is empty array", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([u, o])
    return new Response(JSON.stringify({ key: "PROJ-2" }), { status: 201 })
  }) as any

  await getConnector("jira")!.createIssue({ ...BASE_TICKET, attachments: [] }, CFG)

  expect(calls.length).toBe(1)
})

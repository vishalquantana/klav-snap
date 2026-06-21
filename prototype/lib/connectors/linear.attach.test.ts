import { test, expect, mock } from "bun:test"
import { getConnector } from "./index"
import type { TicketPayload } from "./index"

const GRAPHQL = "https://api.linear.app/graphql"
// Linear hands back a presigned PUT target on a *.linear.app host (passes the allowHosts guard).
const UPLOAD_URL = "https://uploads.linear.app/presigned/abc?sig=xyz"
const ASSET_URL = "https://uploads.linear.app/assets/abc.png"

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function ticketWith(attachments?: TicketPayload["attachments"]): TicketPayload {
  return {
    title: "Bug",
    body: "desc with fallback https://klavity.quantana.top/img/1.hmac",
    severity: "high",
    url: "https://app/x",
    simName: "Vamshi",
    createdAt: 1,
    klavityUrl: "https://klavity.quantana.top/dashboard",
    attachments,
  }
}

const ATT = { filename: "shot.png", contentType: "image/png", bytes: PNG, url: "https://klavity.quantana.top/img/1.hmac" }

function issueCreateResponse() {
  return new Response(
    JSON.stringify({
      data: { issueCreate: { issue: { identifier: "ENG-7", url: "https://linear.app/team/issue/ENG-7" } } },
    }),
    { status: 200 },
  )
}

// (1) Happy path: fileUpload mutation fires, then a PUT to the returned uploadUrl, and the
//     final issueCreate description embeds `![...](assetUrl)` markdown.
test("linear uploads attachment then embeds assetUrl markdown in issue description", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([String(u), o])
    const url = String(u)
    if (url === GRAPHQL) {
      const body = JSON.parse(o.body)
      // first GraphQL hit is the fileUpload mutation, second is issueCreate
      if (body.query.includes("fileUpload")) {
        return new Response(
          JSON.stringify({
            data: {
              fileUpload: {
                success: true,
                uploadFile: {
                  uploadUrl: UPLOAD_URL,
                  assetUrl: ASSET_URL,
                  headers: [{ key: "X-Test-Hdr", value: "v1" }],
                },
              },
            },
          }),
          { status: 200 },
        )
      }
      return issueCreateResponse()
    }
    // the presigned PUT
    return new Response("", { status: 200 })
  }) as any

  const r = await getConnector("linear")!.createIssue(ticketWith([ATT]), {
    api_key: "lin_key",
    team_id: "TEAM-UUID",
  })

  // fileUpload mutation fired
  const fileUploadCall = calls.find(
    ([u, o]) => u === GRAPHQL && JSON.parse(o.body).query.includes("fileUpload"),
  )
  expect(fileUploadCall).toBeTruthy()
  const fuBody = JSON.parse(fileUploadCall[1].body)
  expect(fuBody.variables.ct).toBe("image/png")
  expect(fuBody.variables.fn).toBe("shot.png")
  expect(fuBody.variables.sz).toBe(PNG.byteLength)

  // PUT to the returned uploadUrl with the returned headers + content-type
  const putCall = calls.find(([u, o]) => u === UPLOAD_URL && o.method === "PUT")
  expect(putCall).toBeTruthy()
  expect(putCall[1].headers["Content-Type"]).toBe("image/png")
  expect(putCall[1].headers["X-Test-Hdr"]).toBe("v1")
  expect(putCall[1].body).toBe(PNG)

  // issueCreate description embeds the markdown image with the assetUrl
  const createCall = calls.find(
    ([u, o]) => u === GRAPHQL && JSON.parse(o.body).query.includes("issueCreate"),
  )
  expect(createCall).toBeTruthy()
  const desc = JSON.parse(createCall[1].body).variables.d
  expect(desc).toContain(`![screenshot](${ASSET_URL})`)
  expect(desc).toContain("fallback") // original body preserved

  expect(r).toEqual({ externalKey: "ENG-7", externalUrl: "https://linear.app/team/issue/ENG-7" })
})

// (2) Graceful degradation: when the upload step fails/throws, the issue is STILL created and
//     createIssue resolves normally (no throw); no markdown image embedded.
test("linear still creates issue when attachment upload fails (graceful)", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([String(u), o])
    const url = String(u)
    if (url === GRAPHQL) {
      const body = JSON.parse(o.body)
      if (body.query.includes("fileUpload")) {
        // fileUpload fails upstream
        return new Response("nope", { status: 500 })
      }
      return issueCreateResponse()
    }
    return new Response("", { status: 200 })
  }) as any

  const r = await getConnector("linear")!.createIssue(ticketWith([ATT]), {
    api_key: "lin_key",
    team_id: "TEAM-UUID",
  })

  // no PUT happened
  expect(calls.find(([, o]) => o.method === "PUT")).toBeUndefined()

  // issue still created; description has NO embedded image, fallback body intact
  const createCall = calls.find(
    ([u, o]) => u === GRAPHQL && JSON.parse(o.body).query.includes("issueCreate"),
  )
  expect(createCall).toBeTruthy()
  const desc = JSON.parse(createCall[1].body).variables.d
  expect(desc).not.toContain("![screenshot]")
  expect(desc).toContain("fallback")

  expect(r).toEqual({ externalKey: "ENG-7", externalUrl: "https://linear.app/team/issue/ENG-7" })
})

// (2b) A thrown error inside the upload (e.g. fetch rejects) is also swallowed.
test("linear swallows a thrown upload error and still creates the issue", async () => {
  let fileUploadAttempted = false
  globalThis.fetch = mock(async (u: any, o: any) => {
    const url = String(u)
    if (url === GRAPHQL && JSON.parse(o.body).query.includes("fileUpload")) {
      fileUploadAttempted = true
      throw new Error("network down")
    }
    return issueCreateResponse()
  }) as any

  const r = await getConnector("linear")!.createIssue(ticketWith([ATT]), {
    api_key: "lin_key",
    team_id: "TEAM-UUID",
  })
  expect(fileUploadAttempted).toBe(true)
  expect(r.externalKey).toBe("ENG-7")
})

// (3) No upload happens when attachments are empty or undefined.
test("linear does not attempt upload when attachments are empty", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([String(u), o])
    return issueCreateResponse()
  }) as any

  await getConnector("linear")!.createIssue(ticketWith([]), { api_key: "k", team_id: "tm" })
  expect(calls.length).toBe(1)
  expect(JSON.parse(calls[0][1].body).query.includes("issueCreate")).toBe(true)
})

test("linear does not attempt upload when attachments are undefined", async () => {
  const calls: any[] = []
  globalThis.fetch = mock(async (u: any, o: any) => {
    calls.push([String(u), o])
    return issueCreateResponse()
  }) as any

  await getConnector("linear")!.createIssue(ticketWith(undefined), { api_key: "k", team_id: "tm" })
  expect(calls.length).toBe(1)
  expect(calls.find(([, o]) => o.method === "PUT")).toBeUndefined()
})

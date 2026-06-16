// Klavity app server (Bun). Marketing on /, demo + dashboard behind email-OTP login.
import { initDb, db, createOtp, verifyOtp, upsertUser, createSession, getSession, deleteSession, ensureWorkspace, membershipsFor, membersOf, roleIn, addMember, getIntegration, setIntegration, listPersonas, upsertPersona, deletePersona } from "./lib/db"
import { sendOtp } from "./lib/mail"
import { token, otp, emailAllowed, cookie, clearCookie, parseCookies } from "./lib/auth"
import { uploadScreenshot } from "./lib/s3"
import { buildIssueHtml } from "./lib/feedback"
import { encryptSecret, decryptSecret } from "./lib/crypto"
import { planeConfigFromForm, redactPlane, type PlaneStored } from "./lib/connection"

const KEY = process.env.OPENROUTER_API_KEY
const MODEL = process.env.KLAV_MODEL || "google/gemini-2.5-flash"
const PORT = Number(process.env.PORT || 4317)
const BASE = process.env.KLAV_BASE_URL || `http://localhost:${PORT}`
const SECURE = BASE.startsWith("https")
const DEV_SHOW_OTP = process.env.KLAV_DEV_SHOW_OTP === "1"
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
const SITE = import.meta.dir + "/../site"
const PUB = import.meta.dir + "/public"
const SESSION_DAYS = 7

await initDb()

// ── AI (OpenRouter) ──
const EXTRACT_SYS =
  "You are an expert qualitative UX researcher building reusable user personas (\"Sims\") from interview/call transcripts. " +
  "Identify each distinct HUMAN speaker who is a user, customer, or stakeholder. For each produce a persona. " +
  "type is \"client\" for an external customer/user, \"internal\" for someone on the product/company team. " +
  "Each insight is typed pain | want | love and MUST be anchored to a short verbatim quote from the transcript. " +
  "Skip a pure facilitator/interviewer who reveals no preferences of their own. Be faithful to what people actually said.\n\n" +
  "Respond with ONLY a JSON object, no prose, in exactly this shape:\n" +
  '{"personas":[{"name":string,"role":string,"type":"client"|"internal","initials":string(2 uppercase letters),' +
  '"accent":string(hex colour like #6366f1),"summary":string,"insights":[{"kind":"pain"|"want"|"love","text":string,"quote":string}]}]}'

const REACT_SYS =
  "You ARE the given user persona, reviewing a screenshot of a product page as if really using it. " +
  "React in FIRST PERSON, grounded in this persona's documented pains, wants, and loves. " +
  "Give 1-3 reactions, most important first. The box is a normalised 0..1 bounding box locating the element in the image " +
  "(x,y = top-left; w,h = size; all 0..1), or null if you can't localise it. suggestedBug is filled only when it's a real " +
  "problem worth filing to an issue tracker, else null. Stay in character and be specific to what you actually see.\n\n" +
  "Respond with ONLY a JSON object, no prose, in exactly this shape:\n" +
  '{"reactions":[{"observation":string(<=240 chars, first person),"sentiment":"frustrated"|"confused"|"satisfied"|"delighted"|"neutral",' +
  '"emoji":string,"targetDescription":string,"box":{"x":number,"y":number,"w":number,"h":number}|null,' +
  '"suggestedBug":{"title":string,"body":string,"severity":"high"|"medium"|"low"}|null}]}'

// jsonMode forces structured output — safe for text calls, but Gemini's vision path
// via OpenRouter often returns empty content under json_object, so leave it OFF for
// image calls and rely on the prompt + parseJSON's extraction instead.
async function chat(messages: any[], maxTokens: number, jsonMode = false) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json", "HTTP-Referer": BASE, "X-Title": "Klavity" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages, ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data: any = await res.json()
  const content: string = data?.choices?.[0]?.message?.content ?? ""
  const u = data?.usage || {}
  return { content, usage: { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens } }
}
function parseJSON(s: string) {
  // Strip thinking-model traces (<think>…</think>) and markdown code fences
  // before extraction — greedy regex breaks when thinking traces contain {…}.
  const tag = "think"
  const open = new RegExp("<" + tag + "[^>]*>[\\s\\S]*?<\\/" + tag + ">", "gi")
  const cleaned = s
    .replace(open, "")
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim()
  try { return JSON.parse(cleaned) } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
    console.error("parseJSON: no JSON object in model output:", JSON.stringify(s.slice(0, 500)))
    throw new Error("Model did not return valid JSON")
  }
}
async function extractPersonas(transcript: string) {
  const { content, usage } = await chat([{ role: "system", content: EXTRACT_SYS }, { role: "user", content: "TRANSCRIPT:\n\n" + transcript }], 4000)
  return { data: parseJSON(content), usage }
}
async function reactToPage(persona: any, imageB64: string, mediaType: string, pageUrl: string) {
  const { content, usage } = await chat([
    { role: "system", content: REACT_SYS },
    { role: "user", content: [
      { type: "text", text: "You are this persona:\n" + JSON.stringify(persona, null, 2) + `\n\nReact to this screenshot of ${pageUrl || "(unknown URL)"}.` },
      { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageB64}` } },
    ] },
  ], 2500)
  return { data: parseJSON(content), usage }
}

// ── http helpers ──
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}
function file(path: string) { return new Response(Bun.file(path)) }
function redirect(loc: string, headers: Record<string, string> = {}) { return new Response(null, { status: 302, headers: { Location: loc, ...headers } }) }
async function sessionEmail(req: Request): Promise<string | null> {
  if (!db) return null
  const sid = parseCookies(req.headers.get("cookie"))["klav_session"]
  if (!sid) return null
  return getSession(sid)
}
// Identify a request authenticated by an `Authorization: Bearer <session id>` header (the extension).
async function bearerEmail(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || ""
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m || !db) return null
  return getSession(m[1])
}

Bun.serve({
  port: PORT,
  idleTimeout: 180,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // ── favicon ──
    if (req.method === "GET" && path === "/favicon.svg") return file(PUB + "/favicon.svg")
    if (req.method === "GET" && path === "/favicon.ico") return file(PUB + "/favicon.ico")

    // ── public marketing + login ──
    if (req.method === "GET" && path === "/") return file(import.meta.dir + "/../local.html")
    if (req.method === "GET" && path === "/local") return file(import.meta.dir + "/../local.html")
    if (req.method === "GET" && path === "/home") return redirect("/")
    if (req.method === "GET" && path === "/login") return file(PUB + "/login.html")
    if (req.method === "GET" && path === "/sim-emotions") return file(PUB + "/sim-emotions.html")
    if (req.method === "GET" && path === "/sim-identity") return file(PUB + "/sim-identity.html")
    if (req.method === "GET" && path === "/sim-options") return file(PUB + "/sim-options.html")
    if (req.method === "GET" && path === "/sim-component") return file(PUB + "/sim-component.html")
    if (req.method === "GET" && path === "/snap-popup") return file(PUB + "/snap-popup.html")
    if (req.method === "GET" && path === "/klavity-sim.js") return file(PUB + "/klavity-sim.js")

    // ── auth: request OTP ──
    if (req.method === "POST" && path === "/api/auth/request") {
      try {
        if (!db) return json({ error: "Login is not configured on this server." }, 500)
        const { email } = await req.json()
        const e = String(email || "").trim().toLowerCase()
        if (!e || !e.includes("@")) return json({ error: "Enter a valid email." }, 400)
        const invited = (await membershipsFor(e)).length > 0
        if (!emailAllowed(e) && !invited) return json({ error: "This email isn't on the access list. Ask an admin to invite you." }, 403)
        const code = otp()
        await createOtp(e, code, Date.now() + 10 * 60 * 1000)
        let emailed = false
        try { await sendOtp(e, code); emailed = true } catch (err: any) { console.error("OTP email failed:", err.message); console.log(`OTP for ${e} → ${code}`) }
        return json({ ok: true, emailed, ...(DEV_SHOW_OTP ? { devCode: code } : {}) })
      } catch (err: any) { return json({ error: err.message }, 500) }
    }

    // ── auth: verify OTP ──
    if (req.method === "POST" && path === "/api/auth/verify") {
      try {
        if (!db) return json({ error: "Login is not configured." }, 500)
        const { email, code } = await req.json()
        const e = String(email || "").trim().toLowerCase()
        const c = String(code || "").trim()
        if (!(await verifyOtp(e, c))) return json({ error: "Invalid or expired code." }, 401)
        await upsertUser(e)
        await ensureWorkspace(e)
        const sid = token()
        await createSession(sid, e, Date.now() + SESSION_DAYS * 86400 * 1000)
        return json({ ok: true, redirect: "/dashboard", token: sid }, 200, { "Set-Cookie": cookie("klav_session", sid, SESSION_DAYS * 86400, SECURE) })
      } catch (err: any) { return json({ error: err.message }, 500) }
    }
    if (req.method === "POST" && path === "/api/auth/logout") {
      const sid = parseCookies(req.headers.get("cookie"))["klav_session"]
      if (sid && db) await deleteSession(sid).catch(() => {})
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie("klav_session", SECURE) })
    }

    // ── feedback intake (extension backend mode) ──
    if (req.method === "POST" && path === "/api/feedback") {
      try {
        const form = await req.formData()
        const description = String(form.get("description") || "").trim()
        const pageUrl = String(form.get("page_url") || "")
        if (!description) return json({ error: "Description is required." }, 400)

        // Resolve the Plane connection: Bearer (personal → team) else forwarded direct creds.
        let planeToken = "", planeWorkspace = "", planeProject = "", planeHost = "https://api.plane.so"
        const email = await bearerEmail(req)
        if (email) {
          const ms = await membershipsFor(email)
          const stored = (await getIntegration("user", email)) || (ms[0] ? await getIntegration("workspace", ms[0].workspaceId) : null)
          if (stored?.config?.token_enc) {
            planeToken = await decryptSecret(stored.config.token_enc)
            planeWorkspace = stored.config.workspace; planeProject = stored.config.projectId
            planeHost = (stored.config.host || "https://api.plane.so").replace(/\/+$/, "")
          }
        }
        if (!planeToken) { // direct mode (Phase 1): creds forwarded in the form
          planeToken = String(form.get("plane_token") || "")
          planeWorkspace = String(form.get("plane_workspace") || "")
          planeProject = String(form.get("plane_project_id") || "")
          planeHost = String(form.get("plane_host") || "https://api.plane.so").replace(/\/+$/, "")
        }
        if (!planeToken || !planeWorkspace || !planeProject) return json({ error: "No Plane connection. Configure one in Klavity or the extension." }, 400)

        // Upload screenshots (cap 5, 8MB each) to object storage.
        const files = form.getAll("screenshots").filter((f): f is File => f instanceof File).slice(0, 5)
        const imageUrls: string[] = []
        for (const f of files) {
          if (f.type && !f.type.startsWith("image/")) return json({ error: `Screenshot ${f.name} is not an image.` }, 400)
          if (f.size > 8 * 1024 * 1024) return json({ error: `Screenshot ${f.name} exceeds 8MB.` }, 400)
          imageUrls.push(await uploadScreenshot(await f.arrayBuffer(), f.type || "image/png"))
        }

        const description_html = buildIssueHtml(description, pageUrl, imageUrls)
        const res = await fetch(`${planeHost}/api/v1/workspaces/${planeWorkspace}/projects/${planeProject}/issues/`, {
          method: "POST",
          headers: { "X-API-Key": planeToken, "Content-Type": "application/json" },
          body: JSON.stringify({ name: `[Klavity] ${description.slice(0, 180)}`, description_html }),
        })
        if (!res.ok) return json({ error: `Plane API error ${res.status}: ${(await res.text()).slice(0, 300)}` }, 502)

        const data: any = await res.json()
        const webBase = planeHost === "https://api.plane.so" ? "https://app.plane.so" : planeHost
        const issueId = String(data.id ?? "")
        const seq = data.sequence_id != null ? String(data.sequence_id) : ""
        return json({
          id: issueId,
          // Omit jira_key when Plane gives no sequence_id, so the extension's `?? id` fallback fires.
          ...(seq ? { jira_key: seq } : {}),
          issue_url: `${webBase}/${planeWorkspace}/projects/${planeProject}/issues/${issueId ? issueId + "/" : ""}`,
        })
      } catch (e: any) {
        return json({ error: e?.message || "feedback failed" }, 500)
      }
    }

    // ── personas (Sims library) — cookie OR Bearer ──
    if (path === "/api/personas" || path.startsWith("/api/personas/")) {
      const me2 = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!me2) return json({ error: "Sign in to continue." }, 401)
      const ms2 = await membershipsFor(me2)
      const ws2 = ms2[0]
      if (!ws2) return json({ error: "No workspace." }, 400)
      const wid = ws2.workspaceId

      if (req.method === "GET" && path === "/api/personas") {
        const personas = await listPersonas(wid)
        return json({ personas })
      }
      if (req.method === "POST" && path === "/api/personas") {
        try {
          const body = await req.json()
          const id = "sim_" + crypto.randomUUID()
          await upsertPersona(id, wid, {
            name: String(body.name || "Unnamed"), role: String(body.role || ""),
            type: body.type === "internal" ? "internal" : "client",
            initials: String(body.initials || "").slice(0, 2).toUpperCase(),
            accent: String(body.accent || "#6366f1"),
            summary: String(body.summary || ""),
            insights: Array.isArray(body.insights) ? body.insights : [],
            avatar: body.avatar ? String(body.avatar) : null,
          })
          const [saved] = (await listPersonas(wid)).filter(p => p.id === id)
          return json({ persona: saved }, 201)
        } catch (e: any) { return json({ error: e.message }, 500) }
      }
      const idMatch = path.match(/^\/api\/personas\/([^/]+)$/)
      if (idMatch) {
        const pid = idMatch[1]
        if (req.method === "PUT") {
          try {
            const body = await req.json()
            await upsertPersona(pid, wid, {
              name: String(body.name || "Unnamed"), role: String(body.role || ""),
              type: body.type === "internal" ? "internal" : "client",
              initials: String(body.initials || "").slice(0, 2).toUpperCase(),
              accent: String(body.accent || "#6366f1"),
              summary: String(body.summary || ""),
              insights: Array.isArray(body.insights) ? body.insights : [],
              avatar: body.avatar ? String(body.avatar) : null,
            })
            return json({ ok: true })
          } catch (e: any) { return json({ error: e.message }, 500) }
        }
        if (req.method === "DELETE") {
          await deletePersona(pid, wid)
          return json({ ok: true })
        }
      }
      return json({ error: "Not found" }, 404)
    }

    // ── everything below requires a session ──
    const me = await sessionEmail(req)
    const needLogin = () => (req.method === "GET" ? redirect("/login") : json({ error: "Sign in to continue." }, 401))

    if (req.method === "GET" && path === "/dashboard") return me ? file(PUB + "/dashboard.html") : redirect("/login")
    if (req.method === "GET" && path === "/app") return me ? file(PUB + "/index.html") : redirect("/login")
    if (req.method === "GET" && path === "/onboarding") return me ? file(SITE + "/onboarding.html") : redirect("/login")

    if (path.startsWith("/api/")) {
      if (!me) return needLogin()

      // dashboard data
      if (req.method === "GET" && path === "/api/me") {
        const ms = await membershipsFor(me)
        const active = ms[0] || null
        const members = active ? await membersOf(active.workspaceId) : []
        return json({ email: me, workspaces: ms, active, members })
      }
      // workspace (team) connection — read by any member, written by admins
      if (path === "/api/integration") {
        const ms = await membershipsFor(me); const active = ms[0]
        if (!active) return json({ error: "No workspace." }, 400)
        if (req.method === "GET") {
          const cur = await getIntegration("workspace", active.workspaceId)
          return json({ integration: cur?.integration ?? null, config: cur ? redactPlane(cur.config) : null })
        }
        if (req.method === "POST") {
          if ((await roleIn(active.workspaceId, me)) !== "admin") return json({ error: "Only admins can set the team connection." }, 403)
          const form = await req.formData()
          const cfg = planeConfigFromForm(form) as PlaneStored
          const tok = String(form.get("token") || "")
          const existing = await getIntegration("workspace", active.workspaceId)
          cfg.token_enc = tok ? await encryptSecret(tok) : (existing?.config?.token_enc ?? "")
          if (!cfg.token_enc) return json({ error: "Token is required." }, 400)
          await setIntegration("workspace", active.workspaceId, "plane", cfg)
          return json({ ok: true, config: redactPlane(cfg) })
        }
      }
      // personal connection — the logged-in user, synced to their account
      if (path === "/api/integration/personal") {
        if (req.method === "GET") {
          const cur = await getIntegration("user", me)
          return json({ integration: cur?.integration ?? null, config: cur ? redactPlane(cur.config) : null })
        }
        if (req.method === "POST") {
          const form = await req.formData()
          const cfg = planeConfigFromForm(form) as PlaneStored
          const tok = String(form.get("token") || "")
          const existing = await getIntegration("user", me)
          cfg.token_enc = tok ? await encryptSecret(tok) : (existing?.config?.token_enc ?? "")
          if (!cfg.token_enc) return json({ error: "Token is required." }, 400)
          await setIntegration("user", me, "plane", cfg)
          return json({ ok: true, config: redactPlane(cfg) })
        }
      }
      // admin invites a user to the active workspace
      if (req.method === "POST" && path === "/api/team/invite") {
        const { email, role } = await req.json()
        const inv = String(email || "").trim().toLowerCase()
        if (!inv.includes("@")) return json({ error: "Enter a valid email." }, 400)
        const ms = await membershipsFor(me)
        const active = ms[0]
        if (!active) return json({ error: "No workspace." }, 400)
        if ((await roleIn(active.workspaceId, me)) !== "admin") return json({ error: "Only admins can invite." }, 403)
        await addMember(active.workspaceId, inv, role === "admin" ? "admin" : "user")
        return json({ ok: true, members: await membersOf(active.workspaceId) })
      }
      // brief → one persona (no transcript needed)
      if (req.method === "POST" && path === "/api/persona/brief") {
        try {
          const { brief } = await req.json()
          if (!brief || String(brief).trim().length < 4) return json({ error: "Describe your user in a sentence." }, 400)
          const sys = "Create ONE believable user persona (a \"Sim\") from the user's brief. Invent a plausible first+last name and a role. " +
            "Respond with ONLY a JSON object, no prose: {\"persona\":{\"name\":string,\"role\":string,\"type\":\"client\"|\"internal\",\"initials\":string(2 uppercase letters),\"accent\":string(hex colour like #6366f1),\"summary\":string,\"insights\":[{\"kind\":\"pain\"|\"want\"|\"love\",\"text\":string,\"quote\":string}]}} with exactly 3 insights; each quote is a short first-person line this persona might actually say."
          const { content, usage } = await chat([{ role: "system", content: sys }, { role: "user", content: "Brief: " + brief }], 1200, true)
          const data = parseJSON(content)
          return json({ persona: data.persona, usage })
        } catch (e: any) { return json({ error: e?.message || "create failed" }, 500) }
      }
      // gated AI
      if (req.method === "POST" && path === "/api/extract") {
        try {
          const { transcript } = await req.json()
          if (!transcript || transcript.trim().length < 20) return json({ error: "Transcript too short" }, 400)
          const { data, usage } = await extractPersonas(transcript)
          return json({ personas: data.personas || [], usage })
        } catch (e: any) { return json({ error: e?.message || "extract failed" }, 500) }
      }
      if (req.method === "POST" && path === "/api/react") {
        try {
          const { persona, imageB64, mediaType, pageUrl } = await req.json()
          if (!persona || !imageB64) return json({ error: "persona and imageB64 required" }, 400)
          const { data, usage } = await reactToPage(persona, imageB64, mediaType || "image/png", pageUrl || "")
          return json({ reactions: data.reactions || [], usage })
        } catch (e: any) { return json({ error: e?.message || "react failed" }, 500) }
      }
      return json({ error: "Not found" }, 404)
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`\n⚡ Klavity app → ${BASE}`)
console.log(`   model: ${MODEL} · auth: ${db ? "Turso OTP" : "DISABLED (no Turso)"} · dev-otp: ${DEV_SHOW_OTP}\n`)

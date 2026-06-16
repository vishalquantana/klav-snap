// Klav app server (Bun). Marketing on /, demo + dashboard behind email-OTP login.
import { initDb, db, createOtp, verifyOtp, upsertUser, createSession, getSession, deleteSession, ensureWorkspace, membershipsFor, membersOf, roleIn, addMember } from "./lib/db"
import { sendOtp } from "./lib/mail"
import { token, otp, emailAllowed, cookie, clearCookie, parseCookies } from "./lib/auth"

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

async function chat(messages: any[], maxTokens: number) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json", "HTTP-Referer": BASE, "X-Title": "Klav" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data: any = await res.json()
  const content: string = data?.choices?.[0]?.message?.content ?? ""
  const u = data?.usage || {}
  return { content, usage: { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens } }
}
function parseJSON(s: string) {
  try { return JSON.parse(s) } catch { const m = s.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error("Model did not return valid JSON") }
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

Bun.serve({
  port: PORT,
  idleTimeout: 180,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // ── public marketing + login ──
    if (req.method === "GET" && path === "/") return file(SITE + "/index.html")
    if (req.method === "GET" && path === "/home") return redirect("/")
    if (req.method === "GET" && path === "/login") return file(PUB + "/login.html")

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
        return json({ ok: true, redirect: "/dashboard" }, 200, { "Set-Cookie": cookie("klav_session", sid, SESSION_DAYS * 86400, SECURE) })
      } catch (err: any) { return json({ error: err.message }, 500) }
    }
    if (req.method === "POST" && path === "/api/auth/logout") {
      const sid = parseCookies(req.headers.get("cookie"))["klav_session"]
      if (sid && db) await deleteSession(sid).catch(() => {})
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie("klav_session", SECURE) })
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

console.log(`\n⚡ Klav app → ${BASE}`)
console.log(`   model: ${MODEL} · auth: ${db ? "Turso OTP" : "DISABLED (no Turso)"} · dev-otp: ${DEV_SHOW_OTP}\n`)

// Klavity app server (Bun). Marketing on /, demo + dashboard behind email-OTP login.
import { initDb, db, createOtp, verifyOtp, upsertUser, createSession, getSession, deleteSession, ensureAccount, membershipsFor, hasAnyMembership, membersOf, roleIn, getIntegration, setIntegration, listPersonas, upsertPersona, deletePersona, insertScreenshot, insertFeedback, insertActivity, updateFeedbackTracker, listActivity, listFeedback, dashboardCounts, projectAccess, listProjects, createProject, renameProject, projectById, membersOfProject, addProjectMember, insertTranscript, listTranscripts, listTraits, listTraitEvents, insertTrait, updateTrait, insertTraitEvent, hasReconcileRun, markReconcileRun, rebuildInsightsJson, ensureTraitsSeeded, listMonitoredUrls, addMonitoredUrl, setMonitoredUrlEnabled, removeMonitoredUrl, getExtensionTokenEmail, issueExtensionToken, matchMonitored, getConsent, setConsent, getReviewMode, setReviewMode, tryConsumeReviewBudget, reviewGate, reviewDedupeKey, reviewDay, screenshotById } from "./lib/db"
import { applyReconcileOps, type ReconcileOp, type Trait } from "./lib/provenance"
import { sendOtp } from "./lib/mail"
import { token, otp, emailAllowed, cookie, clearCookie, parseCookies } from "./lib/auth"
import { uploadScreenshotMeta, presignGet, type UploadedScreenshot } from "./lib/s3"
import { buildIssueHtml, escapeHtml } from "./lib/feedback"
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
  "The persona's insights each carry a stable \"traitId\". For every reaction, set citedTraitIds to the list of traitIds " +
  "of the persona's documented traits that actually drove that reaction (the pains/wants/loves it stems from). " +
  "Use [] if no documented trait applies. Only ever cite traitIds present in the persona you are given.\n\n" +
  "Respond with ONLY a JSON object, no prose, in exactly this shape:\n" +
  '{"reactions":[{"observation":string(<=240 chars, first person),"sentiment":"frustrated"|"confused"|"satisfied"|"delighted"|"neutral",' +
  '"emoji":string,"targetDescription":string,"box":{"x":number,"y":number,"w":number,"h":number}|null,' +
  '"citedTraitIds":string[],' +
  '"suggestedBug":{"title":string,"body":string,"severity":"high"|"medium"|"low"}|null}]}'

// RECONCILE: given a Sim's CURRENT traits (each with a stable traitId) + a new transcript, emit the
// minimal structured op list that evolves the Sim. One LLM call per matched Sim per transcript (§5
// cost guard — gated by reconcile_runs, never the whole library).
const RECONCILE_SYS =
  "You maintain a durable, provenance-tracked profile of ONE user persona (\"Sim\") as new interview/call " +
  "transcripts arrive. You are given the Sim's CURRENT traits (each a typed pain|want|love with a stable " +
  "traitId) and ONE new transcript. Emit the MINIMAL list of operations that evolves this Sim to reflect the " +
  "new transcript — do NOT restate unchanged traits, and do NOT invent traits the transcript does not support. " +
  "Every op MUST be anchored to a short verbatim quote from the transcript.\n\n" +
  "Operations:\n" +
  "- add: a genuinely NEW pain/want/love not already covered (omit traitId).\n" +
  "- reinforce: the transcript restates/confirms an existing trait (set traitId; text may echo the existing text).\n" +
  "- refine: the transcript sharpens/expands an existing trait's wording (set traitId; text = the improved text).\n" +
  "- contradict: the transcript shows the Sim no longer holds an existing trait (set traitId).\n" +
  "- supersede: an existing trait is REPLACED by a changed preference (set traitId; text = the replacement).\n\n" +
  "Be conservative: only emit an op when the transcript clearly supports it. quote is verbatim from the transcript; " +
  "speaker is who said it; reason is a short why.\n\n" +
  "Respond with ONLY a JSON object, no prose, in exactly this shape:\n" +
  '{"ops":[{"op":"add"|"reinforce"|"refine"|"contradict"|"supersede","kind":"pain"|"want"|"love",' +
  '"text":string,"quote":string,"speaker":string,"traitId":string|null,"reason":string}]}'

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

// ── P3a reconcile: one LLM call that evolves ONE Sim against ONE transcript (§5 cost guard). ──
// currentTraits is the Sim's ACTIVE sim_traits; returns the structured op list (LLM-free apply is
// done by applyReconcileOps in the route). The route MUST gate this on hasReconcileRun() so we never
// re-reconcile a (sim,transcript) pair nor touch the whole library.
async function reconcileSim(currentTraits: Trait[], transcript: string) {
  const traitsForLLM = currentTraits.map((t) => ({ traitId: t.id, kind: t.kind, text: t.text, strength: t.strength }))
  const { content, usage } = await chat([
    { role: "system", content: RECONCILE_SYS },
    { role: "user", content:
        "CURRENT TRAITS (JSON):\n" + JSON.stringify(traitsForLLM, null, 2) +
        "\n\nNEW TRANSCRIPT:\n\n" + transcript },
  ], 3000)
  const data = parseJSON(content)
  const rawOps: any[] = Array.isArray(data?.ops) ? data.ops : []
  const valid = new Set(["add", "reinforce", "refine", "contradict", "supersede"])
  const kinds = new Set(["pain", "want", "love"])
  // Sanitize: drop malformed ops, normalize traitId (null → undefined so applyReconcileOps treats add correctly).
  const ops: ReconcileOp[] = rawOps
    .filter((o) => o && valid.has(o.op) && kinds.has(o.kind) && typeof o.text === "string" && o.text.trim() && typeof o.quote === "string" && o.quote.trim())
    .map((o) => ({
      op: o.op, kind: o.kind, text: String(o.text), quote: String(o.quote),
      speaker: o.speaker != null ? String(o.speaker) : null,
      traitId: o.op === "add" || o.traitId == null ? undefined : String(o.traitId),
      reason: o.reason != null ? String(o.reason) : undefined,
    }))
  return { ops, usage }
}

// Conservative persona→Sim matching (§3/§4: "Sim-matching corrupting provenance → conservative match").
// Exact (case/space-insensitive) name match → confident auto-apply. A name-token overlap with a DIFFERENT
// role, or an ambiguous (>1 candidate) match → return for admin confirmation rather than silently merging.
function normName(s: string): string { return String(s || "").trim().toLowerCase().replace(/\s+/g, " ") }
function matchPersonaToSim(extracted: { name: string; role?: string }, sims: { id: string; name: string; role: string }[]): { simId: string } | { needsConfirm: { name: string; candidates: { simId: string; name: string; role: string }[] } } | null {
  const en = normName(extracted.name)
  if (!en) return null
  const exact = sims.filter((s) => normName(s.name) === en)
  if (exact.length === 1) return { simId: exact[0].id } // confident
  if (exact.length > 1) {
    // same name on multiple Sims → ambiguous, never silently merge.
    return { needsConfirm: { name: extracted.name, candidates: exact.map((s) => ({ simId: s.id, name: s.name, role: s.role })) } }
  }
  // fuzzy: any Sim sharing a first/last name token → confirm, don't auto-apply.
  const tokens = en.split(" ").filter((t) => t.length >= 3)
  const fuzzy = sims.filter((s) => { const sn = normName(s.name).split(" "); return tokens.some((t) => sn.includes(t)) })
  if (fuzzy.length) return { needsConfirm: { name: extracted.name, candidates: fuzzy.map((s) => ({ simId: s.id, name: s.name, role: s.role })) } }
  return null // no match → a brand-new persona (not auto-created in P3a step 2; surfaced as needsConfirm-free non-match)
}

// Resolve LLM-returned citedTraitIds → persisted citation fields ({quote, speaker, sourceDate, transcriptId}).
// Defensive: ignores ids that don't belong to the Sim (no crash); returns empty citation when nothing matches.
async function resolveCitations(simId: string | null, citedTraitIds: any): Promise<{
  citedTraitIds: string[]; sourceQuote: string | null; speaker: string | null; sourceTranscriptId: string | null; sourceDate: number | null
}> {
  const empty = { citedTraitIds: [] as string[], sourceQuote: null, speaker: null, sourceTranscriptId: null, sourceDate: null }
  if (!simId || !Array.isArray(citedTraitIds) || !citedTraitIds.length) return empty
  const want = new Set(citedTraitIds.map((x) => String(x)))
  const traits = await listTraits(simId) // all statuses — a cited trait may have since been superseded
  const matched = traits.filter((t) => want.has(t.id))
  if (!matched.length) return empty
  const primary = matched[0]
  // source_date comes from the trait's originating transcript (drives "(Sarah, 2026-06-12)" citations).
  let sourceDate: number | null = null
  if (primary.srcTranscriptId) {
    const tr = await db!.execute({ sql: "SELECT source_date FROM transcripts WHERE id=?", args: [primary.srcTranscriptId] })
    if (tr.rows.length) sourceDate = Number((tr.rows[0] as any).source_date)
  }
  return {
    citedTraitIds: matched.map((t) => t.id),
    sourceQuote: primary.srcQuote || null,
    speaker: primary.srcSpeaker || null,
    sourceTranscriptId: primary.srcTranscriptId || null,
    sourceDate,
  }
}

// One-line human citation for the Plane issue body: "Cited from Sarah's profile: “…” (Sarah, 2026-06-12)".
function citationLine(c: { sourceQuote: string | null; speaker?: string | null; sourceDate: number | null }): string | null {
  if (!c.sourceQuote) return null
  const date = c.sourceDate ? new Date(c.sourceDate).toISOString().slice(0, 10) : null
  const who = c.speaker || null
  const attr = who && date ? ` (${who}, ${date})` : who ? ` (${who})` : date ? ` (${date})` : ""
  return `Cited from Sim profile: “${c.sourceQuote}”${attr}`
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
// Identify a request authenticated by an `Authorization: Bearer <token>` header (the extension).
// R5 security pre-req: prefer a dedicated narrow-scope extension token (ext_…); fall back to the raw
// 7-day session id for back-compat with already-connected extensions/popups until they re-sync.
async function bearerEmail(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || ""
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m || !db) return null
  const tok = m[1]
  if (tok.startsWith("ext_")) return getExtensionTokenEmail(tok)
  return (await getExtensionTokenEmail(tok)) || (await getSession(tok))
}

// Resolve the project a request targets: explicit ?project=:id if accessible, else the caller's
// first accessible project. Returns null if the caller has no accessible project. Gated by projectAccess.
async function resolveProject(email: string, requested?: string | null): Promise<{ id: string; access: 'admin' | 'member' } | null> {
  if (requested) {
    const a = await projectAccess(email, requested)
    if (a) return { id: requested, access: a }
    return null
  }
  const projects = await listProjects(email)
  for (const p of projects) {
    const a = await projectAccess(email, p.id)
    if (a) return { id: p.id, access: a }
  }
  return null
}

// ── /api/sim/review dedupe cache (§5: promote the klav_dev_react_* hash). In-process LRU-ish set keyed
// by reviewDedupeKey(sim,urlPath,domSig); a page isn't re-reviewed for a Sim until its DOM sig changes.
// Bounded so it can't grow unbounded across a long-lived SW; eviction is best-effort (dedupe is a cost
// guard, not a correctness gate — a miss at worst spends one extra budgeted review).
const REVIEW_SEEN = new Map<string, number>()
const REVIEW_SEEN_MAX = 5000
const REVIEW_SEEN_TTL = 6 * 60 * 60 * 1000 // 6h
function reviewSeen(key: string): boolean {
  const t = REVIEW_SEEN.get(key)
  if (t == null) return false
  if (Date.now() - t > REVIEW_SEEN_TTL) { REVIEW_SEEN.delete(key); return false }
  return true
}
function markReviewSeen(key: string) {
  if (REVIEW_SEEN.size >= REVIEW_SEEN_MAX) {
    // drop the oldest ~10% (insertion order ≈ age) to bound memory.
    let n = Math.ceil(REVIEW_SEEN_MAX * 0.1)
    for (const k of REVIEW_SEEN.keys()) { REVIEW_SEEN.delete(k); if (--n <= 0) break }
  }
  REVIEW_SEEN.set(key, Date.now())
}

// Decode a data: URL (e.g. captureVisibleTab's "data:image/png;base64,…") → bytes + media type +
// the raw base64 payload (so the vision call can reuse it without re-encoding multi-MB arrays, which
// would overflow the call stack via String.fromCharCode(...)).
function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string; base64: string } | null {
  const m = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!m) return null
  const contentType = m[1] || "image/png"
  const isB64 = !!m[2]
  const data = m[3] || ""
  try {
    const bytes = isB64 ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(data))
    const base64 = isB64 ? data : Buffer.from(bytes).toString("base64")
    return { bytes, contentType, base64 }
  } catch { return null }
}

// Path-only URL split (privacy by structure, §5c): {host, path} with query+fragment stripped.
function splitUrl(pageUrl: string): { urlHost: string | null; urlPath: string | null } {
  if (!pageUrl) return { urlHost: null, urlPath: null }
  try { const u = new URL(pageUrl); return { urlHost: u.host, urlPath: u.pathname } }
  catch { return { urlHost: null, urlPath: pageUrl.split(/[?#]/)[0] || null } }
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
    if (req.method === "GET" && path === "/login") {
      // Already signed in → skip the login page and land on the dashboard.
      if (await sessionEmail(req)) return redirect("/dashboard")
      return file(PUB + "/login.html")
    }
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
        const invited = await hasAnyMembership(e)
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
        await ensureAccount(e)
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
          const proj = await resolveProject(email, url.searchParams.get("project"))
          const stored = (await getIntegration("user", email)) || (proj ? await getIntegration("project", proj.id) : null)
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
        // A tracker connection is OPTIONAL. Klavity owns the feedback; Plane is a downstream sink.
        // Missing creds → we still persist below and return 200-saved (no 400).
        const planeConnected = !!(planeToken && planeWorkspace && planeProject)

        // Upload screenshots (cap 5, 8MB each) to object storage.
        const files = form.getAll("screenshots").filter((f): f is File => f instanceof File).slice(0, 5)
        const imageUrls: string[] = []
        const uploaded: Array<UploadedScreenshot & { bytes: number }> = []
        for (const f of files) {
          if (f.type && !f.type.startsWith("image/")) return json({ error: `Screenshot ${f.name} is not an image.` }, 400)
          if (f.size > 8 * 1024 * 1024) return json({ error: `Screenshot ${f.name} exceeds 8MB.` }, 400)
          const buf = await f.arrayBuffer()
          const meta = await uploadScreenshotMeta(buf, f.type || "image/png")
          imageUrls.push(meta.url)
          uploaded.push({ ...meta, bytes: buf.byteLength })
        }

        // ── persist to our durable ledger (P0) FIRST, always — best-effort, never fails the submission.
        // Runs whether or not a tracker is connected, so the dashboard always gets a row.
        let feedbackId: string | null = null
        let citation: { citedTraitIds: string[]; sourceQuote: string | null; speaker: string | null; sourceTranscriptId: string | null; sourceDate: number | null } | null = null
        if (db) {
          try {
            // Actor: Bearer (extension) or cookie session (studio). Resolve to a real project
            // (?project= if accessible, else the caller's first project).
            const actor = email || (await sessionEmail(req))
            const reqProject = String(form.get("project_id") || "") || url.searchParams.get("project")
            const resolved = actor ? await resolveProject(actor, reqProject) : null
            if (resolved) {
              const projectId = resolved.id
              // Path-only URL: strip query + fragment (privacy by structure).
              let urlHost: string | null = null, urlPath: string | null = null
              if (pageUrl) { try { const u = new URL(pageUrl); urlHost = u.host; urlPath = u.pathname } catch { urlPath = pageUrl.split(/[?#]/)[0] || null } }

              let screenshotId: string | null = null
              if (uploaded[0]) {
                screenshotId = await insertScreenshot({
                  projectId, s3Key: uploaded[0].key, bucket: uploaded[0].bucket,
                  contentType: uploaded[0].contentType, acl: uploaded[0].acl,
                  bytes: uploaded[0].bytes, ownerEmail: actor,
                })
              }

              const simId = String(form.get("sim_id") || "") || null
              const observation = String(form.get("observation") || "") || description
              const sentiment = String(form.get("sentiment") || "") || null
              const severity = String(form.get("severity") || "") || null
              let suggestedBug: any = null
              const sbRaw = String(form.get("suggested_bug") || "")
              if (sbRaw) { try { suggestedBug = JSON.parse(sbRaw) } catch { /* keep null */ } }

              // R8 citations: the studio/extension forwards the reaction's citedTraitIds (JSON array or
              // CSV). Resolve → {quote, speaker, sourceDate, transcriptId} from sim_traits; gracefully
              // empty when the Sim has no matching trait (no crash, citation fields stay null).
              let citedRaw: any = null
              const ctRaw = String(form.get("cited_trait_ids") || "")
              if (ctRaw) { try { citedRaw = JSON.parse(ctRaw) } catch { citedRaw = ctRaw.split(",").map((s) => s.trim()).filter(Boolean) } }
              citation = await resolveCitations(simId, citedRaw)

              feedbackId = await insertFeedback({
                projectId, simId, actorEmail: actor, urlHost, urlPath,
                observation, sentiment, severity, screenshotId, suggestedBug,
                citedTraitIds: citation.citedTraitIds.length ? citation.citedTraitIds : null,
                sourceQuote: citation.sourceQuote, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate,
                planeIssueKey: null, planeIssueUrl: null, // backfilled below if/when filed
              })
              await insertActivity({
                projectId, type: "feedback_filed", actorEmail: actor, simId,
                urlHost, urlPath, feedbackId, screenshotId,
              })
            }
          } catch (persistErr: any) {
            console.error("feedback persistence (non-fatal):", persistErr?.message || persistErr)
          }
        }

        // ── tracker filing is downstream and only attempted when a connection exists ──
        if (!planeConnected) {
          // No tracker: the item is saved to Klavity. Keep the response extension-safe:
          // backend.ts maps issueKey = jira_key ?? id, issueUrl = issue_url ?? backendUrl.
          return json({ id: feedbackId ?? "", saved: true })
        }

        // R8: append the Sim citation line to the issue body when this feedback cites a trait.
        const citeLine = citation ? citationLine({ sourceQuote: citation.sourceQuote, speaker: citation.speaker, sourceDate: citation.sourceDate }) : null
        const description_html = buildIssueHtml(description, pageUrl, imageUrls) +
          (citeLine ? `<p><em>${escapeHtml(citeLine)}</em></p>` : "")
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
        const issueUrl = `${webBase}/${planeWorkspace}/projects/${planeProject}/issues/${issueId ? issueId + "/" : ""}`

        // Backfill the tracker issue onto the persisted row (best-effort, never fails the request).
        if (db && feedbackId) {
          try { await updateFeedbackTracker(feedbackId, seq || issueId || null, issueUrl) }
          catch (e: any) { console.error("feedback tracker backfill (non-fatal):", e?.message || e) }
        }

        return json({
          id: issueId,
          // Omit jira_key when Plane gives no sequence_id, so the extension's `?? id` fallback fires.
          ...(seq ? { jira_key: seq } : {}),
          issue_url: issueUrl,
        })
      } catch (e: any) {
        return json({ error: e?.message || "feedback failed" }, 500)
      }
    }

    // ── personas (Sims library) — cookie OR Bearer ──
    if (path === "/api/personas" || path.startsWith("/api/personas/")) {
      const me2 = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!me2) return json({ error: "Sign in to continue." }, 401)
      const proj2 = await resolveProject(me2, url.searchParams.get("project"))
      if (!proj2) return json({ error: "No project." }, 400)
      const wid = proj2.id

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

    // ── extension config sync (P3b) — cookie OR Bearer. Returns, for every project the caller can see,
    // the enabled monitored url patterns + that project's review_mode, plus a freshly-issued dedicated
    // extension token bound to the caller. The extension caches this to decide where to auto-activate.
    if (req.method === "GET" && path === "/api/extension/config") {
      const meX = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meX) return json({ error: "Sign in to continue." }, 401)
      const projects = await listProjects(meX)
      const out = []
      for (const p of projects) {
        const access = await projectAccess(meX, p.id)
        if (!access) continue // project-scoped via projectAccess
        const patterns = (await listMonitoredUrls(p.id, { enabledOnly: true })).map(m => m.urlPattern)
        out.push({ id: p.id, name: p.name, reviewMode: p.reviewMode, monitoredUrls: patterns })
      }
      // Dedicated narrow-scope token (R5): replaces reusing the raw session id as the Bearer.
      const extToken = await issueExtensionToken(meX, null, SESSION_DAYS * 24 * 60 * 60 * 1000)
      return json({ email: meX, token: extToken, projects: out })
    }

    // ── monitoring consent (P3b) — grant / pause / revoke for the CALLER on a project. Cookie OR Bearer.
    // 'granted' = allow capture; 'paused' = user-pause (instant, reversible); 'revoked' = withdraw consent.
    // This is the per-member-per-project consent row that gate (c) requires before the first capture (§5b).
    if (req.method === "POST" && path === "/api/consent") {
      const meC = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meC) return json({ error: "Sign in to continue." }, 401)
      const body = await req.json().catch(() => ({}))
      const projC = await resolveProject(meC, String(body.projectId || "") || url.searchParams.get("project"))
      if (!projC) return json({ error: "No project." }, 400)
      const status = String(body.status || "").trim()
      if (!["granted", "paused", "revoked"].includes(status)) return json({ error: "status must be granted|paused|revoked." }, 400)
      await setConsent(projC.id, meC, status as "granted" | "paused" | "revoked")
      const cur = await getConsent(projC.id, meC)
      return json({ ok: true, projectId: projC.id, consent: cur?.status ?? status })
    }

    // ── admin pause (P3b) — project-wide review_mode 'paused' (admin pause) | 'auto' (resume). Cookie OR
    // Bearer; PROJECT ADMIN ONLY. This is gate (b)'s admin side; user pause is /api/consent (status 'paused').
    {
      const pauseMatch = path.match(/^\/api\/projects\/([^/]+)\/pause$/)
      if (req.method === "POST" && pauseMatch) {
        const meP = (await sessionEmail(req)) || (await bearerEmail(req))
        if (!meP) return json({ error: "Sign in to continue." }, 401)
        const pid = pauseMatch[1]
        const access = await projectAccess(meP, pid)
        if (!access) return json({ error: "No access to this project." }, 403)
        if (access !== "admin") return json({ error: "Only project admins can pause/resume reviews." }, 403)
        const body = await req.json().catch(() => ({}))
        // accept { paused: true } or { mode: 'paused'|'auto' }
        const mode: "paused" | "auto" = body.mode === "auto" || body.paused === false ? "auto" : body.mode === "paused" || body.paused === true ? "paused" : "paused"
        await setReviewMode(pid, mode)
        await insertActivity({ projectId: pid, type: "review_mode_changed", actorEmail: meP, meta: { mode } })
        return json({ ok: true, projectId: pid, reviewMode: mode })
      }
    }

    // ── signed screenshot URL (P3b, R7) — membership-checked. PRIVATE Sim screenshots return a short-lived
    // presigned GET; the existing public-read Snap screenshots return their direct public URL. Cookie OR Bearer.
    {
      const shotMatch = path.match(/^\/api\/screenshots\/([^/]+)$/)
      if (req.method === "GET" && shotMatch) {
        const meS = (await sessionEmail(req)) || (await bearerEmail(req))
        if (!meS) return json({ error: "Sign in to continue." }, 401)
        const shot = await screenshotById(shotMatch[1])
        if (!shot) return json({ error: "Not found." }, 404)
        // Membership check: the screenshot's project must be one the caller can access.
        if (!shot.projectId || !(await projectAccess(meS, shot.projectId))) return json({ error: "No access to this screenshot." }, 403)
        try {
          if (shot.acl === "public-read") {
            const pub = `${(process.env.S3_ENDPOINT || "").replace(/\/+$/, "")}/${shot.bucket}/${shot.s3Key}`
            return json({ id: shot.id, url: pub, acl: shot.acl })
          }
          const url = presignGet(shot.s3Key, 600)
          return json({ id: shot.id, url, acl: shot.acl, expiresInSec: 600 })
        } catch (e: any) { return json({ error: e?.message || "could not sign url" }, 500) }
      }
    }

    // ── /api/sim/review (P3b, R5) — the core AUTO-COMMENT endpoint the extension calls on a monitored visit.
    // Body: { projectId?, url, screenshotDataUrl, domSig?, simIds? }. GUARDRAILS run IN ORDER (§5, binding);
    // each is a hard gate that returns a clear `reason` if blocked. NOTHING is captured/reviewed off-allowlist
    // and no screenshot/vision work happens until every gate passes. Cookie OR Bearer.
    if (req.method === "POST" && path === "/api/sim/review") {
      const meR = (await sessionEmail(req)) || (await bearerEmail(req))
      try {
        const body = await req.json().catch(() => ({}))
        const pageUrl = String(body.url || "")
        const domSig = body.domSig != null ? String(body.domSig) : null
        const screenshotDataUrl = String(body.screenshotDataUrl || "")
        const reqSimIds: string[] = Array.isArray(body.simIds) ? body.simIds.map(String) : []

        // (a) AUTH + project access. Resolve project by matchMonitored(url) when projectId is absent — but
        //     only across projects the caller can access (no cross-project leakage / off-account capture).
        if (!meR) return json({ ok: false, reason: "unauthorized", error: "Sign in to continue." }, 401)
        let projectId: string | null = null
        const requestedProject = String(body.projectId || "") || url.searchParams.get("project")
        if (requestedProject) {
          const a = await resolveProject(meR, requestedProject)
          if (a) projectId = a.id
        } else if (pageUrl) {
          // pick the first accessible project whose allowlist matches this url.
          for (const p of await listProjects(meR)) {
            if (!(await projectAccess(meR, p.id))) continue
            if (await matchMonitored(p.id, pageUrl)) { projectId = p.id; break }
          }
        }
        if (!projectId) return json({ ok: false, reason: "unauthorized", error: "No accessible project for this URL." }, 401)

        // Resolve the inputs the pure gate needs (in gate order; cheap reads, no AI/S3 yet).
        const reviewMode = await getReviewMode(projectId)
        const consent = await getConsent(projectId, meR)
        const consentStatus = consent?.status ?? null
        const allowlist = pageUrl ? await matchMonitored(projectId, pageUrl) : null
        const { urlHost, urlPath } = splitUrl(pageUrl)

        // (e) dedupe is computed across the Sims we'd review; if ALL are already-seen we short-circuit.
        // Resolve target Sims first (project Sims, or the caller-supplied subset) so we can key dedupe.
        const projectSims = await listPersonas(projectId)
        const targetSims = reqSimIds.length ? projectSims.filter((p) => reqSimIds.includes(p.id)) : projectSims
        const seenKeys = targetSims.map((s) => reviewDedupeKey(s.id, urlPath || "", domSig))
        const allSeen = targetSims.length > 0 && seenKeys.every((k) => reviewSeen(k))

        // (f) budget is the LAST gate and is the ONLY side-effecting pre-check (atomic consume). We only
        //     attempt it once gates a–e pass, so a blocked request never burns budget. Pre-evaluate a–e
        //     with budgetConsumed=true to find any earlier block without consuming.
        const pre = reviewGate({ authed: true, reviewMode, consentStatus, allowlistMatch: !!allowlist, alreadyReviewed: allSeen, budgetConsumed: true })
        if (!pre.ok) return json({ ok: false, reason: pre.reason, error: pre.message, projectId }, pre.status)

        // All of a–e passed → atomically consume one budget slot (f).
        const proj = await projectById(projectId)
        const budget = proj?.reviewBudgetDaily ?? 0
        const day = reviewDay()
        const budgetConsumed = await tryConsumeReviewBudget(projectId, day, budget ?? 0)
        const gate = reviewGate({ authed: true, reviewMode, consentStatus, allowlistMatch: !!allowlist, alreadyReviewed: allSeen, budgetConsumed })
        if (!gate.ok) {
          if (gate.reason === "budgetExhausted") {
            // auto-pause the project + notify the admin (§5 cost guard).
            await setReviewMode(projectId, "paused")
            await insertActivity({ projectId, type: "admin_notify", actorEmail: meR, urlHost, urlPath, meta: { reason: "budget_exhausted", day, budget } })
          }
          return json({ ok: false, reason: gate.reason, error: gate.message, projectId }, gate.status)
        }

        // ── ALL GATES PASSED. Only now do we capture + review. ──
        if (!screenshotDataUrl) return json({ ok: false, reason: "noScreenshot", error: "screenshotDataUrl is required." }, 400)
        const decoded = decodeDataUrl(screenshotDataUrl)
        if (!decoded) return json({ ok: false, reason: "badScreenshot", error: "screenshotDataUrl could not be decoded." }, 400)

        // Store the screenshot PRIVATE (acl='private') + record the durable ledger row (P0).
        const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000 // private Sim screenshots: 30-day (§6)
        const upload = await uploadScreenshotMeta(decoded.bytes, decoded.contentType, "private")
        const screenshotId = await insertScreenshot({
          projectId, s3Key: upload.key, bucket: upload.bucket, contentType: upload.contentType,
          acl: "private", bytes: decoded.bytes.byteLength, ownerEmail: meR, expiresAt,
        })

        // Run the vision review (reuse reactToPage) for each target Sim; persist feedback + activity.
        const imageB64 = decoded.base64
        const out: any[] = []
        for (let i = 0; i < targetSims.length; i++) {
          const sim = targetSims[i]
          // Skip a Sim whose (sim,path,domSig) was already reviewed (per-Sim dedupe; we still captured once).
          if (reviewSeen(seenKeys[i])) continue
          let reactions: any[] = []
          try {
            const { data } = await reactToPage(sim, imageB64, decoded.contentType, urlPath || pageUrl)
            reactions = Array.isArray(data?.reactions) ? data.reactions : []
          } catch (e: any) {
            console.error("sim/review reactToPage (non-fatal):", e?.message || e)
            continue
          }
          for (const r of reactions) {
            const citation = await resolveCitations(sim.id, r?.citedTraitIds)
            const feedbackId = await insertFeedback({
              projectId, simId: sim.id, actorEmail: meR, urlHost, urlPath,
              observation: r?.observation ?? null, sentiment: r?.sentiment ?? null,
              severity: r?.suggestedBug?.severity ?? null, screenshotId, suggestedBug: r?.suggestedBug ?? null,
              citedTraitIds: citation.citedTraitIds.length ? citation.citedTraitIds : null,
              sourceQuote: citation.sourceQuote, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate,
            })
            r.citation = citation.citedTraitIds.length
              ? { citedTraitIds: citation.citedTraitIds, sourceQuote: citation.sourceQuote, speaker: citation.speaker, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate }
              : null
            r.feedbackId = feedbackId
          }
          // activity: a review ran (actor + sim + path + screenshot) — the R6 observability spine.
          await insertActivity({ projectId, type: "review_run", actorEmail: meR, simId: sim.id, urlHost, urlPath, screenshotId, meta: { reactions: reactions.length } })
          markReviewSeen(seenKeys[i])
          out.push({ simId: sim.id, simName: sim.name, initials: sim.initials, accent: sim.accent, reactions })
        }

        return json({ ok: true, projectId, screenshotId, reviews: out })
      } catch (e: any) {
        return json({ ok: false, reason: "error", error: e?.message || "review failed" }, 500)
      }
    }

    // ── transcripts → reconcile (P3a) — project-scoped via resolveProject; cookie OR Bearer; admin or member ──
    if (req.method === "POST" && path === "/api/transcripts") {
      const meT = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meT) return json({ error: "Sign in to continue." }, 401)
      const projT = await resolveProject(meT, url.searchParams.get("project"))
      if (!projT) return json({ error: "No project." }, 400)
      const projectId = projT.id
      try {
        const body = await req.json().catch(() => ({}))
        const text = String(body.transcript || body.raw_text || "").trim()
        if (text.length < 20) return json({ error: "Transcript too short" }, 400)
        const title = body.title ? String(body.title) : null
        const sourceDate = Number(body.sourceDate || body.source_date) || Date.now()

        // 1) persist the transcript (provenance anchor for every trait it produces).
        const transcriptId = await insertTranscript({
          projectId, title, rawText: text, sourceDate,
          speakers: Array.isArray(body.speakers) ? body.speakers.map(String) : null, addedBy: meT,
        })
        // activity: a transcript was added to the project (actor = adder).
        await insertActivity({ projectId, type: "transcript_added", actorEmail: meT, meta: { transcriptId, title } })

        // 2) AI CALL #1: extract personas from the transcript (existing helper).
        const { data: extractData, usage: extractUsage } = await extractPersonas(text)
        const extracted: any[] = Array.isArray(extractData?.personas) ? extractData.personas : []

        // 3) conservative match → existing project Sims. Confident → auto-apply; fuzzy/ambiguous → needsConfirm.
        const sims = (await listPersonas(projectId)).map((p) => ({ id: p.id, name: p.name, role: p.role }))
        const matched: { simId: string }[] = []
        const needsConfirm: { name: string; candidates: { simId: string; name: string; role: string }[] }[] = []
        for (const p of extracted) {
          const m = matchPersonaToSim({ name: String(p?.name || ""), role: p?.role ? String(p.role) : undefined }, sims)
          if (m && "simId" in m) matched.push({ simId: m.simId })
          else if (m && "needsConfirm" in m) needsConfirm.push(m.needsConfirm)
        }
        // de-dup matched Sims (two extracted personas could both map to one Sim — reconcile it once).
        const matchedSimIds = [...new Set(matched.map((m) => m.simId))]

        // 4) AI CALL #2 (per matched Sim, gated): reconcileSim → applyReconcileOps → persist + audit + cache.
        let opsApplied = 0
        const reconcileUsages: any[] = []
        for (const simId of matchedSimIds) {
          if (await hasReconcileRun(simId, transcriptId)) continue // COST GUARD: never re-reconcile a (sim,transcript) pair
          // Legacy backfill BEFORE reconcile: a pre-P3a Sim has insights_json but zero sim_traits.
          // Seed them first so the LLM reconcile sees existing traits (real reinforce/refine/contradict
          // evolution) and rebuildInsightsJson never wipes the Sim's prior insights. Idempotent.
          await ensureTraitsSeeded(simId)
          const current = await listTraits(simId, { activeOnly: true })
          const { ops, usage } = await reconcileSim(current, text)
          reconcileUsages.push(usage)
          const res = applyReconcileOps(current, ops, { simId, projectId, transcriptId, sourceDate })
          for (const w of res.traitWrites) {
            if (w.mode === "insert") await insertTrait(w.trait)
            else await updateTrait(w.trait)
          }
          for (const e of res.traitEvents) await insertTraitEvent(e)
          await markReconcileRun(simId, transcriptId)
          await rebuildInsightsJson(simId)
          opsApplied += res.traitWrites.length
          await insertActivity({ projectId, type: "sim_evolved", actorEmail: meT, simId, meta: { transcriptId, ops: res.traitWrites.length } })
        }

        return json({
          transcriptId,
          matched: matchedSimIds,
          opsApplied,
          needsConfirm,
          usage: { extract: extractUsage, reconcile: reconcileUsages },
        }, 201)
      } catch (e: any) { return json({ error: e?.message || "transcript failed" }, 500) }
    }

    // ── Sim evolution timeline (P3a step 3) — project-scoped; cookie OR Bearer; admin or member. ──
    // Returns this Sim's trait_events newest-first (what changed + new text + driving quote/transcript/date),
    // enriched with the originating transcript's title so the studio can render the "Evolution" timeline.
    // Graceful: a Sim with no transcript-driven history returns an empty events array.
    {
      const evoMatch = path.match(/^\/api\/sims\/([^/]+)\/evolution$/)
      if (req.method === "GET" && evoMatch) {
        const meE = (await sessionEmail(req)) || (await bearerEmail(req))
        if (!meE) return json({ error: "Sign in to continue." }, 401)
        const projE = await resolveProject(meE, url.searchParams.get("project"))
        if (!projE) return json({ error: "No project." }, 400)
        const simId = evoMatch[1]
        // Authorize: the Sim must belong to the resolved project (no cross-project leakage).
        const sims = await listPersonas(projE.id)
        const sim = sims.find((p) => p.id === simId)
        if (!sim) return json({ error: "Not found" }, 404)
        try {
          const events = await listTraitEvents(simId) // ASC from db
          // Map transcript_id → title for human-readable provenance ("from <transcript>, <date>").
          const titleById = new Map<string, string | null>()
          for (const tr of await listTranscripts(projE.id)) titleById.set(tr.id, tr.title)
          const timeline = events
            .slice()
            .reverse() // newest-first for the timeline view
            .map((e) => ({
              op: e.op,
              afterText: e.afterText,
              beforeText: e.beforeText,
              quote: e.quote,
              speaker: e.speaker,
              sourceDate: e.sourceDate,
              transcriptId: e.transcriptId,
              transcriptTitle: titleById.has(e.transcriptId) ? titleById.get(e.transcriptId) : null,
              reason: e.reason,
              createdAt: e.createdAt,
            }))
          return json({ simId, name: sim.name, events: timeline })
        } catch (e: any) { return json({ error: e?.message || "evolution failed" }, 500) }
      }
    }

    // ── everything below requires a session ──
    const me = await sessionEmail(req)
    const needLogin = () => (req.method === "GET" ? redirect("/login") : json({ error: "Sign in to continue." }, 401))

    if (req.method === "GET" && path === "/dashboard") return me ? file(PUB + "/dashboard.html") : redirect("/login")
    if (req.method === "GET" && path === "/app") return me ? file(PUB + "/index.html") : redirect("/login")
    if (req.method === "GET" && path === "/onboarding") {
      // The new onboarding is the signup wizard for LOGGED-OUT users (email → OTP → name project inline).
      // R9/P0 intent preserved: a logged-in user who already has a membership must not get stuck on
      // onboarding — send them to the dashboard. Logged-out (or logged-in-without-membership) users can
      // sign up inline, so we SERVE the page rather than bouncing to /login.
      if (me && (await membershipsFor(me)).length > 0) return redirect("/dashboard")
      return file(SITE + "/onboarding.html")
    }

    if (path.startsWith("/api/")) {
      if (!me) return needLogin()

      // dashboard data
      if (req.method === "GET" && path === "/api/me") {
        const ms = await membershipsFor(me)
        const active = ms[0] || null
        const members = active ? await membersOf(active.workspaceId) : []
        return json({ email: me, workspaces: ms, active, members })
      }
      // ── dashboard-on-login aggregate (P1): one round-trip, reads only, no AI/vision. ──
      // Derived single project ('proj_'+workspaceId) until the P2 schema lands; UI is already project-shaped.
      if (req.method === "GET" && path === "/api/dashboard") {
        try {
          // Real projects (P2). Honor ?project=:id (projectAccess-gated); default to the first.
          const allProjects = await listProjects(me)
          if (!allProjects.length) {
            // No project yet — return an empty-but-valid shape so the UI renders skeleton/empty states.
            return json({ email: me, projects: [], active: null, members: [], sims: [], saying: [], tickets: [], activity: [], counts: { feedback: 0, tickets: 0, activity: 0 } })
          }
          const requested = url.searchParams.get("project")
          const resolved = await resolveProject(me, requested)
          if (!resolved) return json({ error: "No access to this project." }, 403)
          const projectId = resolved.id
          const access = resolved.access
          const role = access === "admin" ? "admin" : "user" // legacy vocab for the dashboard UI
          const isAdmin = access === "admin"

          // projects / active — REAL projects from the projects table.
          const activeProj = await projectById(projectId)
          const projectName = activeProj?.name || "Default Project"
          const projects = allProjects.map(p => ({ id: p.id, name: p.name }))
          const activeOut = { id: projectId, name: projectName, role }

          // members — project roster (project_members), mapped to legacy admin|user for the UI.
          const members = (await membersOfProject(projectId)).map(m => ({ email: m.email, role: m.role === "admin" ? "admin" : "user", createdAt: m.createdAt }))
          const wid = projectId // reads below are all project-scoped on the project id

          // Reads run in parallel (each is an indexed query).
          const [personas, feedbackTickets, activityRows, sayingFeedback] = await Promise.all([
            listPersonas(wid),
            listFeedback(projectId, { withTicketOnly: true, limit: 12 }),
            // Non-admins see only their own activity (own-rows-only); admins see all.
            listActivity(projectId, { actorEmail: isAdmin ? null : me, limit: 25 }),
            // Recent observations (any feedback row with text), newest-first, for the "saying" feed.
            listFeedback(projectId, { limit: 12 }),
          ])

          // Index personas for name/role/accent lookups by sim_id.
          const personaById = new Map(personas.map(p => [p.id, p]))
          const lastActiveBySim = new Map<string, number>()
          for (const ev of activityRows) {
            if (ev.simId && !lastActiveBySim.has(ev.simId)) lastActiveBySim.set(ev.simId, ev.createdAt)
          }

          // sims — the project's personas with a last-active hint from activity_events.
          const sims = personas.map(p => ({
            id: p.id, name: p.name, role: p.role, type: p.type,
            initials: p.initials || p.name.slice(0, 2).toUpperCase(),
            accent: p.accent || "#6366f1",
            insightsCount: Array.isArray(p.insights) ? p.insights.length : 0,
            lastActiveAt: lastActiveBySim.get(p.id) ?? null,
          }))

          // saying — "what your Sims are saying": recent feedback observations first; if none yet,
          // fall back to personas' insights_json so a new user never sees a blank feed.
          let saying = sayingFeedback
            .filter(f => f.observation)
            .map(f => {
              const p = f.simId ? personaById.get(f.simId) : null
              return {
                source: "feedback" as const,
                simId: f.simId, simName: p?.name ?? null,
                initials: p?.initials || (p?.name?.slice(0, 2).toUpperCase()) || null,
                accent: p?.accent ?? "#6366f1",
                text: f.observation, sentiment: f.sentiment,
                urlPath: f.urlPath, createdAt: f.createdAt,
              }
            })
          if (!saying.length) {
            // fallback: most recent insight per persona (so it's never blank for a fresh project).
            const fb: any[] = []
            for (const p of personas) {
              const ins = Array.isArray(p.insights) ? p.insights : []
              const top = ins[0]
              if (top && (top.text || top.quote)) {
                fb.push({
                  source: "insight" as const,
                  simId: p.id, simName: p.name,
                  initials: p.initials || p.name.slice(0, 2).toUpperCase(),
                  accent: p.accent || "#6366f1",
                  text: top.text || top.quote, kind: top.kind || null,
                  createdAt: p.updatedAt,
                })
              }
            }
            saying = fb.slice(0, 12) as any
          }

          // tickets — filed feedback (has a tracker key), newest-first, with sim attribution.
          const tickets = feedbackTickets.map(f => {
            const p = f.simId ? personaById.get(f.simId) : null
            return {
              id: f.id, simName: p?.name ?? null,
              title: f.observation, severity: f.severity,
              urlPath: f.urlPath, planeIssueKey: f.planeIssueKey,
              planeIssueUrl: f.planeIssueUrl, createdAt: f.createdAt,
            }
          })

          // activity — recent events (already own-rows-scoped for non-admins above).
          const activity = activityRows.map(ev => {
            const p = ev.simId ? personaById.get(ev.simId) : null
            return {
              id: ev.id, type: ev.type, actorEmail: ev.actorEmail,
              simName: p?.name ?? null, urlPath: ev.urlPath, createdAt: ev.createdAt,
            }
          })

          const counts = await dashboardCounts(projectId)
          return json({ email: me, projects, active: activeOut, members, sims, saying, tickets, activity, counts })
        } catch (e: any) {
          return json({ error: e?.message || "dashboard failed" }, 500)
        }
      }

      // Returns the current session ID as a Bearer token — the extension uses this to sync sims.
      if (req.method === "GET" && path === "/api/extension-token") {
        const sid = parseCookies(req.headers.get("cookie"))["klav_session"]
        if (!sid) return json({ error: "No session." }, 401)
        return json({ token: sid })
      }

      // project (team) connection — read by any member, written by project admins
      if (path === "/api/integration") {
        const proj = await resolveProject(me, url.searchParams.get("project"))
        if (!proj) return json({ error: "No project." }, 400)
        if (req.method === "GET") {
          const cur = await getIntegration("project", proj.id)
          return json({ integration: cur?.integration ?? null, config: cur ? redactPlane(cur.config) : null })
        }
        if (req.method === "POST") {
          if (proj.access !== "admin") return json({ error: "Only admins can set the team connection." }, 403)
          const form = await req.formData()
          const cfg = planeConfigFromForm(form) as PlaneStored
          const tok = String(form.get("token") || "")
          const existing = await getIntegration("project", proj.id)
          cfg.token_enc = tok ? await encryptSecret(tok) : (existing?.config?.token_enc ?? "")
          if (!cfg.token_enc) return json({ error: "Token is required." }, 400)
          await setIntegration("project", proj.id, "plane", cfg)
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
      // admin invites a user — legacy alias for the project-scoped invite on the caller's first project
      if (req.method === "POST" && path === "/api/team/invite") {
        const { email, role } = await req.json()
        const inv = String(email || "").trim().toLowerCase()
        if (!inv.includes("@")) return json({ error: "Enter a valid email." }, 400)
        const proj = await resolveProject(me, null)
        if (!proj) return json({ error: "No project." }, 400)
        if (proj.access !== "admin") return json({ error: "Only admins can invite." }, 403)
        const p = await projectById(proj.id)
        await addProjectMember(proj.id, p!.accountId, inv, role === "admin" ? "admin" : "member", me)
        return json({ ok: true, members: await membersOfProject(proj.id) })
      }

      // ── projects (P2) ──
      // List the caller's projects.
      if (req.method === "GET" && path === "/api/projects") {
        const projects = await listProjects(me)
        const out = []
        for (const p of projects) {
          const access = await projectAccess(me, p.id)
          out.push({ id: p.id, name: p.name, accountId: p.accountId, status: p.status, role: access })
        }
        return json({ projects: out })
      }
      // Create a project (account owner/admin only).
      if (req.method === "POST" && path === "/api/projects") {
        const ms = await membershipsFor(me)
        const active = ms[0]
        if (!active) return json({ error: "No account." }, 400)
        if ((await roleIn(active.workspaceId, me)) !== "admin") return json({ error: "Only owners/admins can create projects." }, 403)
        const body = await req.json().catch(() => ({}))
        const name = String(body.name || "").trim()
        if (!name) return json({ error: "Project name is required." }, 400)
        const created = await createProject(active.workspaceId, name)
        // The creator is an account admin → implicit project-admin via projectAccess; no extra row needed.
        return json({ project: { id: created.id, name: created.name, accountId: created.accountId, status: created.status, role: "admin" } }, 201)
      }
      // Project detail + members (projectAccess-gated) and project-scoped invite (R4) + monitored-urls (P3b).
      const projMatch = path.match(/^\/api\/projects\/([^/]+?)(\/members|\/invite|\/activity|\/rename|\/monitored-urls(?:\/[^/]+)?)?$/)
      if (projMatch) {
        const pid = projMatch[1]
        const sub = projMatch[2] || ""
        const access = await projectAccess(me, pid)
        if (!access) return json({ error: "No access to this project." }, 403)
        const proj = await projectById(pid)
        if (!proj) return json({ error: "Not found." }, 404)

        // Monitored URLs (R5 allowlist) — admin-only manage; project-scoped via projectAccess.
        if (sub.startsWith("/monitored-urls")) {
          if (access !== "admin") return json({ error: "Only project admins can manage monitored URLs." }, 403)
          const midMatch = sub.match(/^\/monitored-urls\/([^/]+)$/)
          if (req.method === "GET" && !midMatch) {
            return json({ monitoredUrls: await listMonitoredUrls(pid) })
          }
          if (req.method === "POST" && !midMatch) {
            const body = await req.json().catch(() => ({}))
            const pattern = String(body.urlPattern || body.url_pattern || "").trim()
            if (!pattern) return json({ error: "urlPattern is required." }, 400)
            if (/[?#]/.test(pattern)) return json({ error: "Patterns are path-only (no query/fragment)." }, 400)
            const enabled = body.enabled === undefined ? true : !!body.enabled
            await addMonitoredUrl(pid, pattern, enabled)
            return json({ ok: true, monitoredUrls: await listMonitoredUrls(pid) }, 201)
          }
          if (req.method === "DELETE" && midMatch) {
            await removeMonitoredUrl(pid, midMatch[1])
            return json({ ok: true, monitoredUrls: await listMonitoredUrls(pid) })
          }
          if (req.method === "POST" && midMatch) {
            const body = await req.json().catch(() => ({}))
            await setMonitoredUrlEnabled(pid, midMatch[1], !!body.enabled)
            return json({ ok: true, monitoredUrls: await listMonitoredUrls(pid) })
          }
          return json({ error: "Not found" }, 404)
        }

        // Named observability (R6) — admin-only Activity view: WHO ran WHICH Sim on WHICH path, with the
        // private screenshot id (viewable via signed GET /api/screenshots/:id). Default focus = review_run
        // rows (live auto-comment runs) per the locked "named" decision; ?type=all widens to every event.
        // observability_mode='aggregate' (future sellability toggle) strips actor_email server-side.
        if (sub === "/activity") {
          if (req.method !== "GET") return json({ error: "Not found" }, 404)
          if (access !== "admin") return json({ error: "Only project admins can view observability." }, 403)
          const typeParam = (url.searchParams.get("type") || "review_run").trim()
          const types = typeParam === "all" ? undefined : [typeParam]
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50))
          const rows = await listActivity(pid, { types, limit })
          const personas = await listPersonas(pid)
          const pById = new Map(personas.map((p) => [p.id, p]))
          const named = proj.observabilityMode !== "aggregate" // founder default 'named'
          const events = rows.map((ev) => {
            const p = ev.simId ? pById.get(ev.simId) : null
            return {
              id: ev.id, type: ev.type,
              actorEmail: named ? ev.actorEmail : null, // (f) aggregate mode strips identity
              simId: ev.simId, simName: p?.name ?? null,
              urlPath: ev.urlPath, urlHost: ev.urlHost,
              screenshotId: ev.screenshotId, meta: ev.meta, createdAt: ev.createdAt,
            }
          })
          return json({ observabilityMode: proj.observabilityMode, named, events })
        }

        if (req.method === "GET" && sub === "") {
          return json({ project: { id: proj.id, name: proj.name, accountId: proj.accountId, status: proj.status, reviewMode: proj.reviewMode, observabilityMode: proj.observabilityMode, reviewBudgetDaily: proj.reviewBudgetDaily }, role: access, members: await membersOfProject(pid) })
        }
        if (req.method === "GET" && sub === "/members") {
          return json({ members: await membersOfProject(pid) })
        }
        if (req.method === "POST" && sub === "/invite") {
          if (access !== "admin") return json({ error: "Only project admins can invite." }, 403)
          const body = await req.json().catch(() => ({}))
          const inv = String(body.email || "").trim().toLowerCase()
          const role = body.role === "admin" ? "admin" : "member"
          if (!inv.includes("@")) return json({ error: "Enter a valid email." }, 400)
          await addProjectMember(pid, proj.accountId, inv, role, me)
          return json({ ok: true, members: await membersOfProject(pid) })
        }
        // Rename a project (name only) — admin-gated. The signup onboarding calls this on the user's
        // auto-created Default Project to set the name they chose, instead of creating a duplicate.
        if (sub === "/rename") {
          if (req.method !== "POST" && req.method !== "PATCH") return json({ error: "Not found" }, 404)
          if (access !== "admin") return json({ error: "Only project admins can rename." }, 403)
          const body = await req.json().catch(() => ({}))
          const name = String(body.name || "").trim()
          if (!name) return json({ error: "Project name is required." }, 400)
          const updated = await renameProject(pid, name)
          return json({ project: { id: updated!.id, name: updated!.name, accountId: updated!.accountId, status: updated!.status, role: access } })
        }
        return json({ error: "Not found" }, 404)
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
          const reactions = data.reactions || []
          // Resolve each reaction's citedTraitIds → {quote, speaker, sourceDate, transcriptId} so the
          // studio review→feedback path can carry citations forward. simId is the persona's stable id.
          const simId = persona?.id ? String(persona.id) : null
          for (const r of reactions) {
            const cited = await resolveCitations(simId, r?.citedTraitIds)
            r.citation = cited.citedTraitIds.length
              ? { citedTraitIds: cited.citedTraitIds, sourceQuote: cited.sourceQuote, speaker: cited.speaker, sourceTranscriptId: cited.sourceTranscriptId, sourceDate: cited.sourceDate }
              : null
          }
          return json({ reactions, usage })
        } catch (e: any) { return json({ error: e?.message || "react failed" }, 500) }
      }
      return json({ error: "Not found" }, 404)
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`\n⚡ Klavity app → ${BASE}`)
console.log(`   model: ${MODEL} · auth: ${db ? "Turso OTP" : "DISABLED (no Turso)"} · dev-otp: ${DEV_SHOW_OTP}\n`)

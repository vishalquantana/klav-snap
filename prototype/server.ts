// Klavity app server (Bun). Marketing on /, demo + dashboard behind email-OTP login.
import { initDb, db, createOtp, verifyOtp, upsertUser, createSession, getSession, deleteSession, ensureAccount, setAccountDomain, membershipsFor, hasAnyMembership, membersOf, roleIn, getIntegration, setIntegration, listPersonas, upsertPersona, deletePersona, insertScreenshot, insertFeedback, insertActivity, updateFeedbackTracker, listActivity, listFeedback, dashboardCounts, projectAccess, listProjects, createProject, renameProject, projectById, membersOfProject, addProjectMember, insertTranscript, listTranscripts, listTraits, listTraitEvents, insertTrait, updateTrait, insertTraitEvent, hasReconcileRun, markReconcileRun, rebuildInsightsJson, ensureTraitsSeeded, listMonitoredUrls, addMonitoredUrl, setMonitoredUrlEnabled, setMonitoredUrlPattern, removeMonitoredUrl, getExtensionTokenEmail, issueExtensionToken, matchMonitored, getConsent, setConsent, getReviewMode, setReviewMode, tryConsumeReviewBudget, reviewGate, reviewDedupeKey, reviewDay, screenshotById, recordAiCall, opsTotals, opsDaily, opsByProject, opsByTypeModel, opsRecentCalls, opsTodaySpend, getModelWeights, setModelWeights, listConnectors, getConnectorById, createConnector, updateConnector, removeConnector, listAutoCopyConnectors, updateFeedbackMeta, feedbackById, addTicketExport, listTicketExports, exportsForFeedbackIds, getRecentlyResolvedTraits, type RecentlyResolvedTrait, transcriptById, sourceTranscriptsForSim, originAllowedForProject } from "./lib/db"
import { getConnector, listConnectorTypes, type TicketPayload } from "./lib/connectors/index"
import { applyReconcileOps, recurrenceFromEvents, type ReconcileOp, type Trait, type TraitEventRow } from "./lib/provenance"
import { sendOtp } from "./lib/mail"
import { token, otp, emailAllowed, cookie, clearCookie, parseCookies, isOpsAdmin } from "./lib/auth"
import { uploadScreenshotMeta, presignGet, type UploadedScreenshot } from "./lib/s3"
import { buildIssueHtml, escapeHtml } from "./lib/feedback"
import { encryptSecret, decryptSecret } from "./lib/crypto"
import { planeConfigFromForm, redactPlane, type PlaneStored } from "./lib/connection"
import { MODEL_CHOICES, MODEL_CHOICE_IDS, DEFAULT_WEIGHTS, pickModel, parseWeightsForm, weightsToPct } from "./lib/models"

const KEY = process.env.OPENROUTER_API_KEY
const MODEL = process.env.KLAV_MODEL || "google/gemini-2.5-flash"
const PORT = Number(process.env.PORT || 4317)
const BASE = process.env.KLAV_BASE_URL || `http://localhost:${PORT}`
const SECURE = BASE.startsWith("https")
const DEV_SHOW_OTP = process.env.KLAV_DEV_SHOW_OTP === "1"
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
const OPS_DAILY_CAP_USD = Number(process.env.OPS_DAILY_CAP_USD || 50)
const SITE = import.meta.dir + "/../site"
const PUB = import.meta.dir + "/public"
const SESSION_DAYS = 7

await initDb()

// Model mix (/opsadmin): in-process cache of the weighted model selection. Seed the qwen3-heavy
// default on first boot ONLY (never clobber weights set later via the UI).
let weightsCache: Record<string, number> = {}
let weightsCacheAt = 0
async function refreshWeightsCache() { weightsCache = await getModelWeights(); weightsCacheAt = Date.now() }
async function getActiveWeights(): Promise<Record<string, number>> {
  if (Date.now() - weightsCacheAt > 30_000) await refreshWeightsCache()
  return weightsCache
}
if (db) {
  if (Object.keys(await getModelWeights()).length === 0) await setModelWeights(DEFAULT_WEIGHTS)
  await refreshWeightsCache()
}

// ── AI (OpenRouter) ──
const EXTRACT_SYS =
  "You are an expert qualitative UX researcher building reusable user personas (\"Sims\") from interview/call transcripts. " +
  "Identify each distinct HUMAN speaker who is a user, customer, or stakeholder. For each produce a persona. " +
  "type is \"client\" for an external customer/user, \"internal\" for someone on the product/company team. " +
  "Each insight is typed pain | want | love and MUST be anchored to a short verbatim quote from the transcript. " +
  "Skip a pure facilitator/interviewer who reveals no preferences of their own. Be faithful to what people actually said.\n\n" +
  "Each insight MUST name the CONCRETE artifact (which button, label, screen, flow, API, etc.) in the text field. " +
  "Set area to a short descriptor of the UI/domain area (e.g. \"checkout-flow\", \"export-modal\", \"onboarding\"). " +
  "Set issueType to EXACTLY ONE of: label-copy | layout | performance | flow | error-handling | accessibility | visual (or null if it genuinely does not fit). " +
  "Set severity to high | medium | low based on the speaker's expressed impact (or null if unclear).\n\n" +
  "Respond with ONLY a JSON object, no prose, in exactly this shape:\n" +
  '{"personas":[{"name":string,"role":string,"type":"client"|"internal","initials":string(2 uppercase letters),' +
  '"accent":string(hex colour like #6366f1),"summary":string,"insights":[{"kind":"pain"|"want"|"love","text":string,"quote":string,' +
  '"area":string|null,"issueType":"label-copy"|"layout"|"performance"|"flow"|"error-handling"|"accessibility"|"visual"|null,"severity":"high"|"medium"|"low"|null}]}]}'

const REACT_SYS =
  "You ARE the given user persona, reviewing a screenshot of a product page as if really using it. " +
  "React in FIRST PERSON, grounded in this persona's documented pains, wants, and loves. " +
  "Give 1-3 reactions, most important first. The box is a normalised 0..1 bounding box locating the element in the image " +
  "(x,y = top-left; w,h = size; all 0..1), or null if you can't localise it. suggestedBug is filled only when it's a real " +
  "problem worth filing to an issue tracker, else null. Stay in character and be specific to what you actually see.\n\n" +
  "The persona's insights each carry a stable \"traitId\". For every reaction, set citedTraitIds to the list of traitIds " +
  "of the persona's documented traits that actually drove that reaction (the pains/wants/loves it stems from). " +
  "Use [] if no documented trait applies. Only ever cite traitIds present in the persona you are given.\n\n" +
  "Some traits in the persona carry a \"recurrenceMemory\" field. When recurrenceMemory.regressed is true, the trait was " +
  "previously resolved (the team addressed it) but has since resurfaced. In that case and ONLY that case, voice " +
  "disappointment and include a line like \"I raised this before (YYYY-MM-DD) and it's happening again (YYYY-MM-DD)\". " +
  "Do NOT voice disappointment or mention recurrence for traits where recurrenceMemory is absent, null, or regressed is false — " +
  "a frequently-reinforced trait that was never resolved does not warrant disappointment.\n\n" +
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
  "traitId) and ONE new transcript. You may also receive a RECENTLY_RESOLVED list of traits that were " +
  "previously contradicted or superseded (resolved). Emit the MINIMAL list of operations that evolves this " +
  "Sim to reflect the new transcript — do NOT restate unchanged traits, and do NOT invent traits the " +
  "transcript does not support. Every op MUST be anchored to a short verbatim quote from the transcript.\n\n" +
  "Operations:\n" +
  "- add: a genuinely NEW pain/want/love not already covered (omit traitId).\n" +
  "- reinforce: the transcript restates/confirms an existing trait (set traitId; text may echo the existing text).\n" +
  "- refine: the transcript sharpens/expands an existing trait's wording (set traitId; text = the improved text).\n" +
  "- contradict: the transcript shows the Sim no longer holds an existing trait (set traitId).\n" +
  "- supersede: an existing trait is REPLACED by a changed preference (set traitId; text = the replacement).\n" +
  "- reopen: a previously-resolved issue (from RECENTLY_RESOLVED) has resurfaced. Set traitId to the id of " +
  "  the resolved trait. This reactivates the SAME trait id — use this INSTEAD of add when the transcript " +
  "  clearly describes the same issue that was previously resolved.\n\n" +
  "For every op, also set: area (short UI/domain area descriptor), " +
  "issueType (EXACTLY ONE of: label-copy|layout|performance|flow|error-handling|accessibility|visual, or null), " +
  "severity (high|medium|low based on expressed impact, or null).\n\n" +
  "Be conservative: only emit an op when the transcript clearly supports it. quote is verbatim from the transcript; " +
  "speaker is who said it; reason is a short why.\n\n" +
  "Respond with ONLY a JSON object, no prose, in exactly this shape:\n" +
  '{"ops":[{"op":"add"|"reinforce"|"refine"|"contradict"|"supersede"|"reopen","kind":"pain"|"want"|"love",' +
  '"text":string,"quote":string,"speaker":string,"traitId":string|null,"reason":string,' +
  '"area":string|null,"issueType":"label-copy"|"layout"|"performance"|"flow"|"error-handling"|"accessibility"|"visual"|null,"severity":"high"|"medium"|"low"|null}]}'

// jsonMode forces structured output — safe for text calls, but Gemini's vision path
// via OpenRouter often returns empty content under json_object, so leave it OFF for
// image calls and rely on the prompt + parseJSON's extraction instead.
async function chat(messages: any[], maxTokens: number, jsonMode = false, ctx?: { type: string; email?: string | null; projectId?: string | null }) {
  const t0 = Date.now()
  const label = ctx?.type || "chat"
  const model = pickModel(await getActiveWeights(), MODEL_CHOICE_IDS, MODEL, Math.random())
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 90_000)  // never hang a request forever
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json", "HTTP-Referer": BASE, "X-Title": "Klavity" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages, usage: { include: true }, ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }),
      signal: ctl.signal,
    })
  } catch (e: any) {
    clearTimeout(timer)
    const ms = Date.now() - t0
    if (e?.name === "AbortError") { console.error(`AI[${label}] TIMEOUT after ${ms}ms`); throw new Error("The model took too long (>90s). Please try again.") }
    console.error(`AI[${label}] network error after ${ms}ms:`, e?.message || e); throw e
  }
  clearTimeout(timer)
  if (!res.ok) { const body = (await res.text()).slice(0, 300); console.error(`AI[${label}] OpenRouter ${res.status} after ${Date.now() - t0}ms: ${body}`); throw new Error(`OpenRouter ${res.status}: ${body}`) }
  const data: any = await res.json()
  const content: string = data?.choices?.[0]?.message?.content ?? ""
  const u = data?.usage || {}
  console.log(`AI[${label}] ok in ${Date.now() - t0}ms · ${u.prompt_tokens ?? "?"}/${u.completion_tokens ?? "?"} tok · $${u.cost ?? "?"}`)
  // Best-effort credit ledger — FIRE-AND-FORGET so a slow/stuck insert can never hang the response.
  if (ctx) {
    void recordAiCall({
      type: ctx.type, model, actorEmail: ctx.email ?? null, projectId: ctx.projectId ?? null,
      inputTokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
      outputTokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
      costUsd: typeof u.cost === "number" ? u.cost : null,
    }).catch((e: any) => console.error("recordAiCall failed:", e?.message || e))
  }
  return { content, usage: { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens } }
}
function parseJSON(s: string) {
  // Strip thinking-model traces (<think>…</think>) and ALL markdown code fences (models put
  // them anywhere, not just line-anchored). Greedy {…} extraction breaks on thinking traces, so
  // tags go first.
  const tag = "think"
  const open = new RegExp("<" + tag + "[^>]*>[\\s\\S]*?<\\/" + tag + ">", "gi")
  const cleaned = s
    .replace(open, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim()
  const tryParse = (str: string): { ok: true; val: any } | { ok: false } => {
    try { return { ok: true, val: JSON.parse(str) } } catch { return { ok: false } }
  }
  // 1) straight parse.
  let r = tryParse(cleaned); if (r.ok) return r.val
  // 2) extract the outermost JSON object OR array (some prompts return a top-level array).
  const obj = cleaned.match(/\{[\s\S]*\}/)
  const arr = cleaned.match(/\[[\s\S]*\]/)
  const candidate = obj && (!arr || obj.index! <= arr.index!) ? obj[0] : (arr ? arr[0] : cleaned)
  r = tryParse(candidate); if (r.ok) return r.val
  // 3) repair the common LLM JSON glitches that throw "Property name must be a string literal":
  //    smart quotes, trailing commas before } or ], AND unquoted bare property names
  //    (e.g. {reactions:[...]}). Then retry.
  const repaired = candidate
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
  r = tryParse(repaired); if (r.ok) return r.val
  console.error("parseJSON: unrecoverable model output:", JSON.stringify(s.slice(0, 500)))
  throw new Error("Model did not return valid JSON")
}
// Closed enum for issueType — same set used in EXTRACT_SYS and RECONCILE_SYS.
const ISSUE_TYPE_ENUM = new Set(["label-copy", "layout", "performance", "flow", "error-handling", "accessibility", "visual"])
const SEVERITY_ENUM = new Set(["high", "medium", "low"])

// Sanitize the new typed fields (area, issueType, severity) on an extracted/reconciled insight or op.
// Returns null for any field that is absent, not a string, or outside the closed enum.
function sanitizeTypedFields(o: any): { area: string | null; issueType: string | null; severity: string | null } {
  const area = o.area != null && typeof o.area === "string" && o.area.trim() ? o.area.trim() : null
  const issueType = o.issueType != null && ISSUE_TYPE_ENUM.has(String(o.issueType)) ? String(o.issueType) : null
  const severity = o.severity != null && SEVERITY_ENUM.has(String(o.severity)) ? String(o.severity) : null
  return { area, issueType, severity }
}

async function extractPersonas(transcript: string, ctx?: { email?: string | null; projectId?: string | null }) {
  const { content, usage } = await chat([{ role: "system", content: EXTRACT_SYS }, { role: "user", content: "TRANSCRIPT:\n\n" + transcript }], 4000, false, { type: "extract", ...ctx })
  const data = parseJSON(content)
  // Sanitize the new typed fields on each insight in every extracted persona.
  if (Array.isArray(data?.personas)) {
    for (const p of data.personas) {
      if (Array.isArray(p?.insights)) {
        p.insights = p.insights.map((ins: any) => ({ ...ins, ...sanitizeTypedFields(ins) }))
      }
    }
  }
  return { data, usage }
}
async function reactToPage(persona: any, imageB64: string, mediaType: string, pageUrl: string, ctx?: { email?: string | null; projectId?: string | null }) {
  const { content, usage } = await chat([
    { role: "system", content: REACT_SYS },
    { role: "user", content: [
      { type: "text", text: "You are this persona:\n" + JSON.stringify(persona, null, 2) + `\n\nReact to this screenshot of ${pageUrl || "(unknown URL)"}.` },
      { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageB64}` } },
    ] },
  ], 2500, false, { type: "react", ...ctx })
  return { data: parseJSON(content), usage }
}

// ── P3a reconcile: one LLM call that evolves ONE Sim against ONE transcript (§5 cost guard). ──
// currentTraits is the Sim's ACTIVE sim_traits; recentlyResolved feeds RECONCILE_SYS the recently
// contradicted/superseded traits so it can emit a `reopen` targeting the same trait id when the
// issue resurfaces. The route MUST gate this on hasReconcileRun() so we never re-reconcile a
// (sim,transcript) pair nor touch the whole library.
async function reconcileSim(
  currentTraits: Trait[],
  transcript: string,
  opts?: { email?: string | null; projectId?: string | null; recentlyResolved?: RecentlyResolvedTrait[] },
) {
  const traitsForLLM = currentTraits.map((t) => ({ traitId: t.id, kind: t.kind, text: t.text, strength: t.strength }))
  const recentlyResolved = opts?.recentlyResolved ?? []
  const resolvedForLLM = recentlyResolved.map((t) => ({ traitId: t.id, kind: t.kind, text: t.text, status: t.status }))
  const userMsg =
    "CURRENT TRAITS (JSON):\n" + JSON.stringify(traitsForLLM, null, 2) +
    (resolvedForLLM.length
      ? "\n\nRECENTLY_RESOLVED (contradicted/superseded — emit 'reopen' targeting these traitIds if the issue resurfaces):\n" +
        JSON.stringify(resolvedForLLM, null, 2)
      : "") +
    "\n\nNEW TRANSCRIPT:\n\n" + transcript
  const { content, usage } = await chat([
    { role: "system", content: RECONCILE_SYS },
    { role: "user", content: userMsg },
  ], 3000, false, { type: "reconcile", email: opts?.email, projectId: opts?.projectId })
  const data = parseJSON(content)
  const rawOps: any[] = Array.isArray(data?.ops) ? data.ops : []
  const valid = new Set(["add", "reinforce", "refine", "contradict", "supersede", "reopen"])
  const kinds = new Set(["pain", "want", "love"])
  // Sanitize: drop malformed ops, normalize traitId (null → undefined so applyReconcileOps treats add correctly).
  // reopen MUST have a traitId (targeting a resolved trait); drop it if absent.
  const ops: ReconcileOp[] = rawOps
    .filter((o) => {
      if (!o || !valid.has(o.op) || !kinds.has(o.kind)) return false
      if (typeof o.text !== "string" || !o.text.trim()) return false
      if (typeof o.quote !== "string" || !o.quote.trim()) return false
      if (o.op === "reopen" && (o.traitId == null || !String(o.traitId).trim())) return false
      return true
    })
    .map((o) => {
      const typed = sanitizeTypedFields(o)
      return {
        op: o.op, kind: o.kind, text: String(o.text), quote: String(o.quote),
        speaker: o.speaker != null ? String(o.speaker) : null,
        traitId: o.op === "add" || o.traitId == null ? undefined : String(o.traitId),
        reason: o.reason != null ? String(o.reason) : undefined,
        ...typed,
      }
    })
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
// Also computes per-trait recurrence (from trait_events) and surfaces the STRONGEST regression across all
// matched traits (strongest = regressed=true, else pick by timesRaised).
async function resolveCitations(simId: string | null, citedTraitIds: any): Promise<{
  citedTraitIds: string[]; sourceQuote: string | null; speaker: string | null; sourceTranscriptId: string | null; sourceDate: number | null;
  recurrence: { timesRaised: number; regressed: boolean; firstRaised: number | null; lastRaised: number | null; priorResolvedAt: number | null } | null
}> {
  const empty = { citedTraitIds: [] as string[], sourceQuote: null, speaker: null, sourceTranscriptId: null, sourceDate: null, recurrence: null }
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
  // Compute recurrence for EACH cited trait, then surface the strongest regression.
  // Fetch all events for this sim once, then filter per trait in memory.
  let strongestRecurrence: { timesRaised: number; regressed: boolean; firstRaised: number | null; lastRaised: number | null; priorResolvedAt: number | null } | null = null
  try {
    const allEvents: TraitEventRow[] = await listTraitEvents(simId)
    const eventsByTrait = new Map<string, TraitEventRow[]>()
    for (const e of allEvents) {
      const arr = eventsByTrait.get(e.traitId) ?? []
      arr.push(e)
      eventsByTrait.set(e.traitId, arr)
    }
    for (const t of matched) {
      const evts = eventsByTrait.get(t.id) ?? []
      const rec = recurrenceFromEvents(evts)
      if (!strongestRecurrence) {
        strongestRecurrence = rec
      } else {
        // Prefer regressed traits; among ties prefer higher timesRaised.
        const stronger = (rec.regressed && !strongestRecurrence.regressed) ||
          (rec.regressed === strongestRecurrence.regressed && rec.timesRaised > strongestRecurrence.timesRaised)
        if (stronger) strongestRecurrence = rec
      }
    }
  } catch {
    // Non-fatal: if DB is absent (test/no-db mode), skip recurrence.
  }
  return {
    citedTraitIds: matched.map((t) => t.id),
    sourceQuote: primary.srcQuote || null,
    speaker: primary.srcSpeaker || null,
    sourceTranscriptId: primary.srcTranscriptId || null,
    sourceDate,
    recurrence: strongestRecurrence,
  }
}

// One-line human citation for the Plane issue body: "Cited from Sarah's profile: "…" (Sarah, 2026-06-12)".
// When recurrence.regressed is true, appends a "Raised before YYYY-MM-DD → recurred YYYY-MM-DD" line.
function citationLine(c: {
  sourceQuote: string | null; speaker?: string | null; sourceDate: number | null;
  recurrence?: { regressed: boolean; firstRaised: number | null; lastRaised: number | null; priorResolvedAt: number | null } | null
}): string | null {
  if (!c.sourceQuote) return null
  const date = c.sourceDate ? new Date(c.sourceDate).toISOString().slice(0, 10) : null
  const who = c.speaker || null
  const attr = who && date ? ` (${who}, ${date})` : who ? ` (${who})` : date ? ` (${date})` : ""
  let line = `Cited from Sim profile: "${c.sourceQuote}"${attr}`
  // Append regression annotation only when regressed (not on mere recurrence).
  // X = firstRaised (when the issue was originally raised), Y = lastRaised (when it recurred).
  if (c.recurrence?.regressed && c.recurrence.firstRaised && c.recurrence.lastRaised) {
    const raisedDate = new Date(c.recurrence.firstRaised).toISOString().slice(0, 10)
    const againDate = new Date(c.recurrence.lastRaised).toISOString().slice(0, 10)
    line += ` | Raised before ${raisedDate} → again ${againDate}`
  }
  return line
}

// ── http helpers ──
const WIDGET_CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "600",
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}
// Widget-scoped json: always attaches WIDGET_CORS so every response (success AND error) is
// readable cross-origin. Used for /api/personas, /api/sim/review, /api/consent only.
function wjson(body: unknown, status = 200) { return json(body, status, WIDGET_CORS) }
function file(path: string) { return new Response(Bun.file(path)) }
function redirect(loc: string, headers: Record<string, string> = {}) { return new Response(null, { status: 302, headers: { Location: loc, ...headers } }) }
function fmtUsd(n: number): string { return "$" + (Number(n) || 0).toFixed(4) }
function renderOpsAdmin(d: {
  totals: { totalCost: number; totalInputTokens: number; totalOutputTokens: number; callCount: number }
  daily: { day: string; cost: number; calls: number }[]
  byProject: { projectId: string | null; projectName: string | null; cost: number; calls: number }[]
  byTypeModel: { type: string; model: string; cost: number; calls: number }[]
  recent: { id: string; createdAt: number; type: string; model: string; actorEmail: string | null; projectId: string | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; ok: boolean }[]
  today: number; cap: number; offset: number
  modelMix: { choices: { id: string; label: string; price: string; weight: number; pct: number }[] }
}): string {
  const maxDaily = Math.max(0.0001, ...d.daily.map(x => x.cost))
  const bars = d.daily.slice().reverse().map(x => {
    const h = Math.round((x.cost / maxDaily) * 100)
    return `<div class="bar" title="${escapeHtml(x.day)} · ${fmtUsd(x.cost)} · ${x.calls} calls"><i style="height:${h}%"></i><small>${escapeHtml(x.day.slice(5))}</small></div>`
  }).join("")
  const projRows = d.byProject.map(p =>
    `<tr><td>${escapeHtml(p.projectName || p.projectId || "—")}</td><td class="r">${fmtUsd(p.cost)}</td><td class="r">${p.calls}</td></tr>`).join("") || `<tr><td colspan="3">No data</td></tr>`
  const tmRows = d.byTypeModel.map(t =>
    `<tr><td>${escapeHtml(t.type)}</td><td>${escapeHtml(t.model)}</td><td class="r">${fmtUsd(t.cost)}</td><td class="r">${t.calls}</td></tr>`).join("") || `<tr><td colspan="4">No data</td></tr>`
  const recRows = d.recent.map(c => {
    const when = new Date(c.createdAt).toISOString().replace("T", " ").slice(0, 19)
    return `<tr><td>${escapeHtml(when)}</td><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.actorEmail || "—")}</td><td>${escapeHtml(c.projectId || "—")}</td><td class="r">${c.inputTokens ?? "—"}/${c.outputTokens ?? "—"}</td><td class="r">${c.costUsd != null ? fmtUsd(c.costUsd) : "—"}</td></tr>`
  }).join("") || `<tr><td colspan="6">No calls yet</td></tr>`
  const prev = d.offset > 0 ? `<a href="/opsadmin?offset=${Math.max(0, d.offset - 50)}">← newer</a>` : ""
  const next = d.recent.length === 50 ? `<a href="/opsadmin?offset=${d.offset + 50}">older →</a>` : ""
  const todayPct = Math.min(100, Math.round((d.today / Math.max(0.0001, d.cap)) * 100))
  return `<!doctype html><html><head><meta charset="utf-8"><title>Klavity Ops — AI credits</title>
<style>
  :root{--bg:#0b0c10;--card:#15171e;--ink:#e8eaf0;--mut:#9aa3b2;--line:#262a35;--accent:#6366f1}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
  .wrap{max-width:1040px;margin:0 auto;padding:32px 20px}
  h1{font-size:20px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 24px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
  .card b{display:block;font-size:22px}.card span{color:var(--mut);font-size:12px}
  .panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:20px}
  .panel h2{font-size:14px;margin:0 0 12px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
  th{color:var(--mut);font-weight:600}.r{text-align:right;font-variant-numeric:tabular-nums}
  .chart{display:flex;align-items:flex-end;gap:4px;height:140px}
  .bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
  .bar i{display:block;width:70%;background:var(--accent);border-radius:3px 3px 0 0;min-height:2px}
  .bar small{color:var(--mut);font-size:9px;margin-top:4px;transform:rotate(-45deg);white-space:nowrap}
  .meter{height:8px;background:var(--line);border-radius:4px;overflow:hidden;margin-top:8px}
  .meter i{display:block;height:100%;background:var(--accent)}
  .pager{margin-top:10px;display:flex;gap:16px}.pager a{color:var(--accent);text-decoration:none}
  input[type=number]{background:#0b0c10;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 6px;width:80px;text-align:right}
  button{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer}
</style></head><body><div class="wrap">
  <h1>AI credits — Ops</h1><p class="sub">Every OpenRouter call, with real credit cost. Private to ops admins.</p>
  <div class="cards">
    <div class="card"><b>${fmtUsd(d.totals.totalCost)}</b><span>Total spend</span></div>
    <div class="card"><b>${d.totals.callCount}</b><span>Total calls</span></div>
    <div class="card"><b>${d.totals.totalInputTokens.toLocaleString()}</b><span>Input tokens</span></div>
    <div class="card"><b>${d.totals.totalOutputTokens.toLocaleString()}</b><span>Output tokens</span></div>
  </div>
  <div class="panel"><h2>Model mix</h2>
    <p class="sub" style="margin:-4px 0 12px">Relative weights — each AI call picks a model at random by weight. Set 0 to disable. Saved live (no redeploy).</p>
    <form method="POST" action="/opsadmin/model-mix">
      <table><thead><tr><th>Model</th><th>Price in/out /Mtok</th><th class="r">Weight</th><th class="r">Share</th></tr></thead><tbody>
      ${d.modelMix.choices.map(c => `<tr><td>${escapeHtml(c.label)}<br><small class="sub">${escapeHtml(c.id)}</small></td><td class="sub">${escapeHtml(c.price)}</td><td class="r"><input type="number" name="${escapeHtml(c.id)}" value="${c.weight}" min="0" step="1"></td><td class="r">${c.pct}%</td></tr>`).join("")}
      </tbody></table>
      <div style="margin-top:12px"><button type="submit">Save mix</button></div>
    </form>
  </div>
  <div class="panel"><h2>Today vs daily cap</h2>
    <div>${fmtUsd(d.today)} <span style="color:var(--mut)">/ ${fmtUsd(d.cap)} (${todayPct}%)</span></div>
    <div class="meter"><i style="width:${todayPct}%"></i></div>
    <p class="sub" style="margin:8px 0 0">Display only — the hard cap is enforced by OpenRouter on the API key.</p>
  </div>
  <div class="panel"><h2>Daily spend (30d)</h2><div class="chart">${bars || '<span class="sub">No data</span>'}</div></div>
  <div class="panel"><h2>By project</h2><table><thead><tr><th>Project</th><th class="r">Cost</th><th class="r">Calls</th></tr></thead><tbody>${projRows}</tbody></table></div>
  <div class="panel"><h2>By type &amp; model</h2><table><thead><tr><th>Type</th><th>Model</th><th class="r">Cost</th><th class="r">Calls</th></tr></thead><tbody>${tmRows}</tbody></table></div>
  <div class="panel"><h2>Recent calls</h2><table><thead><tr><th>When (UTC)</th><th>Type</th><th>Actor</th><th>Project</th><th class="r">In/Out tok</th><th class="r">Cost</th></tr></thead><tbody>${recRows}</tbody></table>
    <div class="pager">${prev}${next}</div>
  </div>
</div></body></html>`
}
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

// Build a normalized TicketPayload from a feedback row for the connector adapters.
function feedbackToTicketPayload(fb: any, project: { id: string; name?: string }, simName: string | null = null): TicketPayload {
  const title = fb.observation || "Sim report"
  const lines: string[] = []
  if (fb.observation) lines.push(fb.observation)
  if (simName) lines.push(`Sim: ${simName}`)
  else if (fb.simId) lines.push(`Sim: ${fb.simId}`)
  const urlVal = fb.pageUrl ?? fb.urlPath ?? null
  if (urlVal) lines.push(`URL: ${urlVal}`)
  lines.push("Filed by Klavity Sims")
  const body = lines.join("\n\n")
  return {
    title,
    body,
    severity: fb.severity ?? null,
    url: urlVal,
    simName,
    createdAt: fb.createdAt,
    klavityUrl: `${BASE}/dashboard?project=${project.id}`,
  }
}

// Resolve a Sim's display name from its id (best-effort; null if unknown). Used to enrich
// both the manual export and the auto-copy payloads so external tickets show "Sim: <name>".
async function resolveSimName(projectId: string, simId: string | null | undefined): Promise<string | null> {
  if (!simId) return null
  try { return (await listPersonas(projectId)).find((p) => p.id === simId)?.name ?? null } catch { return null }
}

// Redact secret fields in a connector config for client responses.
// For each connector field marked secret, replaces value with "" and adds has<Key>=true.
function redactConnectorConfig(type: string, config: Record<string, string>): Record<string, any> {
  const connector = getConnector(type)
  if (!connector) return config
  const out: Record<string, any> = { ...config }
  for (const f of connector.fields) {
    if (f.secret) {
      const hasKey = "has" + f.key.charAt(0).toUpperCase() + f.key.slice(1)
      out[hasKey] = !!(config[f.key])
      out[f.key] = ""
    }
  }
  return out
}

// Format a connector row for a client response (always redacted).
function connectorToClient(c: any): Record<string, any> {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    autoCopy: c.autoCopy,
    enabled: c.enabled,
    config: redactConnectorConfig(c.type, c.config),
    createdAt: c.createdAt,
  }
}

Bun.serve({
  port: PORT,
  idleTimeout: 180,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // ── CORS preflight for cross-origin widget calls ──
    if (req.method === "OPTIONS" && path.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: WIDGET_CORS })
    }

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
    if (req.method === "GET" && path === "/sim-studio-a") return file(PUB + "/sim-studio-a-triptych.html")
    if (req.method === "GET" && path === "/sim-studio-b") return file(PUB + "/sim-studio-b-mailbox.html")
    if (req.method === "GET" && path === "/sim-studio-c") return file(PUB + "/sim-studio-c-evidence.html")
    if (req.method === "GET" && path === "/sim-studio-hybrid") return file(PUB + "/sim-studio-hybrid.html")
    if (req.method === "GET" && path === "/snap-popup") return file(PUB + "/snap-popup.html")
    if (req.method === "GET" && path === "/widget-connect") {
      return new Response(Bun.file(PUB + "/widget-connect.html"), {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }
    if (req.method === "GET" && path === "/intro-reel") return file(SITE + "/intro-reel.html")
    if (req.method === "GET" && path === "/privacy") return file(SITE + "/privacy.html")
    if (req.method === "GET" && path === "/klavity-sim.js") return file(PUB + "/klavity-sim.js")

    // ── embeddable widget bundle ──
    if (req.method === "GET" && path === "/widget.js") {
      return new Response(Bun.file("../packages/sdk/dist/klavity-widget.iife.js"), {
        headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" },
      })
    }

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
        // First-run funnel: capture whether this is a brand-new account BEFORE ensureAccount bootstraps
        // a default membership (which it always does on first login). A genuinely new user starts in the
        // signup wizard, not a cold empty dashboard; returning users go straight to the dashboard.
        const wasNew = (await membershipsFor(e)).length === 0
        await ensureAccount(e)
        const sid = token()
        await createSession(sid, e, Date.now() + SESSION_DAYS * 86400 * 1000)
        const dest = wasNew ? "/onboarding" : "/dashboard"
        return json({ ok: true, redirect: dest, token: sid }, 200, { "Set-Cookie": cookie("klav_session", sid, SESSION_DAYS * 86400, SECURE) })
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
            // Guard: if the project already has a migrated auto-copy Plane connector, the
            // fire-and-forget hook (below) will handle the Plane push. Loading creds here
            // would cause double-filing — one from the legacy inline push, one from the hook.
            const hasPlaneConnector = proj
              ? (await listAutoCopyConnectors(proj.id)).some(c => c.type === "plane")
              : false
            if (!hasPlaneConnector) {
              planeToken = await decryptSecret(stored.config.token_enc)
              planeWorkspace = stored.config.workspace; planeProject = stored.config.projectId
              planeHost = (stored.config.host || "https://api.plane.so").replace(/\/+$/, "")
            }
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
                planeIssueKey: null, planeIssueUrl: null,
              })
              await insertActivity({
                projectId, type: "feedback_filed", actorEmail: actor, simId,
                urlHost, urlPath, feedbackId, screenshotId,
              })

              // ── auto-copy hook: fire-and-forget, never blocks the response ──
              // For each enabled auto-copy connector in this project, push the ticket.
              // Mirrors the recordAiCall fire-and-forget pattern.
              if (feedbackId) {
                const autoCopyFbId = feedbackId
                const autoCopyProjectId = projectId
                const autoCopyObservation = observation
                const autoCopyActor = actor
                void (async () => {
                  try {
                    const autoCopyConnectors = await listAutoCopyConnectors(autoCopyProjectId)
                    if (!autoCopyConnectors.length) return
                    // Build the SAME rich payload the manual export uses (incl. resolved Sim name),
                    // once, from the persisted row — so auto-copied and manually-copied tickets match.
                    const autoCopyFb = await feedbackById(autoCopyProjectId, autoCopyFbId)
                    if (!autoCopyFb) return
                    const autoCopySimName = await resolveSimName(autoCopyProjectId, autoCopyFb.simId)
                    const ticketPayload = feedbackToTicketPayload(autoCopyFb, { id: autoCopyProjectId }, autoCopySimName)
                    for (const c of autoCopyConnectors) {
                      const adapter = getConnector(c.type)
                      if (!adapter) continue
                      // Decrypt secret fields
                      const cfg: Record<string, string> = { ...c.config }
                      for (const f of adapter.fields) {
                        if (f.secret && c.config[f.key]) {
                          try { cfg[f.key] = await decryptSecret(c.config[f.key]) } catch { cfg[f.key] = "" }
                        }
                      }
                      try {
                        const result = await adapter.createIssue(ticketPayload, cfg)
                        await addTicketExport({
                          feedbackId: autoCopyFbId, projectId: autoCopyProjectId, connectorId: c.id,
                          type: c.type, externalKey: result.externalKey, externalUrl: result.externalUrl,
                          status: "ok", error: null, createdBy: autoCopyActor,
                        })
                      } catch (e: any) {
                        await addTicketExport({
                          feedbackId: autoCopyFbId, projectId: autoCopyProjectId, connectorId: c.id,
                          type: c.type, externalKey: null, externalUrl: null,
                          status: "failed", error: e?.message || "auto-copy failed", createdBy: autoCopyActor,
                        })
                      }
                    }
                  } catch (err: any) {
                    console.error("auto-copy hook (non-fatal):", err?.message || err)
                  }
                })().catch((err: any) => console.error("auto-copy hook outer (non-fatal):", err?.message || err))
              }
            }
          } catch (persistErr: any) {
            console.error("feedback persistence (non-fatal):", persistErr?.message || persistErr)
          }
        }

        // Always return success. The connector auto-copy hook is fire-and-forget above.
        // Legacy direct-Plane mode: if the caller provided Plane creds directly (no session),
        // still attempt the Plane push for backward-compat with the extension's direct mode.
        if (!planeConnected) {
          return json({ id: feedbackId ?? "", saved: true })
        }

        // R8: append the Sim citation line to the issue body when this feedback cites a trait.
        const citeLine = citation ? citationLine({ sourceQuote: citation.sourceQuote, speaker: citation.speaker, sourceDate: citation.sourceDate, recurrence: citation.recurrence }) : null
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
      if (!me2) return wjson({ error: "Sign in to continue." }, 401)
      const proj2 = await resolveProject(me2, url.searchParams.get("project"))
      if (!proj2) return wjson({ error: "No project." }, 400)
      const wid = proj2.id

      if (req.method === "GET" && path === "/api/personas") {
        const personas = await listPersonas(wid)
        return wjson({ personas })
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
          return wjson({ persona: saved }, 201)
        } catch (e: any) { return wjson({ error: e.message }, 500) }
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
            return wjson({ ok: true })
          } catch (e: any) { return wjson({ error: e.message }, 500) }
        }
        if (req.method === "DELETE") {
          await deletePersona(pid, wid)
          return wjson({ ok: true })
        }
      }
      return wjson({ error: "Not found" }, 404)
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
      if (!meC) return wjson({ error: "Sign in to continue." }, 401)
      const body = await req.json().catch(() => ({}))
      const projC = await resolveProject(meC, String(body.projectId || "") || url.searchParams.get("project"))
      if (!projC) return wjson({ error: "No project." }, 400)
      const status = String(body.status || "").trim()
      if (!["granted", "paused", "revoked"].includes(status)) return wjson({ error: "status must be granted|paused|revoked." }, 400)
      await setConsent(projC.id, meC, status as "granted" | "paused" | "revoked")
      const cur = await getConsent(projC.id, meC)
      return wjson({ ok: true, projectId: projC.id, consent: cur?.status ?? status })
    }

    // ── widget token — mints a per-user extension token for the embeddable widget. Session-cookie gated
    // (first-party popup only). Validates project access and that the request origin is on the allowlist.
    if (req.method === "POST" && path === "/api/widget/token") {
      const meW = await sessionEmail(req)            // first-party popup → cookie only
      if (!meW) return json({ error: "Sign in to continue." }, 401)
      const body = await req.json().catch(() => ({}))
      const projW = await resolveProject(meW, String(body.projectId || ""))
      if (!projW) return json({ error: "No access to this project." }, 403)
      const origin = String(body.origin || "")
      if (!(await originAllowedForProject(projW.id, origin))) {
        return json({ error: "This origin is not on the project's watch list." }, 403)
      }
      const widgetToken = await issueExtensionToken(meW, projW.id, SESSION_DAYS * 24 * 60 * 60 * 1000)
      return json({ token: widgetToken })
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
        const adhoc = body.adhoc === true

        // (a) AUTH + project access. Resolve project by matchMonitored(url) when projectId is absent — but
        //     only across projects the caller can access (no cross-project leakage / off-account capture).
        if (!meR) return wjson({ ok: false, reason: "unauthorized", error: "Sign in to continue." }, 401)
        let projectId: string | null = null
        const requestedProject = String(body.projectId || "") || url.searchParams.get("project")
        // Adhoc reviews must always supply a projectId — auto-resolution via allowlist is passive-only.
        if (adhoc && !requestedProject) return wjson({ ok: false, reason: "unauthorized", error: "Pick a project to analyze this page." }, 401)
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
        if (!projectId) return wjson({ ok: false, reason: "unauthorized", error: "No accessible project for this URL." }, 401)

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
        const pre = reviewGate({ authed: true, reviewMode, consentStatus, allowlistMatch: !!allowlist, alreadyReviewed: allSeen, budgetConsumed: true, adhoc })
        if (!pre.ok) { console.log(`[review] blocked reason=${pre.reason} path=${urlPath || "/"} sims=${targetSims.length}`); return wjson({ ok: false, reason: pre.reason, error: pre.message, projectId }, pre.status) }

        // No sims to review (all gates a–e passed) → return success without consuming a budget slot.
        if (targetSims.length === 0) return wjson({ ok: true, projectId, reviews: [] }, 200)

        // All of a–e passed → atomically consume one budget slot (f).
        const proj = await projectById(projectId)
        const budget = proj?.reviewBudgetDaily ?? 0
        const day = reviewDay()
        const budgetConsumed = await tryConsumeReviewBudget(projectId, day, budget ?? 0)
        const gate = reviewGate({ authed: true, reviewMode, consentStatus, allowlistMatch: !!allowlist, alreadyReviewed: allSeen, budgetConsumed, adhoc })
        if (!gate.ok) {
          if (gate.reason === "budgetExhausted") {
            // auto-pause the project + notify the admin (§5 cost guard).
            await setReviewMode(projectId, "paused")
            await insertActivity({ projectId, type: "admin_notify", actorEmail: meR, urlHost, urlPath, meta: { reason: "budget_exhausted", day, budget } })
          }
          console.log(`[review] blocked reason=${gate.reason} path=${urlPath || "/"}`)
          return wjson({ ok: false, reason: gate.reason, error: gate.message, projectId }, gate.status)
        }

        // ── ALL GATES PASSED. Only now do we capture + review. ──
        console.log(`[review] running sims=${targetSims.length} path=${urlPath || "/"}`)
        if (!screenshotDataUrl) return wjson({ ok: false, reason: "noScreenshot", error: "screenshotDataUrl is required." }, 400)
        const decoded = decodeDataUrl(screenshotDataUrl)
        if (!decoded) return wjson({ ok: false, reason: "badScreenshot", error: "screenshotDataUrl could not be decoded." }, 400)

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

          // Build regression-gated recurrence memory for this Sim's traits. Fetch all events ONCE,
          // group by traitId in memory, then compute recurrenceFromEvents per trait. Only attach a
          // memory block when regressed=true — a trait reinforced many times but never resolved must
          // NOT carry disappointment voice.
          let simWithMemory: any = sim
          try {
            const allSimEvents: TraitEventRow[] = await listTraitEvents(sim.id)
            const eventsByTrait = new Map<string, TraitEventRow[]>()
            for (const e of allSimEvents) {
              const arr = eventsByTrait.get(e.traitId) ?? []
              arr.push(e)
              eventsByTrait.set(e.traitId, arr)
            }
            // Attach recurrenceMemory only to traits where regressed=true.
            const insights = Array.isArray(sim.insights) ? sim.insights : []
            const insightsWithMemory = insights.map((ins: any) => {
              const traitId = ins.traitId
              if (!traitId) return ins
              const evts = eventsByTrait.get(traitId) ?? []
              const rec = recurrenceFromEvents(evts)
              if (!rec.regressed) return ins // no disappointment for mere recurrence
              return {
                ...ins,
                recurrenceMemory: {
                  regressed: true,
                  firstRaised: rec.firstRaised,
                  lastRaised: rec.lastRaised,
                  priorResolvedAt: rec.priorResolvedAt,
                  timesRaised: rec.timesRaised,
                },
              }
            })
            simWithMemory = { ...sim, insights: insightsWithMemory }
          } catch {
            // Non-fatal: if DB is unavailable, fall back to plain sim.
          }

          let reactions: any[] = []
          try {
            const { data } = await reactToPage(simWithMemory, imageB64, decoded.contentType, urlPath || pageUrl)
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
              ? { citedTraitIds: citation.citedTraitIds, sourceQuote: citation.sourceQuote, speaker: citation.speaker, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate, recurrence: citation.recurrence }
              : null
            r.feedbackId = feedbackId
          }
          // activity: a review ran (actor + sim + path + screenshot) — the R6 observability spine.
          await insertActivity({ projectId, type: "review_run", actorEmail: meR, simId: sim.id, urlHost, urlPath, screenshotId, meta: { reactions: reactions.length } })
          markReviewSeen(seenKeys[i])
          out.push({ simId: sim.id, simName: sim.name, initials: sim.initials, accent: sim.accent, reactions })
        }

        console.log(`[review] done path=${urlPath || "/"} sims_reviewed=${out.length} reactions=${out.reduce((n: number, r: any) => n + (r.reactions?.length || 0), 0)}`)
        return wjson({ ok: true, projectId, screenshotId, reviews: out })
      } catch (e: any) {
        return wjson({ ok: false, reason: "error", error: e?.message || "review failed" }, 500)
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
        const { data: extractData, usage: extractUsage } = await extractPersonas(text, { email: meT, projectId })
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
          // Feed the recently-resolved traits to RECONCILE_SYS so it can emit `reopen` targeting
          // the same trait id when a previously-resolved issue resurfaces.
          const recentlyResolved = await getRecentlyResolvedTraits(simId)
          const { ops, usage } = await reconcileSim(current, text, { email: meT, projectId, recentlyResolved })
          reconcileUsages.push(usage)
          // Ensure reopen target traits are included in the set passed to applyReconcileOps so they
          // can be reactivated. They are not in `current` (activeOnly) so we load them separately.
          const reopenIds = new Set(ops.filter((o) => o.op === "reopen" && o.traitId).map((o) => o.traitId!))
          let traitsForApply = current
          if (reopenIds.size > 0) {
            const allTraits = await listTraits(simId) // all statuses
            const resolvedTargets = allTraits.filter((t) => reopenIds.has(t.id) && t.status !== "active")
            traitsForApply = [...current, ...resolvedTargets]
          }
          const res = applyReconcileOps(traitsForApply, ops, { simId, projectId, transcriptId, sourceDate })
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

          // Compute per-trait recurrence so we can annotate each event with a regression marker.
          // Group events by traitId (already ASC), then re-scan to detect post-resolution raises.
          const eventsByTrait = new Map<string, TraitEventRow[]>()
          for (const e of events) {
            const arr = eventsByTrait.get(e.traitId) ?? []
            arr.push(e)
            eventsByTrait.set(e.traitId, arr)
          }
          // For each trait, compute which events are the "regression" event (first raise after a resolve).
          // Key is composite "traitId:createdAt" to avoid collision when two events share a timestamp.
          const regressionEventKeys = new Set<string>()
          for (const [traitId, traitEvents] of eventsByTrait) {
            const rec = recurrenceFromEvents(traitEvents)
            if (!rec.regressed || rec.priorResolvedAt == null) continue
            // The regression event is the first raise-op event whose sourceDate > priorResolvedAt.
            const RAISE_OPS_SET = new Set(["create", "reinforce", "refine", "reopen"])
            for (const te of traitEvents) {
              if (RAISE_OPS_SET.has(te.op) && te.sourceDate > rec.priorResolvedAt) {
                regressionEventKeys.add(`${te.traitId}:${te.createdAt}`)
                break
              }
            }
          }

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
              area: e.area ?? null,
              issueType: e.issueType ?? null,
              severity: e.severity ?? null,
              // isRegression: true marks a post-resolution reopen/reinforce so the UI can highlight it.
              isRegression: regressionEventKeys.has(`${e.traitId}:${e.createdAt}`),
            }))
          return json({ simId, name: sim.name, events: timeline })
        } catch (e: any) { return json({ error: e?.message || "evolution failed" }, 500) }
      }
    }

    // ── Sim source transcripts (the calls that shaped this Sim) — project-scoped, read-only ──
    const simTxMatch = path.match(/^\/api\/sims\/([^/]+)\/transcripts$/)
    if (req.method === "GET" && simTxMatch) {
      const meST = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meST) return json({ error: "Sign in to continue." }, 401)
      const projST = await resolveProject(meST, url.searchParams.get("project"))
      if (!projST) return json({ error: "No project." }, 400)
      const sim = (await listPersonas(projST.id)).find(p => p.id === simTxMatch[1])
      if (!sim) return json({ error: "Not found" }, 404)
      try { return json({ simId: sim.id, transcripts: await sourceTranscriptsForSim(sim.id, projST.id) }) }
      catch (e: any) { return json({ error: e?.message || "transcripts failed" }, 500) }
    }
    // ── One transcript's raw text — project-scoped, read-only ──
    const txMatch = path.match(/^\/api\/transcripts\/([^/]+)$/)
    if (req.method === "GET" && txMatch) {
      const meT2 = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meT2) return json({ error: "Sign in to continue." }, 401)
      const projT2 = await resolveProject(meT2, url.searchParams.get("project"))
      if (!projT2) return json({ error: "No project." }, 400)
      const tr = await transcriptById(projT2.id, txMatch[1])
      if (!tr) return json({ error: "Not found" }, 404)
      return json({ id: tr.id, title: tr.title, rawText: tr.rawText, sourceDate: tr.sourceDate, addedBy: tr.addedBy, speakers: tr.speakers })
    }

    // ── everything below requires a session ──
    const me = await sessionEmail(req)
    const needLogin = () => (req.method === "GET" ? redirect("/login") : json({ error: "Sign in to continue." }, 401))

    if (req.method === "GET" && path === "/dashboard") return me ? file(PUB + "/dashboard.html") : redirect("/login")
    if (req.method === "GET" && path === "/opsadmin") {
      if (!me || !isOpsAdmin(me)) return new Response("Not found", { status: 404 }) // hide route from non-ops
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0)
      const [totals, daily, byProject, byTypeModel, recent, today] = await Promise.all([
        opsTotals(), opsDaily(30), opsByProject(), opsByTypeModel(), opsRecentCalls(50, offset), opsTodaySpend(),
      ])
      const weights = await getActiveWeights()
      const pct = weightsToPct(weights, MODEL_CHOICE_IDS)
      const modelMix = { choices: MODEL_CHOICES.map(c => ({ id: c.id, label: c.label, price: c.price, weight: Number(weights[c.id]) || 0, pct: pct[c.id] })) }
      const html = renderOpsAdmin({ totals, daily, byProject, byTypeModel, recent, today, cap: OPS_DAILY_CAP_USD, offset, modelMix })
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
    }
    if (req.method === "POST" && path === "/opsadmin/model-mix") {
      if (!me || !isOpsAdmin(me)) return new Response("Not found", { status: 404 }) // hide route from non-ops
      const form = await req.formData()
      const raw: Record<string, unknown> = {}
      for (const id of MODEL_CHOICE_IDS) raw[id] = form.get(id)
      await setModelWeights(parseWeightsForm(raw, MODEL_CHOICE_IDS))
      await refreshWeightsCache()
      return redirect("/opsadmin")
    }
    if (req.method === "GET" && path === "/app") return me ? file(PUB + "/index.html") : redirect("/login")
    if (req.method === "GET" && path === "/onboarding") {
      // The onboarding wizard is the signup flow for new users (email → OTP → name project → add URL →
      // install extension → pick Sims, inline). ensureAccount gives every verified user a default
      // membership on first login, so "has a membership" can't tell new from returning. Instead, a user
      // who has ALREADY been through setup is detected by a captured company domain (onboarding step 1);
      // they skip to the dashboard. Fresh accounts (no domain yet) and logged-out visitors get the wizard.
      if (me) {
        const ms = await membershipsFor(me)
        if (ms.length) {
          const dr = await db!.execute({ sql: "SELECT domain FROM accounts WHERE id=?", args: [ms[0].workspaceId] })
          const onboarded = dr.rows.length > 0 && !!(dr.rows[0] as any).domain
          if (onboarded) return redirect("/dashboard")
        }
      }
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
            // All recent feedback (not just withTicketOnly) — Klavity Cloud is the primary ticket system.
            listFeedback(projectId, { limit: 12 }),
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

          // tickets — all recent feedback (Klavity Cloud is the primary tracker), newest-first.
          // Enriched with status/assignee (management state) and exports (connector push history).
          const ticketIds = feedbackTickets.map(f => f.id)
          const [ticketExportsMap, ticketMetaRows] = await Promise.all([
            ticketIds.length ? exportsForFeedbackIds(ticketIds) : Promise.resolve({} as Record<string, any[]>),
            // Fetch status/assignee via feedbackById in batch (single IN query via raw DB).
            db && ticketIds.length
              ? db.execute({
                  sql: `SELECT id, status, assignee, notes FROM feedback WHERE id IN (${ticketIds.map(() => "?").join(",")})`,
                  args: ticketIds,
                }).then(r => {
                  const m: Record<string, { status: string; assignee: string | null; notes: string | null }> = {}
                  for (const x of r.rows) {
                    m[String((x as any).id)] = {
                      status: (x as any).status ? String((x as any).status) : "open",
                      assignee: (x as any).assignee != null ? String((x as any).assignee) : null,
                      notes: (x as any).notes != null ? String((x as any).notes) : null,
                    }
                  }
                  return m
                })
              : Promise.resolve({} as Record<string, { status: string; assignee: string | null; notes: string | null }>),
          ])
          const tickets = feedbackTickets.map(f => {
            const p = f.simId ? personaById.get(f.simId) : null
            const meta = ticketMetaRows[f.id] ?? { status: "open", assignee: null, notes: null }
            // Build exports: latest ok per connector
            const rawExports = ticketExportsMap[f.id] ?? []
            const seenConnector = new Set<string>()
            const exports: { type: string; externalKey: string | null; externalUrl: string | null }[] = []
            for (const exp of rawExports) {
              if (exp.status === "ok" && !seenConnector.has(exp.connectorId)) {
                seenConnector.add(exp.connectorId)
                exports.push({ type: exp.type, externalKey: exp.externalKey, externalUrl: exp.externalUrl })
              }
            }
            return {
              id: f.id, simName: p?.name ?? null,
              title: f.observation, severity: f.severity,
              urlPath: f.urlPath, planeIssueKey: f.planeIssueKey,
              planeIssueUrl: f.planeIssueUrl, createdAt: f.createdAt,
              status: meta.status, assignee: meta.assignee, exports,
              observation: f.observation, suggestedBug: f.suggestedBug,
              sentiment: f.sentiment, screenshotId: f.screenshotId,
              sourceQuote: f.sourceQuote, sourceDate: f.sourceDate,
              notes: meta.notes,
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

      // ── account domain (onboarding step 1: tells clients from your own team) ──
      if (req.method === "POST" && path === "/api/account/domain") {
        const ms = await membershipsFor(me); const active = ms[0]
        if (!active) return json({ error: "No account." }, 400)
        if (active.role !== "admin") return json({ error: "Admin only." }, 403)
        const { domain } = await req.json().catch(() => ({}))
        await setAccountDomain(active.workspaceId, String(domain || "").trim().toLowerCase())
        return json({ ok: true })
      }

      // ── Ticket management: PATCH /api/feedback/:id and POST /api/feedback/:id/export ──
      // Resolve the feedback's project via feedbackById across accessible projects.
      const feedbackIdMatch = path.match(/^\/api\/feedback\/([^/]+?)(\/export)?$/)
      if (feedbackIdMatch) {
        const fid = feedbackIdMatch[1]
        const isExport = feedbackIdMatch[2] === "/export"

        // Resolve which project this feedback belongs to and check the caller has access.
        let fbRow: any = null
        let fbAccess: "admin" | "member" | null = null
        const allProjects = await listProjects(me)
        for (const p of allProjects) {
          const a = await projectAccess(me, p.id)
          if (!a) continue
          const row = await feedbackById(p.id, fid)
          if (row) { fbRow = row; fbAccess = a; break }
        }
        if (!fbRow) return json({ error: "Feedback not found or not accessible." }, 404)

        // PATCH /api/feedback/:id — any project member may edit status/assignee/notes
        if (req.method === "PATCH" && !isExport) {
          const body = await req.json().catch(() => ({}))
          const VALID_STATUS = ["open", "in_progress", "done"]
          if (body.status !== undefined && !VALID_STATUS.includes(body.status)) {
            return json({ error: `status must be one of: ${VALID_STATUS.join(", ")}` }, 400)
          }
          const meta: Partial<{ status: string; assignee: string | null; notes: string | null }> = {}
          if (body.status !== undefined) meta.status = body.status
          if (body.assignee !== undefined) meta.assignee = body.assignee ?? null
          if (body.notes !== undefined) meta.notes = body.notes ?? null
          const updated = await updateFeedbackMeta(fbRow.projectId, fid, meta)
          if (!updated) return json({ error: "Update failed." }, 500)
          return json({ ok: true })
        }

        // POST /api/feedback/:id/export — admin only
        if (req.method === "POST" && isExport) {
          if (fbAccess !== "admin") return json({ error: "Only project admins can export tickets." }, 403)
          const body = await req.json().catch(() => ({}))
          const connectorId = String(body.connectorId || "")
          if (!connectorId) return json({ error: "connectorId is required." }, 400)
          const connector = await getConnectorById(fbRow.projectId, connectorId)
          if (!connector) return json({ error: "Connector not found." }, 404)
          const adapter = getConnector(connector.type)
          if (!adapter) return json({ error: "Unknown connector type." }, 400)

          // Decrypt secret fields before calling createIssue
          const decryptedConfig: Record<string, string> = { ...connector.config }
          for (const f of adapter.fields) {
            if (f.secret && connector.config[f.key]) {
              try { decryptedConfig[f.key] = await decryptSecret(connector.config[f.key]) }
              catch { decryptedConfig[f.key] = "" }
            }
          }

          const exportSimName = await resolveSimName(fbRow.projectId, fbRow.simId)
          const payload = feedbackToTicketPayload(fbRow, { id: fbRow.projectId }, exportSimName)
          let exportResult: { type: string; externalKey: string | null; externalUrl: string | null; status: "ok" | "failed"; error: string | null }

          try {
            const result = await adapter.createIssue(payload, decryptedConfig)
            await addTicketExport({
              feedbackId: fid, projectId: fbRow.projectId, connectorId,
              type: connector.type, externalKey: result.externalKey, externalUrl: result.externalUrl,
              status: "ok", error: null, createdBy: me,
            })
            exportResult = { type: connector.type, externalKey: result.externalKey, externalUrl: result.externalUrl, status: "ok", error: null }
          } catch (e: any) {
            const errMsg = e?.message || "Export failed"
            await addTicketExport({
              feedbackId: fid, projectId: fbRow.projectId, connectorId,
              type: connector.type, externalKey: null, externalUrl: null,
              status: "failed", error: errMsg, createdBy: me,
            })
            exportResult = { type: connector.type, externalKey: null, externalUrl: null, status: "failed", error: errMsg }
          }
          return json({ ok: true, export: exportResult })
        }

        return json({ error: "Not found" }, 404)
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
      // Project detail + members (projectAccess-gated) and project-scoped invite (R4) + monitored-urls (P3b) + connectors.
      const projMatch = path.match(/^\/api\/projects\/([^/]+?)(\/members|\/invite|\/activity|\/rename|\/monitored-urls(?:\/[^/]+)?|\/connectors(?:\/[^/]+)?(?:\/test)?)?$/)
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
            // urlPattern present → rename the pattern in place; else toggle enabled.
            if (body.urlPattern !== undefined || body.url_pattern !== undefined) {
              const pattern = String(body.urlPattern || body.url_pattern || "").trim()
              if (!pattern) return json({ error: "urlPattern is required." }, 400)
              if (/[?#]/.test(pattern)) return json({ error: "Patterns are path-only (no query/fragment)." }, 400)
              try {
                await setMonitoredUrlPattern(pid, midMatch[1], pattern)
              } catch (e: any) {
                return json({ error: /UNIQUE|constraint/i.test(String(e?.message)) ? "That pattern already exists for this project." : "Couldn't update the pattern." }, 400)
              }
            } else {
              await setMonitoredUrlEnabled(pid, midMatch[1], !!body.enabled)
            }
            return json({ ok: true, monitoredUrls: await listMonitoredUrls(pid) })
          }
          return json({ error: "Not found" }, 404)
        }

        // ── Connector CRUD (admin-only write; member-readable) ──
        if (sub.startsWith("/connectors")) {
          // Test-connection routes must be matched BEFORE the generic /connectors/:cid handling,
          // because `^\/connectors\/([^/]+)$` would otherwise capture cid="test".
          const testNoCid = sub === "/connectors/test"
          const cidTestMatch = sub.match(/^\/connectors\/([^/]+)\/test$/)

          // A clearly-labelled test ticket used by both test endpoints to genuinely verify connectivity.
          const TEST_PAYLOAD: TicketPayload = {
            title: "✅ Klavity connection test",
            body: "This is a test ticket created by Klavity to verify this connector is configured correctly. It's safe to close or delete.",
            severity: null,
            url: null,
            simName: "Klavity",
            createdAt: Date.now(),
            klavityUrl: `${BASE}/dashboard`,
          }

          // POST /api/projects/:pid/connectors/test — test an UNSAVED config from the add-destination form (admin only)
          if (req.method === "POST" && testNoCid) {
            if (access !== "admin") return json({ error: "Only project admins can manage connectors." }, 403)
            const body = await req.json().catch(() => ({}))
            const type = String(body.type || "")
            const config: Record<string, string> = (body.config && typeof body.config === "object") ? body.config : {}
            const adapter = getConnector(type)
            if (!adapter) return json({ error: `Unknown connector type: ${type}` }, 400)
            const validation = adapter.validate(config)
            if (!validation.ok) return json({ error: validation.error || "Invalid connector config." }, 400)
            try {
              const result = await adapter.createIssue(TEST_PAYLOAD, config)
              return json({ ok: true, externalKey: result.externalKey, externalUrl: result.externalUrl })
            } catch (e: any) {
              return json({ ok: false, error: e?.message || "Test failed" })
            }
          }

          // POST /api/projects/:pid/connectors/:cid/test — test an ALREADY-SAVED connector (admin only)
          if (req.method === "POST" && cidTestMatch) {
            if (access !== "admin") return json({ error: "Only project admins can manage connectors." }, 403)
            const connector = await getConnectorById(pid, cidTestMatch[1])
            if (!connector) return json({ error: "Connector not found." }, 404)
            const adapter = getConnector(connector.type)
            if (!adapter) return json({ error: "Unknown connector type." }, 400)

            // Decrypt secret fields before calling createIssue
            const decryptedConfig: Record<string, string> = { ...connector.config }
            for (const f of adapter.fields) {
              if (f.secret && connector.config[f.key]) {
                try { decryptedConfig[f.key] = await decryptSecret(connector.config[f.key]) }
                catch { decryptedConfig[f.key] = "" }
              }
            }

            try {
              const result = await adapter.createIssue(TEST_PAYLOAD, decryptedConfig)
              return json({ ok: true, externalKey: result.externalKey, externalUrl: result.externalUrl })
            } catch (e: any) {
              return json({ ok: false, error: e?.message || "Test failed" })
            }
          }

          const cidMatch = sub.match(/^\/connectors\/([^/]+)$/)
          const cid = cidMatch ? cidMatch[1] : null

          // GET /api/projects/:id/connectors — list (redacted) + type catalog
          if (req.method === "GET" && !cid) {
            const rows = await listConnectors(pid)
            return json({ connectors: rows.map(connectorToClient), types: listConnectorTypes() })
          }

          // POST /api/projects/:id/connectors — create (admin only)
          if (req.method === "POST" && !cid) {
            if (access !== "admin") return json({ error: "Only project admins can manage connectors." }, 403)
            const body = await req.json().catch(() => ({}))
            const type = String(body.type || "")
            const name = String(body.name || "").trim()
            const rawConfig: Record<string, string> = (body.config && typeof body.config === "object") ? body.config : {}
            const autoCopy = !!body.autoCopy

            const adapter = getConnector(type)
            if (!adapter) return json({ error: `Unknown connector type: ${type}` }, 400)
            if (!name) return json({ error: "name is required." }, 400)

            // Validate config using raw secrets before encrypting
            const validation = adapter.validate(rawConfig)
            if (!validation.ok) return json({ error: validation.error || "Invalid connector config." }, 400)

            // Encrypt all secret fields
            const encConfig: Record<string, string> = { ...rawConfig }
            for (const f of adapter.fields) {
              if (f.secret && rawConfig[f.key]) {
                encConfig[f.key] = await encryptSecret(rawConfig[f.key])
              }
            }

            const id = await createConnector(pid, { type: type as any, name, config: encConfig, autoCopy, createdBy: me })
            const created = await getConnectorById(pid, id)
            return json({ ok: true, connector: connectorToClient(created!) }, 201)
          }

          // PATCH /api/projects/:id/connectors/:cid — update (admin only)
          if (req.method === "PATCH" && cid) {
            if (access !== "admin") return json({ error: "Only project admins can manage connectors." }, 403)
            const existing = await getConnectorById(pid, cid)
            if (!existing) return json({ error: "Connector not found." }, 404)
            const body = await req.json().catch(() => ({}))

            const patch: Partial<{ name: string; config: Record<string, string>; autoCopy: boolean; enabled: boolean }> = {}
            if (body.name !== undefined) patch.name = String(body.name)
            if (body.autoCopy !== undefined) patch.autoCopy = !!body.autoCopy
            if (body.enabled !== undefined) patch.enabled = !!body.enabled

            if (body.config !== undefined && typeof body.config === "object") {
              const adapter = getConnector(existing.type)
              const newRaw: Record<string, string> = body.config
              const encConfig: Record<string, string> = { ...existing.config }
              // Merge non-secret fields directly; for secret fields: blank = keep existing, non-blank = re-encrypt
              for (const [k, v] of Object.entries(newRaw)) {
                const field = adapter?.fields.find(f => f.key === k)
                if (field?.secret) {
                  if (v) encConfig[k] = await encryptSecret(v)
                  // else keep existing (blank = "keep")
                } else {
                  encConfig[k] = v
                }
              }
              patch.config = encConfig
            }

            await updateConnector(pid, cid, patch)
            return json({ ok: true })
          }

          // DELETE /api/projects/:id/connectors/:cid — remove (admin only)
          if (req.method === "DELETE" && cid) {
            if (access !== "admin") return json({ error: "Only project admins can manage connectors." }, 403)
            const existing = await getConnectorById(pid, cid)
            if (!existing) return json({ error: "Connector not found." }, 404)
            await removeConnector(pid, cid)
            return json({ ok: true })
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
          const meB = (await sessionEmail(req)) || (await bearerEmail(req))
          const { content, usage } = await chat([{ role: "system", content: sys }, { role: "user", content: "Brief: " + brief }], 1200, true, { type: "persona", email: meB })
          const data = parseJSON(content)
          return json({ persona: data.persona, usage })
        } catch (e: any) { return json({ error: e?.message || "create failed" }, 500) }
      }
      // gated AI
      if (req.method === "POST" && path === "/api/extract") {
        try {
          const { transcript } = await req.json()
          if (!transcript || transcript.trim().length < 20) return json({ error: "Transcript too short" }, 400)
          const meE = (await sessionEmail(req)) || (await bearerEmail(req))
          const { data, usage } = await extractPersonas(transcript, { email: meE })
          return json({ personas: data.personas || [], usage })
        } catch (e: any) { return json({ error: e?.message || "extract failed" }, 500) }
      }
      if (req.method === "POST" && path === "/api/react") {
        try {
          const { persona, imageB64, mediaType, pageUrl } = await req.json()
          if (!persona || !imageB64) return json({ error: "persona and imageB64 required" }, 400)
          const meRx = (await sessionEmail(req)) || (await bearerEmail(req))
          const simId = persona?.id ? String(persona.id) : null

          // Build regression-gated recurrence memory for this Sim's traits before calling reactToPage.
          // Only attach recurrenceMemory when regressed=true; mere recurrence does not warrant disappointment.
          let personaWithMemory = persona
          if (simId) {
            try {
              const allSimEvents: TraitEventRow[] = await listTraitEvents(simId)
              const eventsByTrait = new Map<string, TraitEventRow[]>()
              for (const e of allSimEvents) {
                const arr = eventsByTrait.get(e.traitId) ?? []
                arr.push(e)
                eventsByTrait.set(e.traitId, arr)
              }
              const insights = Array.isArray(persona.insights) ? persona.insights : []
              const insightsWithMemory = insights.map((ins: any) => {
                const traitId = ins.traitId
                if (!traitId) return ins
                const evts = eventsByTrait.get(traitId) ?? []
                const rec = recurrenceFromEvents(evts)
                if (!rec.regressed) return ins
                return {
                  ...ins,
                  recurrenceMemory: {
                    regressed: true,
                    firstRaised: rec.firstRaised,
                    lastRaised: rec.lastRaised,
                    priorResolvedAt: rec.priorResolvedAt,
                    timesRaised: rec.timesRaised,
                  },
                }
              })
              personaWithMemory = { ...persona, insights: insightsWithMemory }
            } catch {
              // Non-fatal: if DB unavailable fall back to plain persona.
            }
          }

          const { data, usage } = await reactToPage(personaWithMemory, imageB64, mediaType || "image/png", pageUrl || "", { email: meRx })
          const reactions = data.reactions || []
          // Resolve each reaction's citedTraitIds → {quote, speaker, sourceDate, transcriptId, recurrence} so the
          // studio review→feedback path can carry citations forward.
          for (const r of reactions) {
            const cited = await resolveCitations(simId, r?.citedTraitIds)
            r.citation = cited.citedTraitIds.length
              ? { citedTraitIds: cited.citedTraitIds, sourceQuote: cited.sourceQuote, speaker: cited.speaker, sourceTranscriptId: cited.sourceTranscriptId, sourceDate: cited.sourceDate, recurrence: cited.recurrence }
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

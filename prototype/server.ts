// Klavity app server (Bun). Marketing on /, demo + dashboard behind email-OTP login.
import { initDb, db, createOtp, verifyOtp, upsertUser, createSession, getSession, deleteSession, ensureAccount, setAccountDomain, membershipsFor, hasAnyMembership, membersOf, roleIn, getIntegration, setIntegration, listPersonas, upsertPersona, deletePersona, insertPersonaEdit, listPersonaEdits, insertScreenshot, insertFeedback, insertActivity, updateFeedbackTracker, listActivity, listFeedback, dashboardCounts, projectAccess, listProjects, createProject, renameProject, projectById, membersOfProject, addProjectMember, insertTranscript, listTranscripts, listTraits, listTraitEvents, insertTrait, updateTrait, insertTraitEvent, logTraitEdit, hasReconcileRun, markReconcileRun, rebuildInsightsJson, ensureTraitsSeeded, listMonitoredUrls, addMonitoredUrl, setMonitoredUrlEnabled, setMonitoredUrlPattern, removeMonitoredUrl, getExtensionTokenEmail, getExtensionTokenInfo, issueExtensionToken, matchMonitored, getConsent, setConsent, getReviewMode, setReviewMode, tryConsumeReviewBudget, reviewGate, reviewDedupeKey, reviewDay, screenshotById, recordAiCall, opsTotals, opsDaily, opsByProject, opsByTypeModel, opsRecentCalls, opsTodaySpend, getModelWeights, setModelWeights, listConnectors, getConnectorById, createConnector, updateConnector, removeConnector, listAutoCopyConnectors, updateFeedbackMeta, feedbackById, addTicketExport, listTicketExports, exportsForFeedbackIds, getRecentlyResolvedTraits, type RecentlyResolvedTrait, transcriptById, sourceTranscriptsForSim, originAllowedForProject, findFeedbackByIssueKey, listRecentFeedbackForDedup, bumpFeedbackRecurrence, DEFAULT_AI_CALL_EST_USD, tryReserveDailySpend, reconcileDailySpend, getProjectModalConfig, setProjectModalConfig, isAccountPro } from "./lib/db"
import { issueKeyFor, chooseDedup } from "./lib/dedup"
import { getConnector, listConnectorTypes, type TicketPayload } from "./lib/connectors/index"
import { applyReconcileOps, recurrenceFromEvents, type ReconcileOp, type Trait, type TraitEventRow } from "./lib/provenance"
import { sendOtp } from "./lib/mail"
import { token, otp, emailAllowed, cookie, clearCookie, parseCookies, isOpsAdmin } from "./lib/auth"
import { uploadScreenshotMeta, presignGet, type UploadedScreenshot } from "./lib/s3"
import { buildIssueHtml, escapeHtml } from "./lib/feedback"
import { encryptSecret, decryptSecret } from "./lib/crypto"
import { planeConfigFromForm, redactPlane, type PlaneStored } from "./lib/connection"
import { assertSafeUrl } from "./lib/url-guard"
import { safeFetch } from "./lib/safe-fetch"
import { allow as rlAllow, record as rlRecord, count as rlCount, clear as rlClear } from "./lib/ratelimit"
import { wrapUntrusted, UNTRUSTED_GUARD } from "./lib/prompt-safety"
import { validateModalConfigInput, resolveModalConfig } from "../packages/core/src/modal-theme"
import { MODEL_CHOICES, MODEL_CHOICE_IDS, DEFAULT_WEIGHTS, pickModel, parseWeightsForm, weightsToPct } from "./lib/models"
import { AsyncLocalStorage } from "node:async_hooks"

// Per-request context. A project-bound Bearer token (widget token) records its bound project here so
// resolveProject can constrain it to that project (F5) — without threading state through every route.
const reqCtx = new AsyncLocalStorage<{ boundProject?: string | null }>()
import { trailsDashboardData } from "./lib/trails-dashboard"
import { fileFindingById, dismissFinding, realFiler } from "./lib/trails-findings-gate"
import { getReplay, runsWithReplay } from "./lib/trails-replay"
import { listRunSteps } from "./lib/trails"
import { runWalkNow } from "./lib/trails-trigger"
import { WalkBusyError } from "./lib/trails-browser"
import { seedDemoTrails } from "./lib/trails-demo-seed"

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

// Plan G — env-gated demo-Trail seed. When TRAILS_DEMO_PROJECT_ID is set, idempotently seed the demo
// Trails (GREEN baseline / AMBER drift / RED regression + dogfood) for that project so /trails has
// live data. Best-effort: a seed failure is logged but never blocks boot. Fixture Trails point at
// this app's own /trails-demo/* (KLAV_BASE_URL origin); the dogfood walks the real public landing.
if (db && process.env.TRAILS_DEMO_PROJECT_ID) {
  try {
    const r = await seedDemoTrails(process.env.TRAILS_DEMO_PROJECT_ID, BASE)
    if (r.created) console.log(`[trails-demo] seeded ${r.created} demo trail(s) for ${process.env.TRAILS_DEMO_PROJECT_ID}`)
  } catch (e) {
    console.warn("[trails-demo] seed failed (continuing):", String(e))
  }
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
  // M5/LLM10: enforce the daily spend cap server-side, ATOMICALLY. The old `opsTodaySpend() >= cap`
  // read-then-act check raced — N concurrent callers all saw under-cap and all spent, overshooting the
  // wallet. We now RESERVE the estimated cost up-front via a single conditional UPDATE (fails CLOSED if
  // the reservation would cross the cap), then reconcile to the real cost after the call returns.
  const spendEst = DEFAULT_AI_CALL_EST_USD
  let spendReserved = false
  if (db) {
    try {
      if (!(await tryReserveDailySpend(spendEst, OPS_DAILY_CAP_USD))) {
        console.warn(`AI[${label}] blocked: daily cap $${OPS_DAILY_CAP_USD} reached`)
        throw new Error("Daily AI budget reached — please try again tomorrow.")
      }
      spendReserved = true
    } catch (e: any) {
      if (e?.message?.includes("Daily AI budget")) throw e
      // A failing reservation query must not silently disable the cap, but also shouldn't hard-break
      // every call on a transient DB hiccup — log and proceed (the per-key OpenRouter cap is the backstop).
      console.error("tryReserveDailySpend check failed:", e?.message || e)
    }
  }
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
    // The call never produced a billable response → release the reservation back to today's budget.
    if (spendReserved) void reconcileDailySpend(spendEst, 0).catch(() => {})
    const ms = Date.now() - t0
    if (e?.name === "AbortError") { console.error(`AI[${label}] TIMEOUT after ${ms}ms`); throw new Error("The model took too long (>90s). Please try again.") }
    console.error(`AI[${label}] network error after ${ms}ms:`, e?.message || e); throw e
  }
  clearTimeout(timer)
  if (!res.ok) { if (spendReserved) void reconcileDailySpend(spendEst, 0).catch(() => {}); const body = (await res.text()).slice(0, 300); console.error(`AI[${label}] OpenRouter ${res.status} after ${Date.now() - t0}ms: ${body}`); throw new Error(`OpenRouter ${res.status}: ${body}`) }
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
  // M5/LLM10: reconcile the up-front reservation to the REAL cost so the cap tracks actual spend.
  // Fire-and-forget — a slow reconcile must never hang the response; the reservation already gated us.
  if (spendReserved) {
    void reconcileDailySpend(spendEst, typeof u.cost === "number" ? u.cost : 0)
      .catch((e: any) => console.error("reconcileDailySpend failed:", e?.message || e))
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
  // H4/LLM01: the transcript is untrusted — delimit it and tell the model to treat it as data.
  const { content, usage } = await chat([{ role: "system", content: EXTRACT_SYS + UNTRUSTED_GUARD }, { role: "user", content: "TRANSCRIPT:\n" + wrapUntrusted(transcript) }], 4000, false, { type: "extract", ...ctx })
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
  // H4/LLM01: the persona is our own trusted data, but the page URL and the screenshot itself are
  // attacker-influenceable — delimit the URL and instruct the model to ignore instructions in page data.
  const { content, usage } = await chat([
    { role: "system", content: REACT_SYS + UNTRUSTED_GUARD },
    { role: "user", content: [
      { type: "text", text: "You are this persona:\n" + JSON.stringify(persona, null, 2) + `\n\nReact to this screenshot. The page URL (untrusted) is:\n` + wrapUntrusted(pageUrl || "(unknown URL)") },
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
    // H4/LLM01: the new transcript is untrusted — delimit it (the CURRENT TRAITS above are our own data).
    "\n\nNEW TRANSCRIPT:\n" + wrapUntrusted(transcript)
  const { content, usage } = await chat([
    { role: "system", content: RECONCILE_SYS + UNTRUSTED_GUARD },
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
// A07/A01: projectId (when supplied) scopes every trait/transcript read to the caller's project, so a
// cited trait id belonging to ANOTHER tenant's Sim can never resolve to a verbatim quote/provenance.
// Callers should ALSO verify the sim itself belongs to the project (pass simId=null otherwise); this
// is the defense-in-depth layer that ensures even a leaked trait id can't read cross-project.
async function resolveCitations(simId: string | null, citedTraitIds: any, projectId?: string | null): Promise<{
  citedTraitIds: string[]; sourceQuote: string | null; speaker: string | null; sourceTranscriptId: string | null; sourceDate: number | null;
  issueType: string | null; sourceQuoteVerified: boolean | null;
  recurrence: { timesRaised: number; regressed: boolean; firstRaised: number | null; lastRaised: number | null; priorResolvedAt: number | null } | null
}> {
  const empty = { citedTraitIds: [] as string[], sourceQuote: null, speaker: null, sourceTranscriptId: null, sourceDate: null, issueType: null, sourceQuoteVerified: null, recurrence: null }
  if (!simId || !Array.isArray(citedTraitIds) || !citedTraitIds.length) return empty
  const want = new Set(citedTraitIds.map((x) => String(x)))
  const traits = await listTraits(simId, projectId ? { projectId } : {}) // all statuses — a cited trait may have since been superseded
  const matched = traits.filter((t) => want.has(t.id))
  if (!matched.length) return empty
  const primary = matched[0]
  // source_date comes from the trait's originating transcript (drives "(Sarah, 2026-06-12)" citations).
  let sourceDate: number | null = null
  if (primary.srcTranscriptId) {
    // Scope the transcript read to the project too (defense-in-depth) when projectId is known.
    const tr = projectId
      ? await db!.execute({ sql: "SELECT source_date FROM transcripts WHERE id=? AND project_id=?", args: [primary.srcTranscriptId, projectId] })
      : await db!.execute({ sql: "SELECT source_date FROM transcripts WHERE id=?", args: [primary.srcTranscriptId] })
    if (tr.rows.length) sourceDate = Number((tr.rows[0] as any).source_date)
  }
  // Compute recurrence for EACH cited trait, then surface the strongest regression.
  // Fetch all events for this sim once, then filter per trait in memory.
  let strongestRecurrence: { timesRaised: number; regressed: boolean; firstRaised: number | null; lastRaised: number | null; priorResolvedAt: number | null } | null = null
  try {
    const allEvents: TraitEventRow[] = await listTraitEvents(simId, projectId ? { projectId } : {})
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
    issueType: (primary as any).issueType ?? null,
    sourceQuoteVerified: (primary as any).srcVerified ?? null,
    recurrence: strongestRecurrence,
  }
}

// Decide whether a suggested bug duplicates an existing project report. Returns the existing
// feedback id to collapse into, or null to insert fresh. Pure decision over DB lookups.
async function findDuplicateFeedback(args: {
  projectId: string; urlPath: string | null; issueType: string | null
  citedTraitIds: string[]; title: string; observation: string
}): Promise<string | null> {
  const issueKey = issueKeyFor({
    projectId: args.projectId, urlPath: args.urlPath ?? "/",
    issueType: args.issueType, citedTraitIds: args.citedTraitIds,
  })
  const exact = await findFeedbackByIssueKey(args.projectId, issueKey)
  const recent = exact ? [] : await listRecentFeedbackForDedup(args.projectId, 50)
  return chooseDedup({ title: args.title, observation: args.observation }, exact, recent)
}
// Re-export the key so insert sites store it on new rows.
function issueKeyForFeedback(projectId: string, urlPath: string | null, issueType: string | null, citedTraitIds: string[]): string {
  return issueKeyFor({ projectId, urlPath: urlPath ?? "/", issueType, citedTraitIds })
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
// M4/A10: never echo internal exception text (DB errors, stack traces, upstream bodies) to clients.
// Log it server-side with a short correlation id; return a generic message + that id so a user can
// quote it for support without leaking internals.
function oops(e: unknown, label: string): { error: string; id: string } {
  const id = crypto.randomUUID().slice(0, 8)
  console.error(`[${label} ${id}]`, (e as any)?.message || e)
  return { error: "Something went wrong. Please try again.", id }
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
    <p class="sub" style="margin:8px 0 0">Enforced server-side — AI calls fail closed once today's spend reaches the cap.</p>
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
// Bearer credentials MUST be a dedicated narrow-scope extension token (ext_…) — the raw session id is
// no longer accepted here (M2). First-party browser requests authenticate via the HttpOnly cookie.
async function bearerEmail(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || ""
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m || !db) return null
  // M2 closed: only dedicated, revocable extension tokens (`ext_…`) are accepted as Bearer credentials.
  // The raw session id is no longer honored as a Bearer — it remains valid only as a first-party
  // HttpOnly cookie via sessionEmail(). A leaked Bearer is now always narrow-scope and revocable.
  const info = await getExtensionTokenInfo(m[1])
  if (!info) return null
  // F5: if this token is bound to a project (widget token), record it so resolveProject constrains the
  // request to that project. Account-wide extension tokens (projectId null) leave the context unset.
  const ctx = reqCtx.getStore(); if (ctx) ctx.boundProject = info.projectId ?? null
  return info.email
}

// Resolve the project a request targets: explicit ?project=:id if accessible, else the caller's
// first accessible project. Returns null if the caller has no accessible project. Gated by projectAccess.
async function resolveProject(email: string, requested?: string | null): Promise<{ id: string; access: 'admin' | 'member' } | null> {
  // F5: a project-bound Bearer token may ONLY act on its bound project. Reject a mismatched explicit
  // request, and force the bound project when none was requested — so a leaked widget token can't reach
  // the owner's other projects via ?project= or the first-project fallback.
  const bound = reqCtx.getStore()?.boundProject
  if (bound) {
    if (requested && requested !== bound) return null
    const a = await projectAccess(email, bound)
    return a ? { id: bound, access: a } : null
  }
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

// Normalize a persona accent to a strict #rrggbb hex, falling back to brand indigo (H5/LLM05).
// `accent` is often model-generated and is interpolated into a style attribute in the dashboard —
// validating it here is the primary defense against a colour value that breaks out of the attribute.
function normAccent(v: unknown): string {
  const s = String(v ?? "")
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "#6366f1"
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

// OTP throttling knobs (H1). Windows are per-process; see lib/ratelimit.ts.
const OTP_REQ_WINDOW = 15 * 60 * 1000  // 15 min
const OTP_REQ_PER_EMAIL = 5            // code requests per email / window
const OTP_REQ_PER_IP = 30             // code requests per IP / window (shared NAT headroom)
const OTP_FAIL_WINDOW = 15 * 60 * 1000
const OTP_FAIL_MAX = 5                 // wrong codes per (email,IP) before lockout
// IP-INDEPENDENT per-email lockout (H1/A07): the per-(email,IP) counter alone is defeated by an
// attacker rotating X-Forwarded-For (or genuinely distributing source IPs) to get a fresh 5-attempt
// budget and brute-force the 6-digit code. This second counter caps total wrong codes per email
// regardless of source IP, so the email's brute-force surface is bounded end-to-end.
const OTP_FAIL_EMAIL_WINDOW = 15 * 60 * 1000
const OTP_FAIL_EMAIL_MAX = 10          // wrong codes per email / window across ALL IPs before lockout

// LLM-endpoint abuse limits (M5/LLM10). /api/transcripts fires two LLM calls and was previously
// unbudgeted/unbounded — cap the input size and rate per user+project.
const TRANSCRIPT_MAX_CHARS = 100_000   // ~25k tokens; reject larger payloads outright
const TRANSCRIPT_WINDOW = 60 * 60 * 1000
const TRANSCRIPT_PER_USER = 30         // transcript submissions per user / hour
const TRANSCRIPT_PER_PROJECT = 60      // per project / hour

// Auto-copy flood cap (M6): max external tickets auto-filed per project per hour.
const AUTOCOPY_WINDOW = 60 * 60 * 1000
const AUTOCOPY_PER_PROJECT = 60

// Legacy AI demo endpoints (/api/persona/brief, /api/extract, /api/react) — each makes an LLM call but
// had no per-user throttle or input cap (only the daily $ cap). Bound them per user/hour + size.
const AI_DEMO_WINDOW = 60 * 60 * 1000
const AI_DEMO_PER_USER = 40            // LLM demo calls per user / hour
const AI_DEMO_MAX_CHARS = 100_000      // transcript/brief char cap
const AI_DEMO_MAX_IMG_B64 = 12_000_000 // ~9 MB decoded — cap the react screenshot payload
// Throttle key for an AI demo call: prefer the authed email, else the abuse-safe client IP.
function aiDemoLimited(meEmail: string | null, req: Request, server: any): boolean {
  const key = meEmail ? `aidemo:u:${meEmail}` : `aidemo:ip:${clientIp(req, server)}`
  return !rlAllow(key, AI_DEMO_PER_USER, AI_DEMO_WINDOW)
}

// True when an address is loopback or RFC1918/link-local private — i.e. a trusted reverse proxy on
// the same box (Caddy). Only such a peer may set X-Forwarded-For; a public peer's XFF is forged.
function isTrustedProxyPeer(addr: string | null | undefined): boolean {
  if (!addr) return false
  let a = String(addr).trim().toLowerCase()
  // Normalize IPv6-mapped IPv4 (e.g. ::ffff:127.0.0.1) and bracketed forms.
  a = a.replace(/^\[|\]$/g, "").replace(/^::ffff:/, "")
  if (a === "::1" || a === "127.0.0.1" || a === "localhost") return true
  if (a.startsWith("127.")) return true
  if (a.startsWith("10.")) return true
  if (a.startsWith("192.168.")) return true
  if (a.startsWith("169.254.")) return true       // link-local
  // 172.16.0.0 – 172.31.255.255
  const m = a.match(/^172\.(\d{1,3})\./)
  if (m) { const o = Number(m[1]); if (o >= 16 && o <= 31) return true }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  if (a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) return true
  return false
}

// Client IP for ABUSE THROTTLING ONLY (never authorization). X-Forwarded-For is client-controlled,
// so trusting it blindly lets an attacker rotate XFF to mint fresh per-IP rate-limit budgets (H1/A07
// OTP-lockout bypass). We therefore trust the first XFF hop ONLY when the socket peer is a trusted
// reverse proxy (loopback/private — i.e. behind Caddy on the same box). For a direct public peer we
// use the peer address itself and ignore any XFF it sent.
function clientIp(req: Request, server?: { requestIP?: (r: Request) => { address?: string } | null }): string {
  let peer: string | undefined
  try { peer = server?.requestIP?.(req)?.address || undefined } catch { peer = undefined }
  if (isTrustedProxyPeer(peer)) {
    const xff = req.headers.get("x-forwarded-for")
    if (xff) { const first = xff.split(",")[0].trim(); if (first) return first }
  }
  return peer || "unknown"
}

// ── Security response headers (M-2 / A02): applied to EVERY response. The CSP is permissive enough not
// to break the dashboard / Trails replay / marketing (Google Fonts + inline styles+scripts + blob/data
// for rrweb and images + esm.sh for the index page's html-to-image module import), while still locking
// frame-ancestors (clickjacking), object-src and base-uri,
// and blocking third-party script origins. Tighten script-src to nonces in a later, browser-tested pass.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://esm.sh",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ")
const SEC_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": CSP,
  ...(SECURE ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
}
function withSecurityHeaders(res: Response): Response {
  try { for (const [k, v] of Object.entries(SEC_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v) } catch { /* immutable headers — skip */ }
  return res
}

async function handle(req: Request, server: { requestIP?: (r: Request) => { address?: string } | null }): Promise<Response> {
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
    if (req.method === "GET" && path === "/") return file(SITE + "/index.html")
    if (req.method === "GET" && path === "/local") return redirect("/")
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
    if (req.method === "GET" && path === "/terms") return file(SITE + "/terms.html")
    // ── marketing product pages + shared kit assets ──
    if (req.method === "GET" && path === "/snap") return file(SITE + "/snap.html")
    if (req.method === "GET" && path === "/sims") return file(SITE + "/sims.html")
    if (req.method === "GET" && path === "/autosim") return file(SITE + "/autosim.html")
    if (req.method === "GET" && path === "/kit.css") return new Response(Bun.file(SITE + "/kit.css"), { headers: { "content-type": "text/css; charset=utf-8" } })
    if (req.method === "GET" && path === "/kit.js") return new Response(Bun.file(SITE + "/kit.js"), { headers: { "content-type": "text/javascript; charset=utf-8" } })
    if (req.method === "GET" && path === "/sitemap.xml") return new Response(Bun.file(SITE + "/sitemap.xml"), { headers: { "content-type": "text/xml; charset=utf-8" } })
    if (req.method === "GET" && path === "/robots.txt") return new Response(Bun.file(SITE + "/robots.txt"), { headers: { "content-type": "text/plain; charset=utf-8" } })
    if (req.method === "GET" && path === "/klavity-sim.js") return file(PUB + "/klavity-sim.js")
    // ── vendored rrweb-player assets (Trails Walk replay scrubber) ──
    if (req.method === "GET" && path === "/vendor/rrweb-player.umd.min.js") {
      return new Response(Bun.file(PUB + "/vendor/rrweb-player.umd.min.js"), {
        headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=86400" },
      })
    }
    if (req.method === "GET" && path === "/vendor/rrweb-player.css") {
      return new Response(Bun.file(PUB + "/vendor/rrweb-player.css"), {
        headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=86400" },
      })
    }

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
        // Throttle issuance per email AND per IP (H1): stops OTP/email bombing and shrinks the window
        // an attacker has to brute-force a code. Both must pass.
        const reqIp = clientIp(req, server)
        if (!rlAllow(`otpreq:e:${e}`, OTP_REQ_PER_EMAIL, OTP_REQ_WINDOW) || !rlAllow(`otpreq:ip:${reqIp}`, OTP_REQ_PER_IP, OTP_REQ_WINDOW))
          return json({ error: "Too many code requests. Please wait a few minutes and try again." }, 429, { "Retry-After": "900" })
        const invited = await hasAnyMembership(e)
        if (!emailAllowed(e) && !invited) return json({ error: "This email isn't on the access list. Ask an admin to invite you." }, 403)
        const code = otp()
        await createOtp(e, code, Date.now() + 10 * 60 * 1000)
        let emailed = false
        // Never log the live code in normal operation (M3) — only when the dev flag is explicitly set.
        try { await sendOtp(e, code); emailed = true } catch (err: any) { console.error("OTP email failed:", err.message); if (DEV_SHOW_OTP) console.log(`OTP for ${e} → ${code}`) }
        return json({ ok: true, emailed, ...(DEV_SHOW_OTP ? { devCode: code } : {}) })
      } catch (err: any) { return json(oops(err, "auth"), 500) }
    }

    // ── auth: verify OTP ──
    if (req.method === "POST" && path === "/api/auth/verify") {
      try {
        if (!db) return json({ error: "Login is not configured." }, 500)
        const { email, code } = await req.json()
        const e = String(email || "").trim().toLowerCase()
        const c = String(code || "").trim()
        // Brute-force lockout (H1): after OTP_FAIL_MAX wrong codes for this (email,IP) within the
        // window, refuse further attempts until it resets. Successful verify clears the counter.
        const vIp = clientIp(req, server)
        const failKey = `otpfail:${e}:${vIp}`
        // IP-independent per-email lockout (H1/A07): fires regardless of source IP / spoofed XFF, so
        // rotating the X-Forwarded-For header can't buy a fresh brute-force budget against one email.
        const failEmailKey = `otpfail:e:${e}`
        if (rlCount(failKey) >= OTP_FAIL_MAX || rlCount(failEmailKey) >= OTP_FAIL_EMAIL_MAX)
          return json({ error: "Too many attempts. Please wait a few minutes and try again." }, 429, { "Retry-After": "900" })
        if (!(await verifyOtp(e, c))) {
          rlRecord(failKey, OTP_FAIL_WINDOW)
          rlRecord(failEmailKey, OTP_FAIL_EMAIL_WINDOW)
          return json({ error: "Invalid or expired code." }, 401)
        }
        // Successful verify clears BOTH the per-(email,IP) and the per-email counters.
        rlClear(failKey)
        rlClear(failEmailKey)
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
      } catch (err: any) { return json(oops(err, "auth"), 500) }
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
        if (!description) return wjson({ error: "Description is required." }, 400)

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
          if (f.type && !f.type.startsWith("image/")) return wjson({ error: `Screenshot ${f.name} is not an image.` }, 400)
          if (f.size > 8 * 1024 * 1024) return wjson({ error: `Screenshot ${f.name} exceeds 8MB.` }, 400)
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

              // A01/IDOR: the sim_id is attacker-supplied. Before any trait/citation lookup, verify it
              // belongs to THIS project; if not, treat the persona as ephemeral (simId=null) so no
              // cross-tenant trait read happens. The report still persists with no citation (no 500).
              const rawSimId = String(form.get("sim_id") || "") || null
              const simId = rawSimId && (await listPersonas(projectId)).some((p) => p.id === rawSimId) ? rawSimId : null
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
              citation = await resolveCitations(simId, citedRaw, projectId)

              let dedupedInto: string | null = null
              if (suggestedBug) {
                dedupedInto = await findDuplicateFeedback({
                  projectId, urlPath, issueType: citation.issueType,
                  citedTraitIds: citation.citedTraitIds,
                  title: String(suggestedBug?.title || ""), observation,
                })
              }
              if (dedupedInto) {
                await bumpFeedbackRecurrence(dedupedInto, Date.now())
                feedbackId = dedupedInto
              } else {
                feedbackId = await insertFeedback({
                  projectId, simId, actorEmail: actor, urlHost, urlPath,
                  observation, sentiment, severity, screenshotId, suggestedBug,
                  citedTraitIds: citation.citedTraitIds.length ? citation.citedTraitIds : null,
                  sourceQuote: citation.sourceQuote, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate,
                  planeIssueKey: null, planeIssueUrl: null,
                  issueKey: suggestedBug ? issueKeyForFeedback(projectId, urlPath, citation.issueType, citation.citedTraitIds) : null,
                })
              }
              if (!dedupedInto) {
                await insertActivity({
                  projectId, type: "feedback_filed", actorEmail: actor, simId,
                  urlHost, urlPath, feedbackId, screenshotId,
                })
              }

              // ── auto-copy hook: fire-and-forget, never blocks the response ──
              // For each enabled auto-copy connector in this project, push the ticket.
              // Mirrors the recordAiCall fire-and-forget pattern.
              if (feedbackId && !dedupedInto) {
                const autoCopyFbId = feedbackId
                const autoCopyProjectId = projectId
                const autoCopyObservation = observation
                const autoCopyActor = actor
                void (async () => {
                  try {
                    const autoCopyConnectors = await listAutoCopyConnectors(autoCopyProjectId)
                    if (!autoCopyConnectors.length) return
                    // M6/ASI: bound auto-filed tickets per project so a burst of feedback (or injected
                    // AI content) can't flood the external tracker. Over the cap, skip auto-copy for this
                    // item (it's still persisted in our ledger and can be exported manually).
                    if (!rlAllow(`autocopy:${autoCopyProjectId}`, AUTOCOPY_PER_PROJECT, AUTOCOPY_WINDOW)) {
                      console.warn(`auto-copy rate cap hit for project ${autoCopyProjectId} — skipping`)
                      return
                    }
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
          return wjson({ id: feedbackId ?? "", saved: true })
        }

        // R8: append the Sim citation line to the issue body when this feedback cites a trait.
        const citeLine = citation ? citationLine({ sourceQuote: citation.sourceQuote, speaker: citation.speaker, sourceDate: citation.sourceDate, recurrence: citation.recurrence }) : null
        const description_html = buildIssueHtml(description, pageUrl, imageUrls) +
          (citeLine ? `<p><em>${escapeHtml(citeLine)}</em></p>` : "")
        // SSRF guard (H2): the Plane host can arrive from untrusted form input (direct mode is
        // unauthenticated). Block requests to internal/loopback/link-local addresses — including the
        // cloud metadata IP — and require https so the X-API-Key isn't sent in plaintext. Self-hosted
        // public Plane instances over https still pass.
        // SSRF guard must run BEFORE any outbound fetch — assertSafeUrl is preserved.
        // A rejected/unsafe host is now non-fatal: feedback was already persisted above.
        try { await assertSafeUrl(planeHost) }
        catch (e: any) {
          console.warn("tracker host rejected (non-fatal):", e?.message || e)
          return wjson({ id: feedbackId ?? "", saved: true })
        }
        // Use safeFetch so redirects are validated per-hop too (a public host that 3xx-redirects to an
        // internal/loopback target would otherwise bypass the one-shot assertSafeUrl above). The same
        // KLAV_TEST_ALLOW_LOOPBACK hatch the connectors use applies for the localhost-receiver tests.
        // Wrapped non-fatal: a tracker/SSRF rejection or network failure must never fail the user's submission.
        let res: Response
        try {
          res = await safeFetch(`${planeHost}/api/v1/workspaces/${planeWorkspace}/projects/${planeProject}/issues/`, {
            method: "POST",
            headers: { "X-API-Key": planeToken, "Content-Type": "application/json" },
            body: JSON.stringify({ name: `[Klavity] ${description.slice(0, 180)}`, description_html }),
          }, { allowLoopbackInTest: true })
        } catch (fetchErr: any) {
          console.error("Plane fetch failed (non-fatal):", fetchErr?.message || fetchErr)
          return wjson({ id: feedbackId ?? "", saved: true })
        }
        if (!res.ok) { console.error(`Plane API error ${res.status}: ${(await res.text()).slice(0, 300)}`); return wjson({ id: feedbackId ?? "", saved: true }) }

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

        return wjson({
          id: issueId,
          // Omit jira_key when Plane gives no sequence_id, so the extension's `?? id` fallback fires.
          ...(seq ? { jira_key: seq } : {}),
          issue_url: issueUrl,
        })
      } catch (e: any) {
        return json(oops(e, "feedback"), 500)
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
            accent: normAccent(body.accent),
            summary: String(body.summary || ""),
            insights: Array.isArray(body.insights) ? body.insights : [],
            avatar: body.avatar ? String(body.avatar) : null,
          })
          const [saved] = (await listPersonas(wid)).filter(p => p.id === id)
          return wjson({ persona: saved }, 201)
        } catch (e: any) { return wjson(oops(e, "persona"), 500) }
      }
      const idMatch = path.match(/^\/api\/personas\/([^/]+)$/)
      if (idMatch) {
        const pid = idMatch[1]
        if (req.method === "PUT") {
          try {
            const body = await req.json()
            const before = (await listPersonas(wid)).find(p => p.id === pid)
            // Access control (C2): PUT is edit-only. If this persona id isn't in the caller's project,
            // refuse — upsertPersona's ON CONFLICT(id) would otherwise overwrite another tenant's persona.
            if (!before) return wjson({ error: "Not found" }, 404)
            const now = Date.now()
            await upsertPersona(pid, wid, {
              name: String(body.name || "Unnamed"), role: String(body.role || ""),
              type: body.type === "internal" ? "internal" : "client",
              initials: String(body.initials || "").slice(0, 2).toUpperCase(),
              accent: normAccent(body.accent),
              summary: String(body.summary || ""),
              insights: Array.isArray(body.insights) ? body.insights : [],
              avatar: body.avatar ? String(body.avatar) : null,
            })
            // Version each changed identity field in the append-only persona_edits audit.
            if (before) {
              const fields: Array<[string, string | null, string | null]> = [
                ["name", before.name, String(body.name ?? "")],
                ["role", before.role, String(body.role ?? "")],
                ["summary", before.summary, String(body.summary ?? "")],
                ["type", before.type, String(body.type ?? "")],
                ["accent", before.accent, String(body.accent ?? "")],
              ]
              for (const [field, b, a] of fields) {
                if ((b ?? "") !== (a ?? "")) await insertPersonaEdit({ personaId: pid, projectId: wid, field, beforeVal: b, afterVal: a, actor: me2, createdAt: now })
              }
            }
            return wjson({ ok: true })
          } catch (e: any) { return wjson(oops(e, "persona"), 500) }
        }
        if (req.method === "DELETE") {
          await deletePersona(pid, wid)
          return wjson({ ok: true })
        }
      }
      const editsMatch = path.match(/^\/api\/personas\/([^/]+)\/edits$/)
      if (editsMatch && req.method === "GET") {
        const pid = editsMatch[1]
        // Access control (C1): listPersonaEdits is keyed only by persona id — verify the persona
        // belongs to the caller's project before returning its edit history (no cross-tenant leak).
        if (!(await listPersonas(wid)).some(p => p.id === pid)) return wjson({ error: "Not found" }, 404)
        return wjson({ personaId: pid, edits: await listPersonaEdits(pid) })
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
        } catch (e: any) { return json(oops(e, "signurl"), 500) }
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
            const allSimEvents: TraitEventRow[] = await listTraitEvents(sim.id, { projectId })
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
            const citation = await resolveCitations(sim.id, r?.citedTraitIds, projectId)
            const bug = r?.suggestedBug
            let dedupedInto: string | null = null
            if (bug) {
              dedupedInto = await findDuplicateFeedback({
                projectId, urlPath, issueType: citation.issueType,
                citedTraitIds: citation.citedTraitIds,
                title: String(bug?.title || ""), observation: r?.observation ?? "",
              })
            }
            let feedbackId: string
            if (dedupedInto) {
              await bumpFeedbackRecurrence(dedupedInto, Date.now())
              feedbackId = dedupedInto
              r.deduped = true
            } else {
              feedbackId = await insertFeedback({
                projectId, simId: sim.id, actorEmail: meR, urlHost, urlPath,
                observation: r?.observation ?? null, sentiment: r?.sentiment ?? null,
                severity: r?.suggestedBug?.severity ?? null, screenshotId, suggestedBug: r?.suggestedBug ?? null,
                citedTraitIds: citation.citedTraitIds.length ? citation.citedTraitIds : null,
                sourceQuote: citation.sourceQuote, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate,
                issueKey: bug ? issueKeyForFeedback(projectId, urlPath, citation.issueType, citation.citedTraitIds) : null,
              })
            }
            r.citation = citation.citedTraitIds.length
              ? { citedTraitIds: citation.citedTraitIds, sourceQuote: citation.sourceQuote, speaker: citation.speaker, sourceTranscriptId: citation.sourceTranscriptId, sourceDate: citation.sourceDate, sourceQuoteVerified: citation.sourceQuoteVerified, recurrence: citation.recurrence }
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

    // ── transcripts → list (Sim Studio col 1) — project-scoped; cookie OR Bearer; newest-first by sourceDate ──
    if (req.method === "GET" && path === "/api/transcripts") {
      const me2 = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!me2) return json({ error: "Sign in to continue." }, 401)
      const proj2 = await resolveProject(me2, url.searchParams.get("project"))
      if (!proj2) return json({ error: "No project." }, 400)
      const transcripts = await listTranscripts(proj2.id)
      return json({ transcripts }, 200)
    }

    // ── transcripts → reconcile (P3a) — project-scoped via resolveProject; cookie OR Bearer; admin or member ──
    if (req.method === "POST" && path === "/api/transcripts") {
      const meT = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meT) return json({ error: "Sign in to continue." }, 401)
      const projT = await resolveProject(meT, url.searchParams.get("project"))
      if (!projT) return json({ error: "No project." }, 400)
      const projectId = projT.id
      // M5: rate-limit this 2-LLM-call endpoint per user AND per project (it has no daily budget gate).
      if (!rlAllow(`tx:u:${meT}`, TRANSCRIPT_PER_USER, TRANSCRIPT_WINDOW) || !rlAllow(`tx:p:${projectId}`, TRANSCRIPT_PER_PROJECT, TRANSCRIPT_WINDOW))
        return json({ error: "Too many transcript submissions. Please wait and try again." }, 429, { "Retry-After": "3600" })
      try {
        const body = await req.json().catch(() => ({}))
        const text = String(body.transcript || body.raw_text || "").trim()
        if (text.length < 20) return json({ error: "Transcript too short" }, 400)
        if (text.length > TRANSCRIPT_MAX_CHARS) return json({ error: `Transcript too large (max ${TRANSCRIPT_MAX_CHARS.toLocaleString()} characters).` }, 413)
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
          const res = applyReconcileOps(traitsForApply, ops, { simId, projectId, transcriptId, sourceDate, rawText: text })
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
      } catch (e: any) { return json(oops(e, "transcript"), 500) }
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
              traitId: e.traitId,
              afterText: e.afterText,
              beforeText: e.beforeText,
              quote: e.quote,
              speaker: e.speaker,
              sourceDate: e.sourceDate,
              transcriptId: e.transcriptId,
              transcriptTitle: titleById.has(e.transcriptId) ? titleById.get(e.transcriptId) : null,
              reason: e.reason,
              createdAt: e.createdAt,
              actor: e.actor ?? null,
              area: e.area ?? null,
              issueType: e.issueType ?? null,
              severity: e.severity ?? null,
              // isRegression: true marks a post-resolution reopen/reinforce so the UI can highlight it.
              isRegression: regressionEventKeys.has(`${e.traitId}:${e.createdAt}`),
            }))
          return json({ simId, name: sim.name, events: timeline })
        } catch (e: any) { return json(oops(e, "evolution"), 500) }
      }
    }

    // ── Sim Studio: versioned trait editing (list / manual create) — project-scoped, cookie OR Bearer ──
    {
      const m = path.match(/^\/api\/sims\/([^/]+)\/traits$/)
      if (m && (req.method === "GET" || req.method === "POST")) {
        const me2 = (await sessionEmail(req)) || (await bearerEmail(req))
        if (!me2) return json({ error: "Sign in to continue." }, 401)
        const proj2 = await resolveProject(me2, url.searchParams.get("project"))
        if (!proj2) return json({ error: "No project." }, 400)
        const simId = m[1]
        // Access control (C1): trait routes are keyed only by sim id — verify the Sim belongs to the
        // caller's resolved project before reading or writing its traits (no cross-tenant IDOR).
        if (!(await listPersonas(proj2.id)).some(p => p.id === simId)) return json({ error: "Not found" }, 404)
        if (req.method === "POST") {
          const body = await req.json().catch(() => ({}))
          const kind = ["pain", "want", "love"].includes(body.kind) ? body.kind : "pain"
          const now = Date.now()
          const trait = {
            id: "trait_" + crypto.randomUUID(), simId, projectId: proj2.id,
            kind, text: String(body.text || "").trim(), status: "active" as const, strength: 1,
            srcTranscriptId: String(body.srcTranscriptId || "manual"),
            srcQuote: String(body.srcQuote || ""), srcQuoteOffset: null,
            srcSpeaker: body.srcSpeaker ? String(body.srcSpeaker) : null,
            area: body.area ? String(body.area) : null, issueType: null,
            severity: body.severity ? String(body.severity) : null,
            createdAt: now, updatedAt: now,
          }
          if (!trait.text) return json({ error: "text required" }, 400)
          await logTraitEdit({ op: "manual_create", trait, beforeText: null, actor: me2, now })
          return json({ trait }, 201)
        }
        const traits = await listTraits(simId, { activeOnly: true })
        return json({ simId, traits })
      }
    }
    // ── Sim Studio: edit / soft-archive a single trait (versioned) — project-scoped ──
    {
      const m = path.match(/^\/api\/sims\/([^/]+)\/traits\/([^/]+)$/)
      if (m && (req.method === "PUT" || req.method === "DELETE")) {
        const me2 = (await sessionEmail(req)) || (await bearerEmail(req))
        if (!me2) return json({ error: "Sign in to continue." }, 401)
        const proj2 = await resolveProject(me2, url.searchParams.get("project"))
        if (!proj2) return json({ error: "No project." }, 400)
        const [, simId, traitId] = m
        // Access control (C1): verify the Sim belongs to the caller's project before editing/archiving
        // its traits — listTraits is keyed only by sim id, so without this an attacker could mutate
        // another tenant's traits by id (cross-tenant IDOR).
        if (!(await listPersonas(proj2.id)).some(p => p.id === simId)) return json({ error: "Not found" }, 404)
        const current = (await listTraits(simId)).find(t => t.id === traitId)
        if (!current) return json({ error: "Trait not found." }, 404)
        const now = Date.now()
        if (req.method === "DELETE") {
          await logTraitEdit({ op: "manual_archive", trait: { ...current, status: "archived", updatedAt: now }, beforeText: current.text, actor: me2, now })
          return json({ ok: true })
        }
        const body = await req.json().catch(() => ({}))
        const next = {
          ...current,
          text: body.text != null ? String(body.text).trim() : current.text,
          kind: ["pain", "want", "love"].includes(body.kind) ? body.kind : current.kind,
          severity: body.severity != null ? String(body.severity) : current.severity,
          area: body.area != null ? String(body.area) : current.area,
          updatedAt: now,
        }
        await logTraitEdit({ op: "edit", trait: next, beforeText: current.text, actor: me2, now })
        return json({ trait: next })
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
      catch (e: any) { return json(oops(e, "transcripts"), 500) }
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

    // Public widget appearance config (non-sensitive; project-scoped). Lets the widget theme itself pre-auth.
    // When ?admin=1 is present the request is from the admin UI and must fall through to the session-gated
    // projMatch block which returns { modalConfig, pro } — do NOT handle it here.
    {
      const m = path.match(/^\/api\/projects\/([^/]+)\/config$/)
      if (req.method === "GET" && m && new URL(req.url).searchParams.get("admin") !== "1") {
        const proj = await projectById(m[1])
        if (!proj) return json({ error: "Not found." }, 404)
        return json({ modalConfig: resolveModalConfig(await getProjectModalConfig(m[1])) })
      }
    }

    // ── everything below requires a session ──
    const me = await sessionEmail(req)
    const needLogin = () => (req.method === "GET" ? redirect("/login") : json({ error: "Sign in to continue." }, 401))

    if (req.method === "GET" && path === "/dashboard") return me ? file(PUB + "/dashboard.html") : redirect("/login")
    if (req.method === "GET" && path === "/trails") return me ? file(PUB + "/trails.html") : redirect("/login")
    // Plan G — served demo fixtures the seeded demo Trails walk against (public, non-sensitive HTML).
    // Sanitized: reject path traversal; serve only from PUB/trails-demo. No auth (a Walk hits these
    // unauthenticated, same-origin) — the files are bundled static fixtures, never user data.
    if (req.method === "GET" && path.startsWith("/trails-demo/")) {
      const rel = decodeURIComponent(path.slice("/trails-demo/".length))
      if (rel.includes("..") || rel.includes("\\") || rel.startsWith("/")) return new Response("Not found", { status: 404 })
      // Derive the content-type from the file extension (Bun.file(...).type), falling back to text/html
      // for extensionless/unknown fixtures, so a bundled .css/.js/.svg demo asset isn't mis-served as HTML.
      const demoFile = Bun.file(PUB + "/trails-demo/" + rel)
      return new Response(demoFile, { headers: { "content-type": demoFile.type || "text/html; charset=utf-8" } })
    }
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

    // ── Klavity OS Trails (Layer E) — project-scoped, authed. Placed before the generic /api/ gate so
    // unauthenticated API calls return a JSON 401 (not a /login redirect), mirroring resolveProject usage.
    if (path === "/api/trails/dashboard" || path.startsWith("/api/trails/findings/") || path.startsWith("/api/trails/walks/") || /^\/api\/trails\/[^/]+\/walk$/.test(path)) {
      const meT = (await sessionEmail(req)) || (await bearerEmail(req))
      if (!meT) return json({ error: "Unauthorized" }, 401)
      const resolved = await resolveProject(meT, url.searchParams.get("project"))
      if (!resolved) return json({ error: "No access" }, 403)
      const projectId = resolved.id

      // GET /api/trails/dashboard — trails + recent walks + review queue + precision.
      if (req.method === "GET" && path === "/api/trails/dashboard") {
        try {
          const data = await trailsDashboardData(projectId)
          // Annotate each recent Walk with whether it has a saved rrweb replay (one project-scoped
          // query) so the dashboard shows the "▶ Replay" affordance only where there's a recording.
          const haveReplay = await runsWithReplay(projectId, data.recentWalks.map((w) => w.id))
          const recentWalks = data.recentWalks.map((w) => ({ ...w, hasReplay: haveReplay.has(w.id) }))
          return json({ email: meT, project: { id: projectId, role: resolved.access }, ...data, recentWalks })
        } catch (e) {
          return json(oops(e, "trails-dashboard"), 500)
        }
      }

      // GET /api/trails/walks/:runId/replay — the saved rrweb session-replay segments for a Walk +
      // its run_steps (so the player can mark verdicts / seek to the failing step). Project-scoped;
      // 404 when the Walk has no replay (capture was off, or this runId is foreign/nonexistent).
      const replayMatch = path.match(/^\/api\/trails\/walks\/([^/]+)\/replay$/)
      if (req.method === "GET" && replayMatch) {
        try {
          const runId = replayMatch[1]
          const segments = await getReplay(projectId, runId)
          if (!segments) return json({ error: "No replay for this walk." }, 404)
          const steps = await listRunSteps(projectId, runId)
          return json({ runId, segments, steps })
        } catch (e) {
          return json(oops(e, "trails-replay"), 500)
        }
      }

      // POST /api/trails/findings/:id/file — human files a queued finding to the project connector.
      const fileMatch = path.match(/^\/api\/trails\/findings\/([^/]+)\/file$/)
      if (req.method === "POST" && fileMatch) {
        try {
          const r = await fileFindingById(projectId, fileMatch[1], { filer: realFiler })
          if (!r.ok) return json({ ok: false, error: "Could not file (no connector or no such finding)." }, 400)
          return json({ ok: true, connectorRef: r.connectorRef })
        } catch (e) {
          return json(oops(e, "trails-file"), 500)
        }
      }

      // POST /api/trails/findings/:id/dismiss — human dismisses a queued finding.
      // dismissFinding only acts on an existing, in-project, currently-queued finding; a no-op (missing /
      // foreign-project / non-queued id) returns 404 rather than a misleading 200, and a cross-project
      // write is impossible because the lookup is project-scoped.
      const dismissMatch = path.match(/^\/api\/trails\/findings\/([^/]+)\/dismiss$/)
      if (req.method === "POST" && dismissMatch) {
        try {
          const ok = await dismissFinding(projectId, dismissMatch[1])
          if (!ok) return json({ ok: false, error: "No such queued finding." }, 404)
          return json({ ok: true })
        } catch (e) {
          return json(oops(e, "trails-dismiss"), 500)
        }
      }

      // POST /api/trails/:id/walk — trigger an on-demand Walk. runWalkNow reserves the single walk-slot
      // and returns a runId immediately (the walk runs in the background, crash-isolated); the
      // dashboard polls /api/trails/dashboard until the verdict lands. A 2nd concurrent trigger → 409
      // (never a 2nd browser on the 1GB box); an unknown trail → 404.
      const walkMatch = path.match(/^\/api\/trails\/([^/]+)\/walk$/)
      if (req.method === "POST" && walkMatch) {
        try {
          const { runId } = await runWalkNow(projectId, walkMatch[1])
          return json({ runId })
        } catch (e: any) {
          if (e instanceof WalkBusyError) return json({ error: "A walk is already running" }, 409)
          if (String(e?.message || e) === "trail not found") return json({ error: "No such trail" }, 404)
          return json(oops(e, "trails-walk"), 500)
        }
      }

      return json({ error: "Not found" }, 404)
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
          return json(oops(e, "dashboard"), 500)
        }
      }

      // Returns the current session ID as a Bearer token — the extension uses this to sync sims.
      if (req.method === "GET" && path === "/api/extension-token") {
        // M2: mint a dedicated, revocable ext_ token bound to the session's user instead of handing the
        // raw 7-day session id to the extension. A leaked ext_ token is narrow-scope and revocable; a
        // leaked session id is full account access.
        const sid = parseCookies(req.headers.get("cookie"))["klav_session"]
        if (!sid) return json({ error: "No session." }, 401)
        const tokEmail = await getSession(sid)
        if (!tokEmail) return json({ error: "No session." }, 401)
        const extToken = await issueExtensionToken(tokEmail, null, SESSION_DAYS * 24 * 60 * 60 * 1000)
        return json({ token: extToken })
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
            // A10: log the raw error server-side (with a correlation id) and store it on the export row,
            // but return ONLY a generic message + id to the client so guard/internal text can't leak.
            const o = oops(e, "export")
            await addTicketExport({
              feedbackId: fid, projectId: fbRow.projectId, connectorId,
              type: connector.type, externalKey: null, externalUrl: null,
              status: "failed", error: (e as any)?.message || "Export failed", createdBy: me,
            })
            exportResult = { type: connector.type, externalKey: null, externalUrl: null, status: "failed", error: `${o.error} (ref ${o.id})` }
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
      const projMatch = path.match(/^\/api\/projects\/([^/]+?)(\/members|\/invite|\/activity|\/rename|\/config|\/monitored-urls(?:\/[^/]+)?|\/connectors(?:\/[^/]+)?(?:\/test)?)?$/)
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
              // A10: never echo guard/upstream/internal text — generic message + logged correlation id.
              const o = oops(e, "connector-test")
              return json({ ok: false, error: o.error, id: o.id })
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
              // A10: generic message + logged correlation id (no guard/upstream leak).
              const o = oops(e, "connector-test")
              return json({ ok: false, error: o.error, id: o.id })
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

        // Report widget appearance config — admin-only write.
        if (sub === "/config") {
          if (req.method === "POST") {
            if (access !== "admin") return json({ error: "Only project admins can change widget appearance." }, 403)
            const body = await req.json().catch(() => ({}))
            const pro = await isAccountPro(proj.accountId)
            const v = validateModalConfigInput(body, { isPro: pro })
            if (!v.ok) return json({ error: v.error }, 400)
            await setProjectModalConfig(pid, v.config as any)
            return json({ ok: true, modalConfig: v.config, pro })
          }
          // GET here (session-authed) returns current + pro flag for the admin UI
          return json({ modalConfig: resolveModalConfig(await getProjectModalConfig(pid)), pro: await isAccountPro(proj.accountId) })
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
          if (String(brief).length > AI_DEMO_MAX_CHARS) return json({ error: "Brief too long." }, 413)
          const sys = "Create ONE believable user persona (a \"Sim\") from the user's brief. Invent a plausible first+last name and a role. " +
            "Respond with ONLY a JSON object, no prose: {\"persona\":{\"name\":string,\"role\":string,\"type\":\"client\"|\"internal\",\"initials\":string(2 uppercase letters),\"accent\":string(hex colour like #6366f1),\"summary\":string,\"insights\":[{\"kind\":\"pain\"|\"want\"|\"love\",\"text\":string,\"quote\":string}]}} with exactly 3 insights; each quote is a short first-person line this persona might actually say."
          const meB = (await sessionEmail(req)) || (await bearerEmail(req))
          if (aiDemoLimited(meB, req, server)) return json({ error: "Too many requests. Please wait and try again." }, 429, { "Retry-After": "3600" })
          const { content, usage } = await chat([{ role: "system", content: sys }, { role: "user", content: "Brief: " + brief }], 1200, true, { type: "persona", email: meB })
          const data = parseJSON(content)
          return json({ persona: data.persona, usage })
        } catch (e: any) { return json(oops(e, "create"), 500) }
      }
      // gated AI
      if (req.method === "POST" && path === "/api/extract") {
        try {
          const { transcript } = await req.json()
          if (!transcript || transcript.trim().length < 20) return json({ error: "Transcript too short" }, 400)
          if (String(transcript).length > AI_DEMO_MAX_CHARS) return json({ error: "Transcript too large." }, 413)
          const meE = (await sessionEmail(req)) || (await bearerEmail(req))
          if (aiDemoLimited(meE, req, server)) return json({ error: "Too many requests. Please wait and try again." }, 429, { "Retry-After": "3600" })
          const { data, usage } = await extractPersonas(transcript, { email: meE })
          return json({ personas: data.personas || [], usage })
        } catch (e: any) { return json(oops(e, "extract"), 500) }
      }
      if (req.method === "POST" && path === "/api/react") {
        try {
          const { persona, imageB64, mediaType, pageUrl } = await req.json()
          if (!persona || !imageB64) return json({ error: "persona and imageB64 required" }, 400)
          if (String(imageB64).length > AI_DEMO_MAX_IMG_B64) return json({ error: "Image too large." }, 413)
          const meRx = (await sessionEmail(req)) || (await bearerEmail(req))
          if (aiDemoLimited(meRx, req, server)) return json({ error: "Too many requests. Please wait and try again." }, 429, { "Retry-After": "3600" })
          // A01/IDOR: persona.id is attacker-supplied. Resolve the caller's project and only treat the
          // id as a real Sim when it belongs to that project — otherwise it's an EPHEMERAL persona
          // (simId=null) so no cross-tenant trait/citation lookup happens. The AI call still proceeds.
          const projRx = meRx ? await resolveProject(meRx, url.searchParams.get("project")) : null
          const rawSimId = persona?.id ? String(persona.id) : null
          const simId = rawSimId && projRx && (await listPersonas(projRx.id)).some((p) => p.id === rawSimId) ? rawSimId : null

          // Build regression-gated recurrence memory for this Sim's traits before calling reactToPage.
          // Only attach recurrenceMemory when regressed=true; mere recurrence does not warrant disappointment.
          let personaWithMemory = persona
          if (simId) {
            try {
              const allSimEvents: TraitEventRow[] = await listTraitEvents(simId, projRx ? { projectId: projRx.id } : {})
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
            const cited = await resolveCitations(simId, r?.citedTraitIds, projRx?.id)
            r.citation = cited.citedTraitIds.length
              ? { citedTraitIds: cited.citedTraitIds, sourceQuote: cited.sourceQuote, speaker: cited.speaker, sourceTranscriptId: cited.sourceTranscriptId, sourceDate: cited.sourceDate, recurrence: cited.recurrence }
              : null
          }
          return json({ reactions, usage })
        } catch (e: any) { return json(oops(e, "react"), 500) }
      }
      return json({ error: "Not found" }, 404)
    }

    return new Response("Not found", { status: 404 })
}

Bun.serve({
  port: PORT,
  idleTimeout: 180,
  async fetch(req, server) {
    // Establish per-request context (for F5 token-project binding) and apply security headers to every
    // response from a single chokepoint.
    return reqCtx.run({}, async () => withSecurityHeaders(await handle(req, server)))
  },
})

console.log(`\n⚡ Klavity app → ${BASE}`)
console.log(`   model: ${MODEL} · auth: ${db ? "Turso OTP" : "DISABLED (no Turso)"} · dev-otp: ${DEV_SHOW_OTP}\n`)

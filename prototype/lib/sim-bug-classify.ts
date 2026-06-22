// sim-bug-classify.ts
//
// Pure, DB-free heuristic that decides whether a Sim's free-text observation is describing a
// BROKEN / STUCK / BLOCKED / empty state — i.e. a real bug we should surface instead of bury as
// "noise". Used by the /api/sim/review ingest: when the LLM didn't already attach a suggestedBug
// but the observation text clearly signals breakage, we synthesise a bug candidate so it flows
// through the normal bug path (severity-driven triage, Plane auto-copy, expectations spine).
//
// Two confidence tiers map onto the existing triage gate (lib/db.ts initialFeedbackStatus):
//   - "high"   → auto-accepted straight to an OPEN bug (surfaced at the top of triage)
//   - "medium" → stays in the "new" triage queue, but carries the sim-flagged marker; recurrence
//                across multiple Sims (recurrence_count ≥ 3) later promotes it to OPEN.
// Recurrence is therefore the second lever the task asks for — same issue flagged by multiple
// Sims becomes a stronger signal automatically, via the dedup + bumpFeedbackRecurrence path.

export type SimBugVerdict = {
  flagged: boolean
  severity: "high" | "medium" | null
  signals: string[]
}

// STRONG signals — unambiguous breakage. Matching any → high severity (auto-accept to open).
const HARD: Array<{ re: RegExp; signal: string }> = [
  { re: /\bnever\s+load(?:s|ed|ing)?\b/i,                                            signal: "never loads" },
  { re: /\b(?:won'?t|will not|can'?t|cannot|does(?:n'?t| not)|unable to|fail(?:s|ed)? to)\s+load\b/i, signal: "won’t load" },
  { re: /\b(?:is |gets? |getting |just )?stuck\b/i,                                  signal: "stuck" },
  { re: /\b(?:infinite|endless|forever)\s+(?:load|loading|spinner|spin)\b|\b(?:load(?:s|ing)?|spin(?:s|ning)?)\s+forever\b/i, signal: "infinite loading" },
  { re: /\bnothing\s+(?:happens?|happened|loads?|loaded|shows?|showed|appears?|appeared)\b/i, signal: "nothing happens" },
  { re: /\b(?:not|isn'?t|aren'?t)\s+work(?:ing)?\b|\b(?:does(?:n'?t| not)|won'?t|will not|wont)\s+work\b|\bnot functioning\b/i, signal: "not working" },
  { re: /\bbroken\b/i,                                                               signal: "broken" },
  { re: /\bcrash(?:es|ed|ing)?\b/i,                                                  signal: "crash" },
  { re: /\b(?:frozen|freez(?:e|es|ing)|froze)\b/i,                                   signal: "frozen" },
  { re: /\bunresponsive\b/i,                                                         signal: "unresponsive" },
  { re: /\bdead[\s-]?end\b/i,                                                        signal: "dead end" },
  { re: /\b(?:blank|empty)\s+(?:screen|page)\b|\bpage\s+is\s+blank\b|\bcompletely\s+blank\b/i, signal: "blank screen" },
  { re: /\b(?:404|500|503)\b|\bnot\s+found\b|\bserver\s+error\b/i,                   signal: "error page" },
]

// SOFT signals — empty / loading / blocked states. Matching → medium severity (triage queue),
// UNLESS the observation reads positive (see POSITIVE). Recurrence later promotes these.
const SOFT: Array<{ re: RegExp; signal: string }> = [
  { re: /\bstill\s+loading\b/i,                                          signal: "still loading" },
  { re: /\bskeleton(?:s|\s+(?:screen|loader|state))?\b/i,                signal: "skeleton" },
  { re: /\b(?:loading\s+)?spinner(?:s)?\b|\bspinning\b/i,                signal: "spinner" },
  { re: /\bempty\s+(?:box(?:es)?|state|page|list|screen|table|cards?)\b|\bjust\s+empty\b/i, signal: "empty state" },
  { re: /\bblank\b/i,                                                    signal: "blank" },
  { re: /\b(?:can'?t|cannot)\s+(?:see|find)\b|\bnothing\s+to\s+see\b/i,  signal: "cannot see" },
  { re: /\bblocked\b/i,                                                  signal: "blocked" },
  { re: /\bplaceholder(?:s)?\b/i,                                        signal: "placeholder" },
]

// "error(s)" is high-value but easily negated ("no errors", "without error"). Handle separately.
const ERROR_RE = /\berror(?:s|ed)?\b/i
const ERROR_NEGATED = /\b(?:no|without|zero|0|free of|free from)\s+(?:\w+\s+){0,1}errors?\b|\berror[-\s]?free\b/i

// Positive context that should suppress SOFT (ambiguous) signals — but never the HARD ones.
const POSITIVE = /\b(?:load(?:s|ed)?|render(?:s|ed)?|show(?:s|ed)?|come(?:s)? up|appear(?:s|ed)?)\s+(?:fast|quickly|instantly|fine|nicely|correctly|right away|immediately|without (?:a |any )?(?:issue|problem|delay))\b|\bworks?\s+(?:fine|well|great|perfectly|smoothly|as expected)\b|\bno\s+(?:issues?|problems?|errors?)\b|\blooks?\s+(?:good|great|clean|fine|polished)\b|\beverything\s+(?:works?|loaded|loads|is fine)\b|\bsmooth(?:ly)?\b|\bno\s+problem\b|\bfast\s+and\b/i

const NEG_SENTIMENT = new Set(["frustrated", "confused", "angry", "annoyed", "stuck", "lost", "negative"])
const POS_SENTIMENT = new Set(["happy", "delighted", "satisfied", "pleased", "positive", "love"])

/**
 * Classify a Sim observation. `observation` is the free text; `sentiment` is the optional
 * Sim-reported mood. Returns whether it reads as a bug + a confidence-mapped severity + the
 * matched signal phrases (for the marker / ticket body).
 */
export function classifySimObservation(observation: unknown, sentiment?: unknown): SimBugVerdict {
  const text = String(observation ?? "").trim()
  const NONE: SimBugVerdict = { flagged: false, severity: null, signals: [] }
  if (!text) return NONE

  const sent = String(sentiment ?? "").toLowerCase()
  const negSent = NEG_SENTIMENT.has(sent)
  const posSent = POS_SENTIMENT.has(sent)

  const hard: string[] = []
  for (const { re, signal } of HARD) if (re.test(text) && !hard.includes(signal)) hard.push(signal)
  // "error" counts as hard unless it's explicitly negated ("no errors", "error-free").
  if (ERROR_RE.test(text) && !ERROR_NEGATED.test(text) && !hard.includes("error")) hard.push("error")

  if (hard.length) return { flagged: true, severity: "high", signals: hard }

  const soft: string[] = []
  for (const { re, signal } of SOFT) if (re.test(text) && !soft.includes(signal)) soft.push(signal)

  // Suppress ambiguous SOFT signals when the observation reads positive (and the Sim isn't
  // explicitly frustrated/confused, which would override a stray positive phrase).
  const positiveContext = !negSent && (POSITIVE.test(text) || posSent)
  if (soft.length && !positiveContext) return { flagged: true, severity: "medium", signals: soft }

  return NONE
}

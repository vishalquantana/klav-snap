/**
 * feedback-trigger.ts
 *
 * Pure functions for smart feedback triggering + dedup (Task 1).
 * NO DOM, NO browser APIs, NO chrome.* — fully unit-testable.
 */

// ---------------------------------------------------------------------------
// Tunable consts (imported by Tasks 2+)
// ---------------------------------------------------------------------------

/** Trailing-edge debounce across all change sources (ms). */
export const DEBOUNCE_MS = 1000;

/** Minimum time between reviews on the same route after a review is confirmed (ms). */
export const ROUTE_COOLDOWN_MS = 8000;

/** Max reviews allowed per page-load route before the per-route cap blocks. */
export const MAX_REVIEWS_PER_ROUTE = 6;

// ---------------------------------------------------------------------------
// klavContentSig
// ---------------------------------------------------------------------------

export interface ContentSigInput {
  /** location.host — prefix for cross-host disambiguation */
  host: string;
  /** document.title — normalized to ≤80 chars */
  title: string;
  /** structural element counts */
  counts: {
    headings: number;
    buttons: number;
    links: number;
    fields: number;
  };
  /** caller-derived structural fingerprint of the visible region (no raw text) */
  region: string;
}

/**
 * Deterministic, host-prefixed, structural-only content signature.
 * Stable across no-op re-renders; discriminates on host/title/counts/region.
 * Contains NO raw or hashed visible text (consent-safe).
 */
export function klavContentSig(input: ContentSigInput): string {
  const { host, title, counts, region } = input;
  const normalizedTitle = title.slice(0, 80);
  const { headings, buttons, links, fields } = counts;
  return `${host}|${normalizedTitle}|h:${headings}|b:${buttons}|l:${links}|f:${fields}|${region}`;
}

// ---------------------------------------------------------------------------
// shouldCapture
// ---------------------------------------------------------------------------

export interface CaptureState {
  /** Content signature of the current DOM moment. */
  nowSig: string;
  /** Signature of the last successfully sent review (null if none yet). */
  lastSentSig: string | null;
  /** Current timestamp (Date.now()). */
  now: number;
  /** Timestamp until which captures are suppressed (set after confirmed review). */
  cooldownUntil: number;
  /** Whether the user has paused the extension. */
  paused: boolean;
  /** Number of reviews already sent on this route load. */
  routeCount: number;
  /** Per-route review cap. */
  cap: number;
}

export interface CaptureDecision {
  capture: boolean;
  reason: "ok" | "unchanged" | "cooldown" | "paused" | "cap";
}

/**
 * Pure gating function — decides whether a capture+review should proceed.
 * Priority order: unchanged → cooldown → paused → cap → ok.
 */
export function shouldCapture(s: CaptureState): CaptureDecision {
  if (s.lastSentSig !== null && s.nowSig === s.lastSentSig) {
    return { capture: false, reason: "unchanged" };
  }
  if (s.now < s.cooldownUntil) {
    return { capture: false, reason: "cooldown" };
  }
  if (s.paused) {
    return { capture: false, reason: "paused" };
  }
  if (s.routeCount >= s.cap) {
    return { capture: false, reason: "cap" };
  }
  return { capture: true, reason: "ok" };
}

// packages/sdk/src/sims-watch.ts
// Live Sims change-detection and watch engine.
//
// Observes three signals on the current page:
//   1. Scroll (debounced ~700ms) — user explored a new viewport region
//   2. Navigation (history pushState/replaceState + popstate) — SPA route changed
//   3. Significant DOM mutation (MutationObserver, debounced ~800ms) — a panel/dialog/
//      major content block appeared (e.g. chatbot sidebar, modal, article swap)
//
// On each meaningful change: computes a lightweight viewport hash, skips if recently reviewed
// or hash unchanged, captures the viewport, POSTs to /api/sim/review, and for each returned
// Sim review calls window.KlavitySims?.renderFeedback(...) (Dev 2's UI layer).
//
// COST GUARD: minIntervalMs (default 30s) + seenHashes Set prevent duplicate AI calls on
// every tiny scroll or repeated mutation wave.
//
// Pure helpers (djb2, computeContentHash, shouldSkipReview, isSignificantNode,
// hasSignificantMutations) are exported for unit testing; DOM wiring is a thin shim.

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────────────────────

/** DJB2 hash over a string — fast, stable, no dependencies. Returns unsigned 32-bit int. */
export function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

/**
 * Lightweight fingerprint of the current viewport state. Used client-side to skip unchanged
 * views AND as the `domSig` sent to the server for per-Sim deduplication.
 *
 * scrollY is bucketed to 50px so minor scroll drift (e.g. sticky header collapse) doesn't
 * produce a new hash — only navigating to a genuinely different viewport area does.
 */
export function computeContentHash(
  scrollY: number,
  docHeight: number,
  viewportW: number,
  viewportH: number,
  title: string,
  urlPath: string,
): string {
  const bucket = Math.round(scrollY / 50) * 50
  return djb2(`${bucket}:${docHeight}:${viewportW}x${viewportH}:${urlPath}:${title.slice(0, 80)}`).toString(36)
}

/**
 * Returns true when a review should be skipped because:
 *   – less than minIntervalMs has elapsed since the last review (throttle), OR
 *   – this exact hash was already reviewed this session (content unchanged).
 */
export function shouldSkipReview(
  hash: string,
  seenHashes: ReadonlySet<string>,
  lastReviewAt: number,
  nowMs: number,
  minIntervalMs: number,
): boolean {
  if (nowMs - lastReviewAt < minIntervalMs) return true
  return seenHashes.has(hash)
}

/**
 * True when an added DOM node qualifies as "significant new content":
 *   – a semantic landmark with role=dialog/main/complementary/…, OR
 *   – a class matching common panel/modal/chat/drawer patterns, OR
 *   – a large visible footprint (≥ 100 × 100 px).
 * Ignores metadata nodes (script/style/meta/link) and invisible tiny elements.
 */
export function isSignificantNode(el: Element): boolean {
  const tag = el.tagName?.toUpperCase() ?? ''
  if (['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'NOSCRIPT'].includes(tag)) return false

  // ARIA landmark roles that unambiguously signal important content.
  const role = el.getAttribute?.('role') ?? ''
  if (['dialog', 'main', 'complementary', 'banner', 'navigation', 'feed', 'log'].includes(role)) return true

  // Common panel / modal / messaging class-name patterns (case-insensitive substring scan).
  const cls = el.className
  if (typeof cls === 'string' && cls) {
    if (/(modal|dialog|drawer|panel|sidebar|chat|message|overlay|sheet|toast|alert|notification|feed|article)/i.test(cls)) return true
  }

  // Geometry fallback — treat a large visible rectangle as significant.
  if (typeof (el as HTMLElement).getBoundingClientRect === 'function') {
    const r = (el as HTMLElement).getBoundingClientRect()
    return r.width >= 100 && r.height >= 100
  }
  // Headless / test environment: use offsetHeight/offsetWidth if available.
  const h = (el as HTMLElement).offsetHeight ?? 0
  const w = (el as HTMLElement).offsetWidth ?? 0
  return h >= 100 && w >= 100
}

/**
 * Returns true when a MutationObserver batch contains at least one significant structural
 * addition. Attribute-only mutations and tiny text-node insertions are ignored.
 */
export function hasSignificantMutations(mutations: MutationRecord[]): boolean {
  for (const m of mutations) {
    if (m.type !== 'childList') continue
    for (const node of Array.from(m.addedNodes)) {
      if (node.nodeType === 1 /* ELEMENT_NODE */ && isSignificantNode(node as Element)) return true
    }
  }
  return false
}

// ── DOM wiring (thin shim — manual-verify in browser) ─────────────────────────────────────

const DEFAULT_MIN_INTERVAL_MS = 30_000   // 30s between AI review calls
const DEFAULT_SCROLL_DEBOUNCE_MS = 700
const DEFAULT_MUTATION_DEBOUNCE_MS = 800
const MAX_SEEN_HASHES = 200              // cap the client-side dedup set (memory guard)

export interface SimsWatchOptions {
  /** Base URL of the Klavity backend, e.g. "https://klavity.quantana.top". */
  backendUrl: string
  /** Project to attribute Sim reviews to. Required for adhoc mode. */
  projectId: string
  /** Restrict to specific Sim IDs. Omit to target all project Sims. */
  simIds?: string[]
  /**
   * Viewport capture function — injected for widget/extension parity.
   * Widget: `() => safeToPng(document.body, { skipFonts: true })`
   * Extension: `() => captureVisibleTab()`
   */
  captureViewport: () => Promise<string>
  /** Bearer token for Klavity API auth (widget session token or account token). */
  bearerToken?: string
  /** Minimum gap between successive review API calls in ms. Default 30 000. */
  minIntervalMs?: number
  /** Scroll debounce delay in ms. Default 700. */
  scrollDebounceMs?: number
  /** DOM mutation debounce delay in ms. Default 800. */
  mutationDebounceMs?: number
}

export interface SimsWatchController {
  /** Tear down all listeners, timers, and observers. Safe to call multiple times. */
  stop: () => void
}

/**
 * Start the Live Sims change-detection engine.
 *
 * Wires scroll, navigation (pushState/replaceState/popstate), and MutationObserver signals;
 * debounces each to avoid hammering the AI; then drives the capture → /api/sim/review →
 * window.KlavitySims.renderFeedback pipeline.
 *
 * Returns a controller with `stop()` to remove all listeners and restore patched history methods.
 */
export function startSimsWatch(opts: SimsWatchOptions): SimsWatchController {
  const minInterval = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  const scrollDebounce = opts.scrollDebounceMs ?? DEFAULT_SCROLL_DEBOUNCE_MS
  const mutationDebounce = opts.mutationDebounceMs ?? DEFAULT_MUTATION_DEBOUNCE_MS

  let stopped = false
  let busy = false
  let lastReviewAt = 0
  const seenHashes = new Set<string>()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // ── Core review pipeline ─────────────────────────────────────────────────────────────────
  async function runReview(): Promise<void> {
    if (stopped || busy) return

    const scrollY = typeof window !== 'undefined' ? (window.scrollY ?? 0) : 0
    const docHeight = typeof document !== 'undefined'
      ? Math.max(
          document.documentElement?.scrollHeight ?? 0,
          document.body?.scrollHeight ?? 0,
        )
      : 0
    const viewportW = typeof window !== 'undefined' ? (window.innerWidth ?? 0) : 0
    const viewportH = typeof window !== 'undefined' ? (window.innerHeight ?? 0) : 0
    const title = typeof document !== 'undefined' ? (document.title ?? '') : ''
    const urlPath = typeof location !== 'undefined' ? location.pathname + location.search : ''

    const hash = computeContentHash(scrollY, docHeight, viewportW, viewportH, title, urlPath)
    if (shouldSkipReview(hash, seenHashes, lastReviewAt, Date.now(), minInterval)) return

    busy = true
    lastReviewAt = Date.now()
    // Optimistically mark seen — removed on capture/network error so the next change can retry.
    seenHashes.add(hash)
    if (seenHashes.size > MAX_SEEN_HASHES) {
      const oldest = seenHashes.values().next().value
      if (oldest !== undefined) seenHashes.delete(oldest)
    }

    try {
      const screenshotDataUrl = await opts.captureViewport()
      if (stopped) { busy = false; return }

      const body: Record<string, unknown> = {
        url: typeof location !== 'undefined' ? location.href : '',
        screenshotDataUrl,
        domSig: hash,
        adhoc: true,
        projectId: opts.projectId,
      }
      if (opts.simIds?.length) body.simIds = opts.simIds

      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (opts.bearerToken) headers['authorization'] = `Bearer ${opts.bearerToken}`

      const res = await fetch(`${opts.backendUrl}/api/sim/review`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { ok: boolean; reviews?: Array<{ simId: string; simName: string; initials?: string; accent?: string; reactions: unknown[] }> } = await res.json()
      if (!data?.ok || !Array.isArray(data.reviews)) { busy = false; return }

      // Deliver each Sim review to Dev 2's presence UI layer (sims-live.ts).
      const kl = typeof window !== 'undefined' ? (window as any).KlavitySims : null
      for (const review of data.reviews) {
        if (!review?.simId) continue
        try {
          kl?.renderFeedback?.(review.simId, review.simName ?? '', review.reactions ?? [])
        } catch { /* UI errors must never break the watch loop */ }
      }
    } catch {
      // Capture or network failed — un-mark the hash so the next change triggers a fresh attempt.
      seenHashes.delete(hash)
    } finally {
      busy = false
    }
  }

  // ── Shared debounce ──────────────────────────────────────────────────────────────────────
  // A single timer is shared across all signal types: any new signal resets it. Navigation
  // signals use delayMs=0 so they preempt a pending scroll/mutation timer and run ASAP.
  function schedule(delayMs: number): void {
    if (stopped) return
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runReview()
    }, delayMs)
  }

  // ── Scroll listener ──────────────────────────────────────────────────────────────────────
  const onScroll = (): void => schedule(scrollDebounce)

  // ── MutationObserver ─────────────────────────────────────────────────────────────────────
  let observer: MutationObserver | null = null
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
    observer = new MutationObserver((mutations) => {
      if (hasSignificantMutations(mutations)) schedule(mutationDebounce)
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  // ── Navigation: patch pushState / replaceState; listen for popstate ──────────────────────
  // history.pushState and .replaceState don't fire native events, so we wrap them.
  type HistoryMethod = typeof history.pushState
  const origPush: HistoryMethod = typeof history !== 'undefined'
    ? history.pushState.bind(history)
    : (() => {}) as unknown as HistoryMethod
  const origReplace: HistoryMethod = typeof history !== 'undefined'
    ? history.replaceState.bind(history)
    : (() => {}) as unknown as HistoryMethod

  if (typeof history !== 'undefined') {
    history.pushState = function (state: unknown, unused: string, url?: string | URL | null) {
      origPush(state, unused, url)
      schedule(0) // navigation = clear the queue; run as soon as the new route renders
    }
    history.replaceState = function (state: unknown, unused: string, url?: string | URL | null) {
      origReplace(state, unused, url)
      schedule(0)
    }
  }

  const onPopState = (): void => schedule(0)

  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('popstate', onPopState)
  }

  // ── Stop / cleanup ───────────────────────────────────────────────────────────────────────
  function stop(): void {
    if (stopped) return
    stopped = true
    if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null }
    observer?.disconnect()
    observer = null
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('popstate', onPopState)
    }
    if (typeof history !== 'undefined') {
      history.pushState = origPush
      history.replaceState = origReplace
    }
    seenHashes.clear()
  }

  return { stop }
}

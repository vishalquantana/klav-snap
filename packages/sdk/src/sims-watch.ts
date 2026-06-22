// packages/sdk/src/sims-watch.ts
// Live Sims change-detection and watch engine.
//
// Observes three signals on the current page:
//   1. Scroll (debounced ~700ms) — user explored a new viewport region
//   2. Navigation (history pushState/replaceState + popstate + hashchange) — SPA route changed
//   3. Significant DOM mutation (MutationObserver, debounced ~800ms) — a panel/dialog/
//      major content block appeared (e.g. chatbot sidebar, modal, article swap)
//
// On each meaningful change: computes a lightweight viewport hash, skips if recently reviewed
// or hash unchanged (THROTTLE), captures the viewport, POSTs to /api/sim/review, and for
// each returned Sim review calls window.KlavitySims?.renderFeedback(...) (Dev 2's UI layer).
//
// COST GUARDS (continuous AI calls cost money):
//   minIntervalMs (default 30s) — hard floor between successive /api/sim/review calls
//   seenHashes Set — skip when the viewport fingerprint matches a hash already reviewed
//   mutationEpoch — bumped on each significant mutation batch so in-place content swaps
//     (same URL / docHeight) always produce a fresh hash and aren't wrongly skipped
//   busy flag — blocks concurrent calls while a review is in flight
//   capture timeout (10s) — prevents a hung captureViewport() from locking busy=true
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
 * Lightweight fingerprint of the current viewport state. Used both client-side (seenHashes
 * dedup) and as the `domSig` sent to the server for per-Sim deduplication.
 *
 * scrollY is bucketed to 50px so minor scroll drift (sticky-header collapse, etc.) doesn't
 * produce a new hash — only a genuinely different viewport area does.
 *
 * epoch is incremented by the mutation observer each time significant new content is added.
 * Including it in the hash guarantees that in-place content swaps (same URL/docHeight/scroll
 * but new DOM subtree) are never wrongly skipped by the seenHashes check.
 */
export function computeContentHash(
  scrollY: number,
  docHeight: number,
  viewportW: number,
  viewportH: number,
  title: string,
  urlPath: string,
  epoch = 0,
): string {
  const bucket = Math.round(scrollY / 50) * 50
  return djb2(
    `${bucket}:${docHeight}:${viewportW}x${viewportH}:${urlPath}:${title.slice(0, 80)}:e${epoch}`,
  ).toString(36)
}

/**
 * Returns true when a review should be skipped because:
 *   – less than minIntervalMs has elapsed since the last review (throttle), OR
 *   – this exact hash was already reviewed this session (content unchanged).
 * Both checks are independent — the throttle protects against rapid bursts even when the
 * hash is fresh, and the seenHash check blocks revisiting identical viewport states after the
 * throttle window has passed.
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
 *   – a semantic landmark with role=dialog/main/complementary/…
 *   – a class matching common panel/modal/chat/drawer patterns
 *   – a large visible footprint (≥ 100 × 100 px)
 * Ignores metadata nodes (script/style/meta/link) and invisible tiny elements.
 */
export function isSignificantNode(el: Element): boolean {
  const tag = el.tagName?.toUpperCase() ?? ''
  if (['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'NOSCRIPT'].includes(tag)) return false

  const role = el.getAttribute?.('role') ?? ''
  if (['dialog', 'main', 'complementary', 'banner', 'navigation', 'feed', 'log'].includes(role)) return true

  const cls = el.className
  if (typeof cls === 'string' && cls) {
    if (/(modal|dialog|drawer|panel|sidebar|chat|message|overlay|sheet|toast|alert|notification|feed|article)/i.test(cls)) return true
  }

  // Geometry fallback — treat a large visible rectangle as significant.
  if (typeof (el as HTMLElement).getBoundingClientRect === 'function') {
    const r = (el as HTMLElement).getBoundingClientRect()
    return r.width >= 100 && r.height >= 100
  }
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
const CAPTURE_TIMEOUT_MS = 10_000       // abort a hung captureViewport() after 10s

type TriggerKind = 'scroll' | 'navigation' | 'mutation'

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
  /** Tear down all listeners, timers, observers, and abort any in-flight request. */
  stop: () => void
}

/**
 * Start the Live Sims change-detection engine.
 *
 * Wires scroll, navigation (pushState/replaceState/popstate/hashchange), and MutationObserver
 * signals; debounces and throttles each to avoid flooding the AI; then drives the
 * capture → /api/sim/review → window.KlavitySims.renderFeedback pipeline.
 *
 * Returns a controller with `stop()` that removes all listeners, restores patched history
 * methods, disconnects the observer, and aborts any in-flight fetch.
 */
export function startSimsWatch(opts: SimsWatchOptions): SimsWatchController {
  const minInterval = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  const scrollDebounce = opts.scrollDebounceMs ?? DEFAULT_SCROLL_DEBOUNCE_MS
  const mutationDebounce = opts.mutationDebounceMs ?? DEFAULT_MUTATION_DEBOUNCE_MS

  let stopped = false
  let busy = false
  // lastReviewAt=0 means "never reviewed"; Date.now() >> minInterval so the first trigger runs.
  let lastReviewAt = 0
  const seenHashes = new Set<string>()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  // Incremented on each significant mutation batch so in-place DOM swaps produce a fresh hash.
  let mutationEpoch = 0
  // AbortController for the current in-flight fetch; aborted by stop().
  let fetchAbort: AbortController | null = null

  // ── Core review pipeline ─────────────────────────────────────────────────────────────────
  async function runReview(trigger: TriggerKind): Promise<void> {
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
    const urlPath = typeof location !== 'undefined' ? location.pathname + location.search + location.hash : ''

    // Mutation triggers include the current epoch in the hash so a content swap at the same
    // scroll position / URL always produces a fresh hash and isn't wrongly skipped.
    const epoch = trigger === 'mutation' ? mutationEpoch : 0
    const hash = computeContentHash(scrollY, docHeight, viewportW, viewportH, title, urlPath, epoch)

    if (shouldSkipReview(hash, seenHashes, lastReviewAt, Date.now(), minInterval)) return

    busy = true
    lastReviewAt = Date.now()
    // Optimistically mark seen — un-marked on capture / network error so the next change retries.
    seenHashes.add(hash)
    if (seenHashes.size > MAX_SEEN_HASHES) {
      const oldest = seenHashes.values().next().value
      if (oldest !== undefined) seenHashes.delete(oldest)
    }

    try {
      // Race captureViewport against a timeout so a hung capture never locks busy=true.
      const screenshotDataUrl = await Promise.race([
        opts.captureViewport(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('sims-watch: capture timeout')), CAPTURE_TIMEOUT_MS),
        ),
      ])
      if (stopped) { busy = false; return }

      const ac = new AbortController()
      fetchAbort = ac

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
        signal: ac.signal,
        body: JSON.stringify(body),
      })
      fetchAbort = null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { ok: boolean; reviews?: Array<{ simId: string; simName: string; initials?: string; accent?: string; observations: unknown[] }> } = await res.json()
      if (!data?.ok || !Array.isArray(data.reviews)) { busy = false; return }

      // Deliver each Sim review to the presence UI layer (sims-live.ts / window.KlavitySims).
      const kl = typeof window !== 'undefined' ? (window as any).KlavitySims : null
      for (const review of data.reviews) {
        if (!review?.simId) continue
        try {
          kl?.renderFeedback?.(review.simId, review.simName ?? '', review.observations ?? [])
        } catch { /* UI errors must never break the watch loop */ }
      }
    } catch (e) {
      // AbortError = intentional teardown via stop(); don't retry or log.
      if (e instanceof Error && e.name === 'AbortError') { busy = false; return }
      // Capture timeout or network error — un-mark the hash so the next signal can retry.
      seenHashes.delete(hash)
    } finally {
      busy = false
    }
  }

  // ── Shared debounce ──────────────────────────────────────────────────────────────────────
  // A single timer shared across all signal types. Any new signal resets it.
  // Navigation signals use delayMs=0 to preempt a pending scroll/mutation timer.
  function schedule(trigger: TriggerKind, delayMs: number): void {
    if (stopped) return
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runReview(trigger)
    }, delayMs)
  }

  // ── Scroll listener ──────────────────────────────────────────────────────────────────────
  const onScroll = (): void => schedule('scroll', scrollDebounce)

  // ── MutationObserver ─────────────────────────────────────────────────────────────────────
  let observer: MutationObserver | null = null
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
    observer = new MutationObserver((mutations) => {
      if (hasSignificantMutations(mutations)) {
        mutationEpoch++  // bump epoch so in-place swaps produce a fresh hash
        schedule('mutation', mutationDebounce)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  // ── Navigation: pushState / replaceState / popstate / hashchange ─────────────────────────
  // pushState and replaceState don't fire native events so we wrap them.
  // hashchange covers #fragment SPA routers that don't use the History API.
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
      schedule('navigation', 0)
    }
    history.replaceState = function (state: unknown, unused: string, url?: string | URL | null) {
      origReplace(state, unused, url)
      schedule('navigation', 0)
    }
  }

  const onPopState = (): void => schedule('navigation', 0)
  const onHashChange = (): void => schedule('navigation', 0)

  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('popstate', onPopState)
    window.addEventListener('hashchange', onHashChange)
  }

  // ── Stop / full teardown ─────────────────────────────────────────────────────────────────
  function stop(): void {
    if (stopped) return
    stopped = true
    // Cancel any pending debounce timer.
    if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null }
    // Abort any in-flight fetch request immediately.
    fetchAbort?.abort()
    fetchAbort = null
    // Disconnect the mutation observer.
    observer?.disconnect()
    observer = null
    // Remove all window event listeners.
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('hashchange', onHashChange)
    }
    // Restore patched history methods.
    if (typeof history !== 'undefined') {
      history.pushState = origPush
      history.replaceState = origReplace
    }
    // Release memory.
    seenHashes.clear()
  }

  return { stop }
}

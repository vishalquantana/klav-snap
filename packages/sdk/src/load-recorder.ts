// G1 (perf follow-up) — LAZY-LOAD the rrweb recorder for the embeddable widget.
//
// rrweb is ~260 KB minified; statically importing it bloated the no-install widget IIFE to ~418 KB
// gzip. The widget is embedded on customers' sites, so that initial payload is in their critical
// path. Instead we inject a <script src> for a VENDORED rrweb UMD build (served by the Klavity
// backend at /vendor/klv-buffer.min.js — a NEUTRAL filename so ad-blockers don't block it; the recorder
// global is still window.rrweb. Mirrors how the player is vendored at /vendor/klv-view.min.js) AFTER
// the widget mounts. Until it loads, replay?.getEvents() returns [] (already handled). A few hundred
// ms of "not recording yet" at page load is the accepted trade-off.
//
// resolveRecorderUrl is pure and unit-tested; injectRecorderScript is a thin DOM/network shim
// documented for manual verification.

/** The UMD global the vendored bundle exposes (rrweb's UMD sets window.rrweb with a .record fn). */
export interface RrwebGlobal { record?: (opts: any) => (() => void) | undefined }

/**
 * Build the absolute URL for the vendored recorder from the widget's backendUrl. The widget is
 * cross-origin (it runs on the customer's page), so the vendor path MUST resolve against the Klavity
 * backend origin, not the host page. Trailing slashes on backendUrl are tolerated.
 */
export function resolveRecorderUrl(backendUrl: string): string {
  const base = (backendUrl || "").replace(/\/+$/, "")
  // NEUTRAL filename: ad-blockers (uBlock/EasyPrivacy/Brave) block any URL containing "rrweb"/"record",
  // which silently disabled session replay for adblock users. Keep the URL free of flagged tokens.
  return base + "/vendor/klv-buffer.min.js"
}

let _loadPromise: Promise<RrwebGlobal | null> | null = null

/**
 * Inject the vendored recorder <script> once (cached promise) and resolve with the rrweb global once
 * it loads. Resolves null on any failure so callers degrade to "no replay" — a recorder failure must
 * never break the widget. Safe to call before DOM is ready (falls back to documentElement).
 */
export function injectRecorderScript(backendUrl: string): Promise<RrwebGlobal | null> {
  if (_loadPromise) return _loadPromise
  _loadPromise = new Promise<RrwebGlobal | null>((resolve) => {
    try {
      const w = window as any
      // Already present (e.g. host page bundles rrweb, or a prior injection succeeded).
      if (w.rrweb && typeof w.rrweb.record === "function") { resolve(w.rrweb as RrwebGlobal); return }
      const url = resolveRecorderUrl(backendUrl)
      const s = document.createElement("script")
      s.src = url
      s.async = true
      s.onload = () => {
        const g = (window as any).rrweb
        resolve(g && typeof g.record === "function" ? (g as RrwebGlobal) : null)
      }
      s.onerror = () => resolve(null)
      ;(document.head || document.documentElement).appendChild(s)
    } catch {
      resolve(null)
    }
  })
  return _loadPromise
}

/** Test-only: reset the cached load promise so each test starts clean. */
export function __resetRecorderLoaderForTests(): void {
  _loadPromise = null
}

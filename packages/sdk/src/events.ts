// Typed pub/sub for the Klavity widget's public event API (G5).
//
// Lives in its own module so it is:
//   • testable in isolation without a DOM or widget mount
//   • importable by the npm SDK (packages/sdk/src/index.ts) if needed later
//
// window.Klavity.on(event, cb) → cb receives the typed payload below.
// The returned value is an unsubscribe function (mirrors the DOM EventTarget pattern).

export interface KlavOpenEvent   { type: 'bug' | 'feature' }
export interface KlavSubmitEvent { issueKey: string; issueUrl: string | null; type: 'bug' | 'feature' }
export interface KlavCloseEvent  { [k: string]: never }   // empty — no payload for close

export interface KlavEventMap {
  /** Fired when the report composer modal opens (before the user fills anything in). */
  open:   KlavOpenEvent
  /** Fired when the composer modal closes — via Esc, overlay click, or programmatic close. */
  close:  KlavCloseEvent
  /** Fired when a report is successfully submitted. issueUrl may be null for Klavity Cloud reports. */
  submit: KlavSubmitEvent
}

export type KlavEventType = keyof KlavEventMap

// Listener type is inferred from the event key.
type Listener<K extends KlavEventType> = (data: KlavEventMap[K]) => void

const _handlers: { [K in KlavEventType]?: Set<Listener<any>> } = {}

/**
 * Subscribe to a Klavity widget event. Returns an unsubscribe function.
 *
 * @example
 * const off = window.Klavity.on('submit', ({ issueKey }) => {
 *   console.log('Bug filed:', issueKey)
 * })
 * // later:
 * off()   // remove the listener
 */
export function on<K extends KlavEventType>(event: K, cb: Listener<K>): () => void {
  if (!_handlers[event]) _handlers[event] = new Set()
  _handlers[event]!.add(cb as Listener<any>)
  return () => _handlers[event]?.delete(cb as Listener<any>)
}

/** Fire an event (widget-internal — not on window.Klavity). */
export function emit<K extends KlavEventType>(event: K, data: KlavEventMap[K]): void {
  for (const cb of Array.from(_handlers[event] ?? [])) {
    try { cb(data) } catch { /* listener errors must never break the widget */ }
  }
}

/** Test-only: reset all listeners between test runs. */
export function _clearListenersForTest(): void {
  (Object.keys(_handlers) as KlavEventType[]).forEach(k => delete _handlers[k])
}

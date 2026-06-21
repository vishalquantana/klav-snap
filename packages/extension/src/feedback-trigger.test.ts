import { describe, it, expect, vi, afterEach } from "vitest";
import {
  klavContentSig,
  shouldCapture,
  createTrailingDebounce,
  DEBOUNCE_MS,
  ROUTE_COOLDOWN_MS,
  MAX_REVIEWS_PER_ROUTE,
} from "./feedback-trigger";

// ---------------------------------------------------------------------------
// klavContentSig
// ---------------------------------------------------------------------------

const BASE_INPUT = {
  host: "example.com",
  title: "Hello World",
  counts: { headings: 3, buttons: 2, links: 10, fields: 1 },
  region: "h:3|b:2|l:10|f:1",
};

describe("klavContentSig", () => {
  it("is deterministic — same input produces same sig", () => {
    expect(klavContentSig(BASE_INPUT)).toBe(klavContentSig({ ...BASE_INPUT }));
  });

  it("is stable across independent calls", () => {
    const a = klavContentSig(BASE_INPUT);
    const b = klavContentSig(BASE_INPUT);
    const c = klavContentSig(BASE_INPUT);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("starts with the host as a prefix", () => {
    const sig = klavContentSig(BASE_INPUT);
    expect(sig.startsWith("example.com")).toBe(true);
  });

  it("differs when host changes", () => {
    const a = klavContentSig(BASE_INPUT);
    const b = klavContentSig({ ...BASE_INPUT, host: "other.com" });
    expect(a).not.toBe(b);
  });

  it("differs when title changes", () => {
    const a = klavContentSig(BASE_INPUT);
    const b = klavContentSig({ ...BASE_INPUT, title: "Different Title" });
    expect(a).not.toBe(b);
  });

  it("normalizes title to ≤80 chars — long titles that share the first 80 chars produce the same sig", () => {
    const longTitle = "A".repeat(200);
    const samePrefix = "A".repeat(300);
    const a = klavContentSig({ ...BASE_INPUT, title: longTitle });
    const b = klavContentSig({ ...BASE_INPUT, title: samePrefix });
    expect(a).toBe(b);
  });

  it("differs when two titles differ within the first 80 chars", () => {
    const t1 = "Alpha" + "X".repeat(100);
    const t2 = "Beta" + "X".repeat(100);
    const a = klavContentSig({ ...BASE_INPUT, title: t1 });
    const b = klavContentSig({ ...BASE_INPUT, title: t2 });
    expect(a).not.toBe(b);
  });

  it("differs when headings count changes", () => {
    const a = klavContentSig(BASE_INPUT);
    const b = klavContentSig({
      ...BASE_INPUT,
      counts: { ...BASE_INPUT.counts, headings: 99 },
    });
    expect(a).not.toBe(b);
  });

  it("differs when buttons count changes", () => {
    const a = klavContentSig(BASE_INPUT);
    const b = klavContentSig({
      ...BASE_INPUT,
      counts: { ...BASE_INPUT.counts, buttons: 99 },
    });
    expect(a).not.toBe(b);
  });

  it("differs when links count changes", () => {
    const a = klavContentSig(BASE_INPUT);
    const b = klavContentSig({
      ...BASE_INPUT,
      counts: { ...BASE_INPUT.counts, links: 99 },
    });
    expect(a).not.toBe(b);
  });

  it("differs when fields count changes", () => {
    const a = klavContentSig(BASE_INPUT);
    const b = klavContentSig({
      ...BASE_INPUT,
      counts: { ...BASE_INPUT.counts, fields: 99 },
    });
    expect(a).not.toBe(b);
  });

  it("differs when region fingerprint changes", () => {
    const a = klavContentSig(BASE_INPUT);
    const b = klavContentSig({ ...BASE_INPUT, region: "h:1|b:0|l:5|f:0" });
    expect(a).not.toBe(b);
  });

  it("cross-host discrimination: same path/title/counts differ by host", () => {
    const a = klavContentSig({ ...BASE_INPUT, host: "app.alpha.com" });
    const b = klavContentSig({ ...BASE_INPUT, host: "app.beta.com" });
    expect(a).not.toBe(b);
  });

  it("returns a non-empty string", () => {
    expect(typeof klavContentSig(BASE_INPUT)).toBe("string");
    expect(klavContentSig(BASE_INPUT).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// shouldCapture
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000;
const BASE_STATE = {
  nowSig: "sig-A",
  lastSentSig: null,
  now: NOW,
  cooldownUntil: NOW - 1,
  paused: false,
  routeCount: 0,
  cap: MAX_REVIEWS_PER_ROUTE,
};

describe("shouldCapture", () => {
  it("returns capture:true, reason:'ok' when all conditions are met", () => {
    expect(shouldCapture(BASE_STATE)).toEqual({ capture: true, reason: "ok" });
  });

  it("returns capture:false, reason:'unchanged' when sig equals lastSentSig", () => {
    expect(
      shouldCapture({ ...BASE_STATE, lastSentSig: "sig-A", nowSig: "sig-A" })
    ).toEqual({ capture: false, reason: "unchanged" });
  });

  it("returns capture:true when sig differs even if lastSentSig was set", () => {
    expect(
      shouldCapture({ ...BASE_STATE, lastSentSig: "sig-OLD", nowSig: "sig-NEW" })
    ).toEqual({ capture: true, reason: "ok" });
  });

  it("returns capture:false, reason:'cooldown' when now < cooldownUntil", () => {
    expect(
      shouldCapture({ ...BASE_STATE, cooldownUntil: NOW + 5000 })
    ).toEqual({ capture: false, reason: "cooldown" });
  });

  it("returns capture:true when now === cooldownUntil (boundary: not in cooldown)", () => {
    expect(
      shouldCapture({ ...BASE_STATE, cooldownUntil: NOW })
    ).toEqual({ capture: true, reason: "ok" });
  });

  it("returns capture:false, reason:'paused' when paused=true", () => {
    expect(shouldCapture({ ...BASE_STATE, paused: true })).toEqual({
      capture: false,
      reason: "paused",
    });
  });

  it("returns capture:false, reason:'cap' when routeCount >= cap", () => {
    expect(
      shouldCapture({ ...BASE_STATE, routeCount: MAX_REVIEWS_PER_ROUTE, cap: MAX_REVIEWS_PER_ROUTE })
    ).toEqual({ capture: false, reason: "cap" });
  });

  it("returns capture:false, reason:'cap' when routeCount > cap", () => {
    expect(
      shouldCapture({
        ...BASE_STATE,
        routeCount: MAX_REVIEWS_PER_ROUTE + 1,
        cap: MAX_REVIEWS_PER_ROUTE,
      })
    ).toEqual({ capture: false, reason: "cap" });
  });

  it("returns capture:true when routeCount is one below cap", () => {
    expect(
      shouldCapture({
        ...BASE_STATE,
        routeCount: MAX_REVIEWS_PER_ROUTE - 1,
        cap: MAX_REVIEWS_PER_ROUTE,
      })
    ).toEqual({ capture: true, reason: "ok" });
  });

  // Priority / ordering: 'unchanged' checked before cooldown
  it("'unchanged' takes priority over 'cooldown'", () => {
    const result = shouldCapture({
      ...BASE_STATE,
      nowSig: "sig-A",
      lastSentSig: "sig-A",
      cooldownUntil: NOW + 9999,
    });
    expect(result).toEqual({ capture: false, reason: "unchanged" });
  });

  // Priority: 'paused' checked before 'cap'
  it("'paused' takes priority over 'cap'", () => {
    const result = shouldCapture({
      ...BASE_STATE,
      paused: true,
      routeCount: MAX_REVIEWS_PER_ROUTE + 10,
    });
    expect(result).toEqual({ capture: false, reason: "paused" });
  });

  it("lastSentSig=null does NOT block capture (first capture ever)", () => {
    expect(shouldCapture({ ...BASE_STATE, lastSentSig: null })).toEqual({
      capture: true,
      reason: "ok",
    });
  });

  it("cap=0 always blocks (edge case)", () => {
    expect(
      shouldCapture({ ...BASE_STATE, routeCount: 0, cap: 0 })
    ).toEqual({ capture: false, reason: "cap" });
  });
});

// ---------------------------------------------------------------------------
// Exported consts sanity checks
// ---------------------------------------------------------------------------

describe("exported consts", () => {
  it("DEBOUNCE_MS is 1000", () => {
    expect(DEBOUNCE_MS).toBe(1000);
  });

  it("ROUTE_COOLDOWN_MS is 8000", () => {
    expect(ROUTE_COOLDOWN_MS).toBe(8000);
  });

  it("MAX_REVIEWS_PER_ROUTE is 6", () => {
    expect(MAX_REVIEWS_PER_ROUTE).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// createTrailingDebounce — trailing-edge debounce (fixes the throttle ~2s bug)
// ---------------------------------------------------------------------------

describe("createTrailingDebounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once, delayMs after the LAST schedule() — not on a fixed grid", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createTrailingDebounce(fn, 1000);

    // A burst of "mutations" 300ms apart over 1.2s (a settling stream).
    d.schedule();
    vi.advanceTimersByTime(300);
    d.schedule();
    vi.advanceTimersByTime(300);
    d.schedule();
    vi.advanceTimersByTime(300);
    d.schedule(); // last schedule at t=900

    // The throttle bug would have fired around t=1000 mid-stream; trailing
    // debounce must NOT have fired yet (last schedule was at t=900).
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();

    // Exactly delayMs after the last schedule → one fire.
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    // No further fires once settled.
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel() prevents a pending fire", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createTrailingDebounce(fn, 1000);
    d.schedule();
    vi.advanceTimersByTime(500);
    d.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("can be re-armed after firing", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createTrailingDebounce(fn, 1000);
    d.schedule();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    d.schedule();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect } from "vitest"
import { resolveModalConfig, themeCss, validateModalConfigInput, ALLOWED_THEMES, ALLOWED_LAUNCHER_MODES } from "../src/modal-theme"

describe("resolveModalConfig", () => {
  it("defaults to light when empty/garbage", () => {
    expect(resolveModalConfig(undefined).theme).toBe("light")
    expect(resolveModalConfig("nonsense").theme).toBe("light")
    expect(resolveModalConfig({ theme: "banana" }).theme).toBe("light")
  })
  it("keeps a valid theme and trims thankYou", () => {
    const c = resolveModalConfig({ theme: "neon", thankYou: "  Thanks!  " })
    expect(c.theme).toBe("neon")
    expect(c.thankYou).toBe("Thanks!")
  })
  it("keeps custom colors only when they are valid hex", () => {
    const c = resolveModalConfig({ theme: "custom", primary: "#5b5bf0", secondary: "nope" })
    expect(c.primary).toBe("#5b5bf0")
    expect(c.secondary).toBeUndefined()
  })
  it("accepts valid font names", () => {
    const c = resolveModalConfig({ theme: "custom", font: "Georgia, serif" })
    expect(c.font).toBe("Georgia, serif")
  })
  it("rejects font with CSS-breaking characters", () => {
    const c = resolveModalConfig({ theme: "custom", font: "x} :host{display:none" })
    expect(c.font).toBeUndefined()
  })
})

describe("themeCss", () => {
  it("emits CSS custom properties for the theme", () => {
    const css = themeCss({ theme: "dark" })
    expect(css).toContain("--kl-bg")
    expect(css).toContain(":host")
  })
  it("applies custom primary into --kl-accent", () => {
    const css = themeCss({ theme: "custom", primary: "#abcdef" })
    expect(css).toContain("#abcdef")
  })
})

describe("validateModalConfigInput", () => {
  it("rejects an unknown theme", () => {
    const r = validateModalConfigInput({ theme: "x" }, { isPro: true })
    expect(r.ok).toBe(false)
  })
  it("accepts a known theme and clamps thankYou length", () => {
    const r = validateModalConfigInput({ theme: "light", thankYou: "a".repeat(200) }, { isPro: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.thankYou!.length).toBe(140)
  })
  it("strips custom colors when not Pro", () => {
    const r = validateModalConfigInput({ theme: "custom", primary: "#5b5bf0" }, { isPro: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.primary).toBeUndefined()
  })
  it("keeps valid custom colors when Pro, rejects bad hex", () => {
    const r = validateModalConfigInput({ theme: "custom", primary: "#5b5bf0", secondary: "red" }, { isPro: true })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.config.primary).toBe("#5b5bf0"); expect(r.config.secondary).toBeUndefined() }
  })
  it("accepts valid font names when Pro", () => {
    const r = validateModalConfigInput({ theme: "custom", font: "Inter, sans-serif" }, { isPro: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.font).toBe("Inter, sans-serif")
  })
  it("rejects font with CSS-breaking characters even when Pro", () => {
    const r = validateModalConfigInput({ theme: "custom", font: "x} :host{display:none" }, { isPro: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.font).toBeUndefined()
  })
  it("exposes the allowed theme set", () => {
    expect(ALLOWED_THEMES).toContain("liquid")
    expect(ALLOWED_THEMES).toContain("light")
  })
})

describe("launcher display fields", () => {
  it("resolveModalConfig passes through valid launcherMode", () => {
    for (const mode of ALLOWED_LAUNCHER_MODES) {
      const c = resolveModalConfig({ theme: "light", launcherMode: mode })
      expect(c.launcherMode).toBe(mode)
    }
  })
  it("resolveModalConfig ignores invalid launcherMode", () => {
    const c = resolveModalConfig({ theme: "light", launcherMode: "floating" })
    expect(c.launcherMode).toBeUndefined()
  })
  it("resolveModalConfig clamps launcherText to 60 chars", () => {
    const long = "x".repeat(80)
    const c = resolveModalConfig({ theme: "light", launcherMode: "custom", launcherText: long })
    expect(c.launcherText!.length).toBe(60)
  })
  it("resolveModalConfig accepts valid launcherIconColor hex", () => {
    const c = resolveModalConfig({ theme: "light", launcherIconColor: "#e11d48" })
    expect(c.launcherIconColor).toBe("#e11d48")
  })
  it("resolveModalConfig rejects invalid launcherIconColor", () => {
    const c = resolveModalConfig({ theme: "light", launcherIconColor: "red" })
    expect(c.launcherIconColor).toBeUndefined()
  })
  it("validateModalConfigInput passes through launcher fields", () => {
    const r = validateModalConfigInput({ theme: "light", launcherMode: "icon", launcherIconColor: "#e11d48" }, { isPro: false })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.config.launcherMode).toBe("icon")
      expect(r.config.launcherIconColor).toBe("#e11d48")
    }
  })
  it("validateModalConfigInput rejects invalid launcherMode silently", () => {
    const r = validateModalConfigInput({ theme: "light", launcherMode: "mega" }, { isPro: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.launcherMode).toBeUndefined()
  })
  it("exposes ALLOWED_LAUNCHER_MODES", () => {
    expect(ALLOWED_LAUNCHER_MODES).toContain("hidden")
    expect(ALLOWED_LAUNCHER_MODES).toContain("custom")
  })
})

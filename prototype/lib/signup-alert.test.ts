import { expect, test, describe } from "bun:test"
import { parseEmail, parseUserAgent, flagEmoji, gravatarUrl, buildSlackPayload, type SignupContext } from "./signup-alert"

describe("parseEmail", () => {
  test("corporate domain → company + logo, not freemail", () => {
    const r = parseEmail("Jane.Doe@Acme-Corp.io")
    expect(r.domain).toBe("acme-corp.io")
    expect(r.isFreeProvider).toBe(false)
    expect(r.company).toBe("Acme-corp")
    expect(r.logoUrl).toBe("https://logo.clearbit.com/acme-corp.io")
  })

  test("freemail → no company/logo", () => {
    const r = parseEmail("someone@gmail.com")
    expect(r.isFreeProvider).toBe(true)
    expect(r.company).toBeNull()
    expect(r.logoUrl).toBeNull()
  })

  test("subdomain uses the org label", () => {
    expect(parseEmail("x@mail.deploy.example.com").company).toBe("Example")
  })

  test("multi-part public suffixes resolve the real org label", () => {
    expect(parseEmail("a@quantana.com.au").company).toBe("Quantana")
    expect(parseEmail("a@foo.co.uk").company).toBe("Foo")
    expect(parseEmail("a@team.bar.co.in").company).toBe("Bar")
  })

  test("gravatar uses md5 of trimmed lowercased email", () => {
    // known MD5 for "test@example.com"
    expect(gravatarUrl("  Test@Example.com ")).toContain("55502f40dc8b7c769880b10874abc9d0")
  })
})

describe("parseUserAgent", () => {
  test("Chrome on macOS desktop", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    expect(parseUserAgent(ua)).toEqual({ browser: "Chrome", os: "macOS", device: "Desktop" })
  })

  test("Safari on iPhone is mobile", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    const r = parseUserAgent(ua)
    expect(r.os).toBe("iOS")
    expect(r.device).toBe("Mobile")
  })

  test("Edge wins over Chrome token", () => {
    expect(parseUserAgent("... Chrome/120 ... Edg/120").browser).toBe("Edge")
  })

  test("headless flagged as bot", () => {
    expect(parseUserAgent("HeadlessChrome/120").device).toBe("Bot")
  })

  test("empty ua → unknown", () => {
    expect(parseUserAgent(undefined)).toEqual({ browser: "unknown", os: "unknown", device: "unknown" })
  })
})

describe("flagEmoji", () => {
  test("IN → 🇮🇳", () => expect(flagEmoji("IN")).toBe("🇮🇳"))
  test("invalid → empty", () => expect(flagEmoji("XYZ")).toBe(""))
  test("missing → empty", () => expect(flagEmoji(undefined)).toBe(""))
})

describe("buildSlackPayload", () => {
  const ctx: SignupContext = {
    email: "jane@acme.io", ip: "8.8.8.8",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537.36",
    referer: "https://klavity.quantana.top/pricing", at: 1_718_000_000_000,
  }

  test("includes header, fields, and a fallback text", () => {
    const p = buildSlackPayload(ctx, null, parseEmail(ctx.email), parseUserAgent(ctx.userAgent))
    expect(p.text).toContain("jane@acme.io")
    expect(p.blocks[0].type).toBe("header")
    const fieldText = JSON.stringify(p.blocks[1].fields)
    expect(fieldText).toContain("Acme")
    expect(fieldText).toContain("klavity.quantana.top/pricing")
  })

  test("geo proxy/hosting raise risk context flags", () => {
    const geo = { country: "United States", countryCode: "US", city: "Ashburn", isp: "Google LLC", as: "AS15169", proxy: true, hosting: true }
    const p = buildSlackPayload(ctx, geo, parseEmail(ctx.email), parseUserAgent(ctx.userAgent))
    const ctxBlock = p.blocks.find((b: any) => b.type === "context" && b.elements[0].text.includes("proxy"))
    expect(ctxBlock).toBeTruthy()
    expect(JSON.stringify(p.blocks)).toContain("🇺🇸")
  })

  test("corporate signup uses logo as accessory image", () => {
    const p = buildSlackPayload(ctx, null, parseEmail(ctx.email), parseUserAgent(ctx.userAgent))
    expect(p.blocks[1].accessory.image_url).toBe("https://logo.clearbit.com/acme.io")
  })

  test("freemail signup falls back to gravatar accessory", () => {
    const c2 = { ...ctx, email: "x@gmail.com" }
    const p = buildSlackPayload(c2, null, parseEmail(c2.email), parseUserAgent(c2.userAgent))
    expect(p.blocks[1].accessory.image_url).toContain("gravatar.com")
  })
})

import { test, expect } from "bun:test"
import { assertSafeUrl, isSafeUrl, hostMatchesAllowlist, ipBlockReason } from "./url-guard"

// ── Happy path ──────────────────────────────────────────────────────────────

test("allows a normal public https URL (literal public IP)", async () => {
  const u = await assertSafeUrl("https://1.1.1.1/")
  expect(u.hostname).toBe("1.1.1.1")
})

test("allows public https URL with path/query", async () => {
  const u = await assertSafeUrl("https://8.8.8.8/path?q=1")
  expect(u.protocol).toBe("https:")
})

// ── Scheme ────────────────────────────────────────────────────────────────

test("rejects http when allowHttp is false", async () => {
  await expect(assertSafeUrl("http://1.1.1.1/")).rejects.toThrow()
})

test("allows http when allowHttp is true", async () => {
  const u = await assertSafeUrl("http://1.1.1.1/", { allowHttp: true })
  expect(u.protocol).toBe("http:")
})

test("rejects file: scheme", async () => {
  await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow()
})

test("rejects data: scheme", async () => {
  await expect(assertSafeUrl("data:text/plain,hello")).rejects.toThrow()
})

test("rejects ftp/gopher schemes", async () => {
  await expect(assertSafeUrl("ftp://1.1.1.1/")).rejects.toThrow()
  await expect(assertSafeUrl("gopher://1.1.1.1/")).rejects.toThrow()
})

test("rejects non-URL garbage", async () => {
  await expect(assertSafeUrl("not a url")).rejects.toThrow()
})

// ── Credentials ─────────────────────────────────────────────────────────────

test("rejects credentials in URL", async () => {
  await expect(assertSafeUrl("https://user:pass@1.1.1.1/")).rejects.toThrow()
})

test("rejects username-only credentials", async () => {
  await expect(assertSafeUrl("https://user@1.1.1.1/")).rejects.toThrow()
})

// ── Loopback ──────────────────────────────────────────────────────────────

test("rejects loopback 127.0.0.1", async () => {
  await expect(assertSafeUrl("https://127.0.0.1/")).rejects.toThrow()
})

test("rejects loopback 127.x.x.x range", async () => {
  await expect(assertSafeUrl("https://127.1.2.3/")).rejects.toThrow()
})

test("rejects IPv6 loopback [::1]", async () => {
  await expect(assertSafeUrl("https://[::1]/")).rejects.toThrow()
})

test("rejects localhost name", async () => {
  await expect(assertSafeUrl("https://localhost/")).rejects.toThrow()
})

// ── Private ranges ───────────────────────────────────────────────────────────

test("rejects private 10.0.0.1", async () => {
  await expect(assertSafeUrl("https://10.0.0.1/")).rejects.toThrow()
})

test("rejects private 192.168.1.1", async () => {
  await expect(assertSafeUrl("https://192.168.1.1/")).rejects.toThrow()
})

test("rejects private 172.16.0.1", async () => {
  await expect(assertSafeUrl("https://172.16.0.1/")).rejects.toThrow()
})

test("allows 172.32.0.1 (outside the 172.16/12 private block)", async () => {
  const u = await assertSafeUrl("https://172.32.0.1/")
  expect(u.hostname).toBe("172.32.0.1")
})

test("rejects IPv6 unique-local fc00::", async () => {
  await expect(assertSafeUrl("https://[fc00::1]/")).rejects.toThrow()
})

// ── Link-local / cloud metadata ──────────────────────────────────────────────

test("rejects link-local / metadata 169.254.169.254", async () => {
  await expect(assertSafeUrl("https://169.254.169.254/")).rejects.toThrow()
})

test("rejects IPv6 link-local fe80::", async () => {
  await expect(assertSafeUrl("https://[fe80::1]/")).rejects.toThrow()
})

// ── Unspecified ──────────────────────────────────────────────────────────────

test("rejects unspecified 0.0.0.0", async () => {
  await expect(assertSafeUrl("https://0.0.0.0/")).rejects.toThrow()
})

test("rejects IPv6 unspecified [::]", async () => {
  await expect(assertSafeUrl("https://[::]/")).rejects.toThrow()
})

// ── IPv4-mapped IPv6 ─────────────────────────────────────────────────────────

test("rejects IPv4-mapped loopback [::ffff:127.0.0.1]", async () => {
  await expect(assertSafeUrl("https://[::ffff:127.0.0.1]/")).rejects.toThrow()
})

test("rejects IPv4-mapped private [::ffff:10.0.0.1]", async () => {
  await expect(assertSafeUrl("https://[::ffff:10.0.0.1]/")).rejects.toThrow()
})

test("rejects IPv4-mapped metadata in hex form [::ffff:a9fe:a9fe]", async () => {
  // a9fe:a9fe == 169.254.169.254
  await expect(assertSafeUrl("https://[::ffff:a9fe:a9fe]/")).rejects.toThrow()
})

// ── Allowlist ────────────────────────────────────────────────────────────────

test("allowHosts: subdomain of allowed host is permitted", async () => {
  const u = await assertSafeUrl("https://api.plane.so/", { allowHosts: ["plane.so"] })
  expect(u.hostname).toBe("api.plane.so")
})

test("allowHosts: exact host match is permitted", async () => {
  const u = await assertSafeUrl("https://plane.so/", { allowHosts: ["plane.so"] })
  expect(u.hostname).toBe("plane.so")
})

test("allowHosts: non-listed host is rejected", async () => {
  await expect(
    assertSafeUrl("https://evil.com/", { allowHosts: ["plane.so"] })
  ).rejects.toThrow()
})

test("allowHosts: lookalike suffix is NOT matched (notplane.so)", async () => {
  await expect(
    assertSafeUrl("https://notplane.so/", { allowHosts: ["plane.so"] })
  ).rejects.toThrow()
})

// ── isSafeUrl boolean parity ─────────────────────────────────────────────────

test("isSafeUrl returns true for safe public URL", async () => {
  expect(await isSafeUrl("https://1.1.1.1/")).toBe(true)
})

test("isSafeUrl returns false for blocked loopback", async () => {
  expect(await isSafeUrl("https://127.0.0.1/")).toBe(false)
})

test("isSafeUrl returns false for bad scheme", async () => {
  expect(await isSafeUrl("file:///x")).toBe(false)
})

test("isSafeUrl honours allowHosts", async () => {
  expect(await isSafeUrl("https://api.plane.so/", { allowHosts: ["plane.so"] })).toBe(true)
  expect(await isSafeUrl("https://evil.com/", { allowHosts: ["plane.so"] })).toBe(false)
})

// ── Unit helpers ─────────────────────────────────────────────────────────────

test("hostMatchesAllowlist: exact, suffix, and trailing-dot handling", () => {
  expect(hostMatchesAllowlist("plane.so", ["plane.so"])).toBe(true)
  expect(hostMatchesAllowlist("api.plane.so", ["plane.so"])).toBe(true)
  expect(hostMatchesAllowlist("api.plane.so.", ["plane.so"])).toBe(true)
  expect(hostMatchesAllowlist("API.Plane.SO", ["plane.so"])).toBe(true)
  expect(hostMatchesAllowlist("evil.com", ["plane.so"])).toBe(false)
  expect(hostMatchesAllowlist("notplane.so", ["plane.so"])).toBe(false)
})

test("ipBlockReason: classifies common ranges", () => {
  expect(ipBlockReason("127.0.0.1")).toBe("loopback address")
  expect(ipBlockReason("10.0.0.1")).toBe("private address")
  expect(ipBlockReason("172.16.0.1")).toBe("private address")
  expect(ipBlockReason("192.168.0.1")).toBe("private address")
  expect(ipBlockReason("169.254.169.254")).toBe("link-local address")
  expect(ipBlockReason("0.0.0.0")).toBe("unspecified address")
  expect(ipBlockReason("1.1.1.1")).toBeNull()
  expect(ipBlockReason("::1")).toBe("loopback address")
  expect(ipBlockReason("fe80::1")).toBe("link-local address")
  expect(ipBlockReason("fc00::1")).toBe("private address")
  expect(ipBlockReason("::ffff:127.0.0.1")).toBe("loopback address")
  expect(ipBlockReason("2606:4700:4700::1111")).toBeNull()
})

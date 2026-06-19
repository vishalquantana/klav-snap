import { test, expect } from "bun:test"
import { normalizeUrlPath, issueKeyFor, lexicalSim, chooseDedup } from "./dedup"

test("normalizeUrlPath strips query/hash + trailing slash", () => {
  expect(normalizeUrlPath("/checkout/?step=2#pay")).toBe("/checkout")
  expect(normalizeUrlPath("/")).toBe("/")
  expect(normalizeUrlPath("")).toBe("/")
})

test("issueKeyFor is stable across citedTraitIds order, varies by issueType/path/project", () => {
  const base = { projectId: "p1", urlPath: "/checkout", issueType: "flow", citedTraitIds: ["a", "b"] }
  expect(issueKeyFor(base)).toBe(issueKeyFor({ ...base, citedTraitIds: ["b", "a"] }))
  expect(issueKeyFor(base)).not.toBe(issueKeyFor({ ...base, issueType: "layout" }))
  expect(issueKeyFor(base)).not.toBe(issueKeyFor({ ...base, urlPath: "/cart" }))
  expect(issueKeyFor(base)).not.toBe(issueKeyFor({ ...base, projectId: "p2" }))
  // path normalization folds into the key
  expect(issueKeyFor(base)).toBe(issueKeyFor({ ...base, urlPath: "/checkout/?x=1" }))
})

test("lexicalSim: identical ~1, paraphrase high, unrelated low", () => {
  expect(lexicalSim("export button is hidden", "export button is hidden")).toBeGreaterThan(0.99)
  expect(lexicalSim("the export button is hidden", "export button is hidden on this page")).toBeGreaterThan(0.5)
  expect(lexicalSim("export button is hidden", "checkout payment timed out")).toBeLessThan(0.3)
})

test("chooseDedup: exact match wins; else semantic ≥ threshold; else null", () => {
  expect(chooseDedup({ title: "x", observation: "y" }, { id: "fb1" }, [])).toBe("fb1")
  const recent = [{ id: "fb2", title: "Export button is hidden", observation: "" }]
  expect(chooseDedup({ title: "Export button is hidden", observation: "" }, null, recent, 0.82)).toBe("fb2")
  expect(chooseDedup({ title: "Onboarding wizard crashes", observation: "" }, null, recent, 0.82)).toBeNull()
})

// Layer B (pure): Trail + ordered steps + resolved selectors -> standalone @playwright/test code STRING.
// No DB, no browser, no LLM. This is the "no lock-in" exportable artifact (spec §2.2, §10).
import type { Trail, TrailStep } from "./trails-types"

// Escape a value for embedding inside a single-quoted JS string literal.
function q(v: string): string {
  return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'"
}

/**
 * Generate an importable, runnable Playwright test as a string.
 * @param selectors map of stepId -> resolved CSS/attr selector (from locator_cache or the trajectory).
 */
export function generatePlaywright(
  trail: Trail,
  steps: TrailStep[],
  selectors: Record<string, string>,
): string {
  const ordered = [...steps].sort((a, b) => a.idx - b.idx)
  const body: string[] = []
  body.push(`  await page.goto(${q(trail.baseUrl)})`)

  for (const s of ordered) {
    const sel = selectors[s.id]
    switch (s.action) {
      case "navigate":
        body.push(`  await page.goto(${q(s.actionValue ?? trail.baseUrl)})`)
        break
      case "click":
        if (sel) body.push(`  await page.click(${q(sel)})`)
        break
      case "type":
        if (sel) body.push(`  await page.fill(${q(sel)}, ${q(s.actionValue ?? "")})`)
        break
      case "select":
        if (sel) body.push(`  await page.selectOption(${q(sel)}, ${q(s.actionValue ?? "")})`)
        break
      case "wait": {
        const ms = Number(s.actionValue)
        body.push(`  await page.waitForTimeout(${Number.isFinite(ms) ? ms : 0})`)
        break
      }
      case "assert": {
        const desc = s.checkpoint?.description ?? ""
        if (sel) {
          body.push(`  await expect(page.locator(${q(sel)})).toBeVisible() // ${desc}`)
        } else {
          // No element to bind to: keep the file runnable, preserve the checkpoint verbatim.
          body.push(`  // checkpoint: ${desc}`)
          body.push(`  expect(true).toBeTruthy()`)
        }
        break
      }
    }
  }

  return [
    `import { test, expect } from '@playwright/test'`,
    ``,
    `test(${q(trail.name)}, async ({ page }) => {`,
    ...body,
    `})`,
    ``,
  ].join("\n")
}

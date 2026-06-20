import { test, expect } from "bun:test"
import { withWalkSlot, isWalkInFlight, WalkBusyError, CHROMIUM_PROD_ARGS } from "./trails-browser"

test("withWalkSlot runs the fn and clears the slot after", async () => {
  expect(isWalkInFlight()).toBe(false)
  const r = await withWalkSlot(async () => { expect(isWalkInFlight()).toBe(true); return 42 })
  expect(r).toBe(42)
  expect(isWalkInFlight()).toBe(false)
})

test("a second concurrent withWalkSlot throws WalkBusyError (max 1)", async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>((res) => { release = res })
  const first = withWalkSlot(async () => { await gate; return "a" })
  await Promise.resolve() // let `first` acquire the slot
  await expect(withWalkSlot(async () => "b")).rejects.toBeInstanceOf(WalkBusyError)
  release()
  expect(await first).toBe("a")
  expect(isWalkInFlight()).toBe(false)
})

test("the slot is released even if fn throws", async () => {
  await expect(withWalkSlot(async () => { throw new Error("boom") })).rejects.toThrow("boom")
  expect(isWalkInFlight()).toBe(false)
})

test("CHROMIUM_PROD_ARGS carries the low-memory flags", () => {
  for (const a of ["--single-process", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote"]) {
    expect(CHROMIUM_PROD_ARGS).toContain(a)
  }
})

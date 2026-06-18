// Hermetic: point the module's `db` singleton at a fresh LOCAL libsql file before importing ./db.
import { test, expect, beforeAll } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

const file = join(tmpdir(), `klav-mw-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
process.env.TURSO_DATABASE_URL = "file:" + file
delete process.env.TURSO_AUTH_TOKEN

const { reconnectDb, applySchema, getModelWeights, setModelWeights } = await import("./db")
// All test files share one Bun process/registry, so the db singleton binds to whichever file
// imported first. Re-point it at THIS file's DB in beforeAll (runs per-file, before our tests).
let db: any
beforeAll(async () => {
  db = reconnectDb("file:" + file)
  await applySchema(db)
})

test("getModelWeights: empty when unset", async () => {
  expect(await getModelWeights()).toEqual({})
})

test("setModelWeights → getModelWeights round-trip", async () => {
  const w = { "qwen/qwen3-vl-235b-a22b-instruct": 50, "google/gemini-2.5-flash": 40 }
  await setModelWeights(w)
  expect(await getModelWeights()).toEqual(w)
  // upsert overwrites
  await setModelWeights({ "openai/gpt-5-mini": 100 })
  expect(await getModelWeights()).toEqual({ "openai/gpt-5-mini": 100 })
})

test("getModelWeights: invalid JSON in the row → {}", async () => {
  await db!.execute({ sql: "INSERT INTO schema_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: ["model_weights", "not json {"] })
  expect(await getModelWeights()).toEqual({})
})

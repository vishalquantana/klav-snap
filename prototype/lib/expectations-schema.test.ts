// prototype/lib/expectations-schema.test.ts
import { test, expect } from "bun:test"
import { createClient } from "@libsql/client"
import { applySchema } from "./db"

test("expectations table exists with expected columns", async () => {
  const c = createClient({ url: "file::memory:" })
  await applySchema(c)
  const cols = await c.execute("PRAGMA table_info(expectations)")
  const names = cols.rows.map((r: any) => r.name).sort()
  expect(names).toEqual(
    ["area","corroboration_json","created_at","dedup_key","enforced_step_id","id","project_id","source_refs_json","status","title","updated_at","url_path"].sort()
  )
})

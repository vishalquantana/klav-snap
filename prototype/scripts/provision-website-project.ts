/**
 * provision-website-project.ts
 *
 * One-time, idempotent ops script that:
 *   1. Ensures a "Website" Klavity project exists for the owner account.
 *   2. Attaches a Plane auto-copy connector pointing at the dedicated leads
 *      project (PLANE_PROJECT constant below), reusing the encrypted token
 *      already stored on any existing plane connector in the account.
 *   3. Sets widget_mode=leadgen on the Website project.
 *
 * Safe to re-run: find-or-create everywhere; never creates a duplicate project
 * or duplicate connector.
 *
 * Required env vars (load prod .env before running):
 *   TURSO_DATABASE_URL          — prod Turso URL
 *   TURSO_AUTH_TOKEN            — prod Turso auth token
 *   PROVISION_OWNER_EMAIL       — Klavity account owner email
 *   PROVISION_NOTIFY_EMAIL      — email address for lead-alert notifications
 *
 * Run on the prod box:
 *   source /etc/klav/klav.env && PROVISION_OWNER_EMAIL=… PROVISION_NOTIFY_EMAIL=… \
 *     bun run prototype/scripts/provision-website-project.ts
 *
 * Output:
 *   WEBSITE_PROJECT_ID=proj_<uuid>    ← use this as data-project in the widget embed
 */

import {
  initDb,
  listProjects,
  createProject,
  listConnectors,
  createConnector,
  setWidgetConfig,
  membershipsFor,
} from "../lib/db"

// The Plane project that should receive all website lead-gen tickets.
const PLANE_PROJECT = "f2982ce0-6bb5-410f-9c77-b84a7b90441c"

const OWNER_EMAIL = process.env.PROVISION_OWNER_EMAIL
const NOTIFY_EMAIL = process.env.PROVISION_NOTIFY_EMAIL

if (!OWNER_EMAIL) {
  console.error("ERROR: PROVISION_OWNER_EMAIL env var is required.")
  process.exit(1)
}
if (!NOTIFY_EMAIL) {
  console.error("ERROR: PROVISION_NOTIFY_EMAIL env var is required.")
  process.exit(1)
}

await initDb()

// ── Step 1: resolve the account id for this owner ──
// We need the account id to call createProject if the Website project is absent.
// listProjects returns ProjectRow which carries accountId — so we can derive it
// from any existing project. If the owner has no projects yet, fall back to
// membershipsFor (which returns workspaceId == accountId).
let accountId: string | null = null
let projects = await listProjects(OWNER_EMAIL)

if (projects.length > 0) {
  accountId = projects[0].accountId
} else {
  const memberships = await membershipsFor(OWNER_EMAIL)
  if (!memberships.length) {
    console.error(
      `ERROR: No account found for ${OWNER_EMAIL}. ` +
      "Make sure the owner has logged in at least once and their account exists."
    )
    process.exit(1)
  }
  accountId = memberships[0].workspaceId
}

// ── Step 2: find or create the "Website" project ──
let websiteProject = projects.find((p) => p.name === "Website") ?? null

if (!websiteProject) {
  console.log(`No "Website" project found — creating one under account ${accountId}…`)
  websiteProject = await createProject(accountId, "Website")
  console.log(`Created "Website" project: ${websiteProject.id}`)
} else {
  console.log(`Found existing "Website" project: ${websiteProject.id}`)
}

// ── Step 3: reuse the encrypted Plane token from an existing connector ──
// Scan every project the owner can see for a plane connector with a stored
// (encrypted) token. We must NOT handle plaintext secrets here — the token
// is already stored encrypted in config.token.
let existingPlaneConfig: Record<string, string> | null = null

// Refresh projects list (Website may be newly created, include it).
projects = await listProjects(OWNER_EMAIL)
for (const proj of projects) {
  const conns = await listConnectors(proj.id)
  const planeConn = conns.find((c) => c.type === "plane" && c.config.token)
  if (planeConn) {
    existingPlaneConfig = planeConn.config
    console.log(`Found existing plane connector on project ${proj.id} — reusing its encrypted token.`)
    break
  }
}

if (!existingPlaneConfig) {
  console.error(
    "ERROR: No existing Plane connector with a stored token was found in this account.\n" +
    "Please add a Plane connector to any project via the Klavity dashboard first " +
    "(Dashboard → Settings → Connectors → Add Plane). " +
    "The provisioning script will then reuse the encrypted token stored there.\n" +
    "Do NOT set PROVISION_PLANE_TOKEN_ENC manually; this script is intentionally " +
    "designed to reuse the already-encrypted credential."
  )
  process.exit(1)
}
// process.exit() is noreturn at runtime; cast so TypeScript knows this branch is exhaustive.
const planeConfig = existingPlaneConfig as Record<string, string>

// ── Step 4: attach a Plane connector to the Website project (idempotent) ──
// The connector config for Plane uses these keys:
//   token       — the encrypted API key (secret field, already encrypted)
//   workspace   — Plane workspace slug (e.g. "qbuilder")
//   project_id  — the Plane project UUID to file issues into
//   host        — self-hosted Plane base URL (e.g. "https://plane.quantana.top")
const websiteConns = await listConnectors(websiteProject.id)
const hasPlaneConnector = websiteConns.some((c) => c.type === "plane")

if (hasPlaneConnector) {
  console.log("Plane connector already exists on the Website project — skipping creation.")
} else {
  await createConnector(websiteProject.id, {
    type: "plane",
    name: "Website leads → Plane",
    config: {
      token: planeConfig.token,                                      // encrypted — reused verbatim
      workspace: planeConfig.workspace ?? "qbuilder",
      project_id: PLANE_PROJECT,                                     // leads project
      host: planeConfig.host ?? "https://plane.quantana.top",
    },
    autoCopy: true,
    createdBy: OWNER_EMAIL,
  })
  console.log("Created Plane connector on the Website project.")
}

// ── Step 5: set widget config to leadgen mode ──
await setWidgetConfig(websiteProject.id, {
  mode: "leadgen",
  ctaUrl: "https://klavity.quantana.top/onboarding",
  notifyEmail: NOTIFY_EMAIL,
})
console.log(`Widget config set: mode=leadgen, notifyEmail=${NOTIFY_EMAIL}`)

// ── Done ──
console.log("WEBSITE_PROJECT_ID=" + websiteProject.id)

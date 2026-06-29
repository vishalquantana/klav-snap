// Blog publish helper — called by POST /api/blog/publish.
// Accepts an injectable git runner so tests can mock git without spawning real processes.

export const SLUG_RE = /^[a-z0-9-]+$/

export interface PublishInput {
  slug: string
  title: string
  excerpt: string
  category: string
  date: string
  html: string
}

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

export type GitRunner = (args: string[], opts: { cwd: string }) => Promise<GitResult>

export interface PublishResult {
  ok: true
  sha: string
  url: string
}

export async function spawnGit(args: string[], opts: { cwd: string }): Promise<GitResult> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

export async function publishBlogPost(
  input: PublishInput,
  repoRoot: string,
  ghToken: string,
  runGit: GitRunner = spawnGit,
): Promise<PublishResult> {
  const { slug, title, excerpt, category, date, html } = input
  const blogDir = repoRoot + "/site/blog"

  // 1. Write the HTML file verbatim
  await Bun.write(blogDir + "/" + slug + ".html", html)

  // 2. Upsert index.json — dedupe by slug, newest entry first
  let entries: Array<{ slug: string; title: string; excerpt: string; category: string; date: string }> = []
  try {
    entries = JSON.parse(await Bun.file(blogDir + "/index.json").text())
    if (!Array.isArray(entries)) entries = []
  } catch { /* first post or corrupt — start fresh */ }
  entries = entries.filter((e) => e.slug !== slug)
  entries.unshift({ slug, title, excerpt, category, date })
  await Bun.write(blogDir + "/index.json", JSON.stringify(entries, null, 2) + "\n")

  // 3. Upsert index.html listing — remove existing card for this slug, insert new one at top of .bgrid
  let indexHtml = ""
  try { indexHtml = await Bun.file(blogDir + "/index.html").text() } catch { /* no file yet */ }

  const safeSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  // Remove any existing card for this slug (handles re-publish / idempotency)
  indexHtml = indexHtml.replace(
    new RegExp(`\\n?\\s*<a class="bcard reveal" href="/blog/${safeSlug}">[\\s\\S]*?</a>`, "g"),
    "",
  )
  const newCard = `\n    <a class="bcard reveal" href="/blog/${slug}"><div class="bcat">${category} · ${date}</div><h2>${title}</h2><p>${excerpt}</p></a>`
  indexHtml = indexHtml.replace('<div class="bgrid">', `<div class="bgrid">${newCard}`)
  await Bun.write(blogDir + "/index.html", indexHtml)

  // 4. Git: pull, stage, commit, push (retry once on non-fast-forward)
  const blogFiles = [
    "site/blog/" + slug + ".html",
    "site/blog/index.json",
    "site/blog/index.html",
  ]
  const gitOpts = { cwd: repoRoot }

  // Pull before staging to reduce fast-forward conflicts
  await runGit(["pull", "--rebase"], gitOpts)

  const addRes = await runGit(["add", ...blogFiles], gitOpts)
  if (addRes.code !== 0) throw new Error("git add failed: " + addRes.stderr)

  const commitRes = await runGit(
    ["commit", "-m", `blog: publish ${slug} (${date})\n\nPublished via /api/blog/publish`],
    gitOpts,
  )
  if (commitRes.code !== 0) throw new Error("git commit failed: " + commitRes.stderr)

  const shaRes = await runGit(["rev-parse", "HEAD"], gitOpts)
  const sha = shaRes.stdout

  // Push via inline URL — token is in the URL arg only, never written to git config.
  // Sanitize any error output before surfacing it so the token can't leak.
  const sanitize = (s: string) => s.replace(new RegExp(ghToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<TOKEN>")
  const pushUrl = `https://x-access-token:${ghToken}@github.com/vishalquantana/klav-snap.git`

  let pushRes = await runGit(["push", pushUrl, "HEAD:master"], gitOpts)

  // Retry once on non-fast-forward (the local merge-train is also writing master)
  if (pushRes.code !== 0 && (pushRes.stderr.includes("non-fast-forward") || pushRes.stderr.includes("rejected"))) {
    await runGit(["pull", "--rebase"], gitOpts)
    pushRes = await runGit(["push", pushUrl, "HEAD:master"], gitOpts)
  }

  if (pushRes.code !== 0) throw new Error("git push failed: " + sanitize(pushRes.stderr))

  return { ok: true, sha, url: `https://klavity.quantana.top/blog/${slug}` }
}

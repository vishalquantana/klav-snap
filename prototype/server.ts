// Klav Sims — runnable prototype backend (seed of services/api)
// Real Claude calls via OpenRouter: transcript -> personas, and persona + screenshot -> live reaction.
//
// Run (from this dir; Bun auto-loads .env):  bun run server.ts
// Then open http://localhost:4317
//
// Model defaults to Sonnet 4.6 (fast); override: KLAV_MODEL=anthropic/claude-opus-4.8 bun run server.ts

const KEY = process.env.OPENROUTER_API_KEY
const MODEL = process.env.KLAV_MODEL || "anthropic/claude-sonnet-4.6"
const PORT = Number(process.env.PORT || 4317)
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

if (!KEY) {
  console.warn("\n⚠  OPENROUTER_API_KEY not set (expected in prototype/.env). Calls will fail until it is.\n")
}

// ── JSON contracts described in-prompt (OpenRouter speaks OpenAI-compatible; we instruct + parse) ──

const EXTRACT_SYS =
  "You are an expert qualitative UX researcher building reusable user personas (\"Sims\") from interview/call transcripts. " +
  "Identify each distinct HUMAN speaker who is a user, customer, or stakeholder. For each produce a persona. " +
  "type is \"client\" for an external customer/user, \"internal\" for someone on the product/company team. " +
  "Each insight is typed pain | want | love and MUST be anchored to a short verbatim quote from the transcript. " +
  "Skip a pure facilitator/interviewer who reveals no preferences of their own. Be faithful to what people actually said.\n\n" +
  "Respond with ONLY a JSON object, no prose, in exactly this shape:\n" +
  '{"personas":[{"name":string,"role":string,"type":"client"|"internal","initials":string(2 uppercase letters),' +
  '"accent":string(hex colour like #6366f1),"summary":string,"insights":[{"kind":"pain"|"want"|"love","text":string,"quote":string}]}]}'

const REACT_SYS =
  "You ARE the given user persona, reviewing a screenshot of a product page as if really using it. " +
  "React in FIRST PERSON, grounded in this persona's documented pains, wants, and loves — reference them naturally. " +
  "Give 1-3 reactions, most important first. The box is a normalised 0..1 bounding box locating the element in the image " +
  "(x,y = top-left; w,h = size; all 0..1), or null if you can't localise it. suggestedBug is filled only when it's a real " +
  "problem worth filing to an issue tracker, else null. Stay in character and be specific to what you actually see.\n\n" +
  "Respond with ONLY a JSON object, no prose, in exactly this shape:\n" +
  '{"reactions":[{"observation":string(<=240 chars, first person),"sentiment":"frustrated"|"confused"|"satisfied"|"delighted"|"neutral",' +
  '"emoji":string,"targetDescription":string,"box":{"x":number,"y":number,"w":number,"h":number}|null,' +
  '"suggestedBug":{"title":string,"body":string,"severity":"high"|"medium"|"low"}|null}]}'

// ── OpenRouter call ──────────────────────────────────────────────────────────

async function chat(messages: any[], maxTokens: number) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Klav Sims Prototype",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data: any = await res.json()
  const content: string = data?.choices?.[0]?.message?.content ?? ""
  const u = data?.usage || {}
  return { content, usage: { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens } }
}

function parseJSON(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    const m = s.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
    throw new Error("Model did not return valid JSON")
  }
}

async function extractPersonas(transcript: string) {
  const { content, usage } = await chat(
    [
      { role: "system", content: EXTRACT_SYS },
      { role: "user", content: "TRANSCRIPT:\n\n" + transcript },
    ],
    4000,
  )
  return { data: parseJSON(content), usage }
}

async function reactToPage(persona: any, imageB64: string, mediaType: string, pageUrl: string) {
  const { content, usage } = await chat(
    [
      { role: "system", content: REACT_SYS },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "You are this persona:\n" +
              JSON.stringify(persona, null, 2) +
              `\n\nReact to this screenshot of the page at ${pageUrl || "(unknown URL)"}.`,
          },
          { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageB64}` } },
        ],
      },
    ],
    2500,
  )
  return { data: parseJSON(content), usage }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

Bun.serve({
  port: PORT,
  idleTimeout: 180,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(Bun.file(import.meta.dir + "/public/index.html"))
    }

    if (req.method === "POST" && url.pathname === "/api/extract") {
      try {
        const { transcript } = await req.json()
        if (!transcript || transcript.trim().length < 20) return json({ error: "Transcript too short" }, 400)
        const { data, usage } = await extractPersonas(transcript)
        return json({ personas: data.personas || [], usage })
      } catch (e: any) {
        console.error("extract error:", e?.message)
        return json({ error: e?.message || "extract failed" }, 500)
      }
    }

    if (req.method === "POST" && url.pathname === "/api/react") {
      try {
        const { persona, imageB64, mediaType, pageUrl } = await req.json()
        if (!persona || !imageB64) return json({ error: "persona and imageB64 required" }, 400)
        const { data, usage } = await reactToPage(persona, imageB64, mediaType || "image/png", pageUrl || "")
        return json({ reactions: data.reactions || [], usage })
      } catch (e: any) {
        console.error("react error:", e?.message)
        return json({ error: e?.message || "react failed" }, 500)
      }
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`\n⚡ Klav Sims prototype → http://localhost:${PORT}`)
console.log(`   model: ${MODEL} (via OpenRouter)${KEY ? "" : "   — no key set"}\n`)

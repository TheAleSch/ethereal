// Generates the agent-facing endpoints into public/ so they are plain static
// files — no SSR route, no runtime cost, and they work on any static host.
//
// Runs on `buildStart`, which fires for both `vite dev` and `vite build`, so
// what you read at localhost:3000/llms.txt is what ships.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"

import { fullReference, llmsTxt } from "./src/content/to-markdown"
import { ROUTES, SITE, abs } from "./src/content/site"

const here = dirname(fileURLToPath(import.meta.url))
const README = resolve(here, "../../packages/ethereal/README.md")
const PKG_DIST = resolve(here, "../../packages/ethereal/dist/index.js")
const OUT = resolve(here, "public")

/** Preset names come from the built package so the list can never go stale.
 *  If the package has not been built yet the section is simply omitted —
 *  a missing optional section beats a wrong one, and beats failing the build. */
async function presetNames(): Promise<string[] | undefined> {
  try {
    const mod = (await import(PKG_DIST)) as { EVENT_HORIZON_PRESETS?: Record<string, unknown> }
    const names = Object.keys(mod.EVENT_HORIZON_PRESETS ?? {})
    return names.length ? names : undefined
  } catch (err) {
    console.warn(
      `[ai-endpoints] could not read EVENT_HORIZON_PRESETS from the package ` +
        `(run \`npm run build\` first) — omitting the presets section. ${(err as Error).message}`
    )
    return undefined
  }
}

function sitemap(): string {
  const urls = ROUTES.map((r) => {
    // the root entry conventionally carries its trailing slash; abs() drops it
    const loc = r.path === "/" ? `${SITE.url}/` : abs(r.path)
    return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`
  }).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

// Explicitly allow the AI crawlers rather than relying on the wildcard: several
// of them treat an absent named group as a reason to be conservative, and the
// whole point of the llms.txt files is to be read.
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "cohere-ai",
]

function robots(): string {
  const named = AI_AGENTS.map((a) => `User-agent: ${a}\nAllow: /`).join("\n\n")
  return `# https://www.robotstxt.org/robotstxt.html\n\nUser-agent: *\nAllow: /\n\n${named}\n\nSitemap: ${abs("/sitemap.xml")}\n`
}

export function aiEndpoints(): Plugin {
  return {
    name: "ethereal:ai-endpoints",
    async buildStart() {
      const readme = readFileSync(README, "utf8")
      const full = fullReference(readme, await presetNames())
      mkdirSync(OUT, { recursive: true })
      const files: Record<string, string> = {
        "llms.txt": llmsTxt(),
        // same bytes, two names: /llms-full.txt is the convention agents look
        // for, /docs.md is what a human reaches for (and what the "Copy as
        // Markdown" button on /docs fetches)
        "llms-full.txt": full,
        "docs.md": full,
        "sitemap.xml": sitemap(),
        "robots.txt": robots(),
      }
      for (const [name, body] of Object.entries(files)) {
        writeFileSync(resolve(OUT, name), body, "utf8")
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- rollup types `info` as always present on the plugin context, but it only exists from Rollup 3 / Vite 4 on, and the hook also runs under Vitest's stub context
      this.info?.(`generated ${Object.keys(files).length} endpoints for ${SITE.url}`)
    },
  }
}

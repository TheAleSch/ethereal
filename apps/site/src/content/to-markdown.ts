// Renders the docs data as markdown for the agent-facing endpoints.
//
// Two rules keep this honest:
//   1. Every fact comes from somewhere that already exists — the prop tables
//      from docs-data.ts (which the /docs page renders), the prose from the
//      package README (the canonical narrative). Nothing is retyped here, so
//      nothing can drift.
//   2. It runs in plain Node from the Vite plugin, so no JSX, no React, no
//      `@/` alias at runtime — type-only imports get erased by esbuild.

import {
  ETHEREAL_GROUPS,
  EVENT_HORIZON_GROUPS,
  ETHEREAL_DITHER_GROUPS,
  STATE_PROPS,
  NAV,
  INSTALL,
  INSTALL_SHADCN,
  MINIMAL,
  WRAP,
  HOST_CODE,
} from "./docs-data"
import { SITE, ROUTES, abs } from "./site"
import type { PropGroup, PropRow } from "@/components/docs/prop-table"

/** Table cells are pipe-delimited, and several `type` strings carry newlines
 *  for the HTML table's wrapping — both break a markdown row. */
const cell = (s: string) => s.replace(/\n/g, " ").replace(/\|/g, "\\|").trim()

function rowsToTable(rows: PropRow[]): string {
  const head = "| Prop | Type | Default | Description |\n| --- | --- | --- | --- |"
  const body = rows
    .map((r) => `| \`${cell(r.name)}\` | \`${cell(r.type)}\` | \`${cell(r.default)}\` | ${cell(r.description)} |`)
    .join("\n")
  return `${head}\n${body}`
}

function groupsToMarkdown(groups: PropGroup[]): string {
  return groups.map((g) => `#### ${g.title}\n\n${rowsToTable(g.rows)}`).join("\n\n")
}

const fence = (code: string, lang = "tsx") => "```" + lang + "\n" + code + "\n```"

/* --------------------------------------------------------------- llms.txt */

/**
 * The llmstxt.org index: a title, a one-line summary, and links. Deliberately
 * short — it is the file an agent reads FIRST to decide what else to fetch.
 */
export function llmsTxt(): string {
  const docLinks = NAV.map(
    (n) => `- [${n.label}](${abs("/docs.md")}#${n.id})`
  ).join("\n")
  const pageLinks = ROUTES.map((r) => `- [${r.title}](${abs(r.path)}): ${r.description}`).join("\n")

  return `# ${SITE.pkg}

> ${SITE.tagline}

Two effects ship in one package. **Ethereal** is a travelling-light comet: a lit
stretch of border ring, an interior color wash, thin light needles and a
white-hot core, all following a constant-speed superellipse path around your
element. **Event Horizon** is a black-hole accretion disk. **EtherealDither**
renders the same comet as quantized blocks on a canvas.

The one rule that is easy to get wrong: the effect must be a **child** of a host
that is \`position: relative\` **and** \`isolation: isolate\`. Replaced elements
(\`<input>\`, \`<img>\`) cannot contain children — wrap them in \`<EtherealWrap>\`
instead.

## Docs

${docLinks}

## Pages

${pageLinks}

## Optional

- [Full reference as one markdown file](${abs("/llms-full.txt")}): every prop, the state system, theme resolution and the host contract.
- [Source](${SITE.repo})
- [shadcn/ui registry item](${abs("/r/ethereal.json")}): \`${INSTALL_SHADCN}\`
`
}

/* ---------------------------------------------------------- full reference */

/**
 * The whole reference as one file, served at both /llms-full.txt and /docs.md.
 *
 * `readme` is the package README verbatim — it is the canonical prose for
 * install, states, theme resolution, behavior and the clipping caveat, and
 * re-authoring any of it here would just create a second thing to update.
 * The generated prop tables are appended, since the README only carries a
 * "key props" summary.
 */
export function fullReference(readme: string, presetNames?: string[]): string {
  const presets = presetNames?.length
    ? `\n## Event Horizon presets\n\nExported as \`EVENT_HORIZON_PRESETS\`:\n\n${presetNames
        .map((n) => `- \`${n}\``)
        .join("\n")}\n\n${fence(
        `import { EventHorizon, EVENT_HORIZON_PRESETS } from '${SITE.pkg}'\n\n<EventHorizon {...EVENT_HORIZON_PRESETS['${presetNames[0]}']} />`
      )}\n`
    : ""

  return `# ${SITE.pkg} — full reference

> ${SITE.tagline}

- Docs: ${abs("/docs")}
- Playground: ${abs("/playground")}
- Source: ${SITE.repo}
- License: ${SITE.license}

---

${readme.trim()}

---

# Complete prop reference

Every prop below is an optional override of the exported defaults
(\`ETHEREAL\`, \`EVENT_HORIZON\`, \`ETHEREAL_DITHER\`).

<a id="getting-started"></a>
## Getting started

${fence(INSTALL, "sh")}

Or via the shadcn/ui registry — this drops an \`EtherealButton\` you own into
\`components/ui/\` and adds the package as a dependency, so fixes still arrive
over npm rather than being stranded in your tree:

${fence(INSTALL_SHADCN, "sh")}

${fence(MINIMAL)}

### The host contract

${fence(HOST_CODE, "css")}

<a id="wrappers"></a>
### Wrap components

${fence(WRAP)}

<a id="ethereal-api"></a>
## \`<Ethereal>\` props

${groupsToMarkdown(ETHEREAL_GROUPS)}

<a id="states"></a>
## State, theme & interaction props

Accepted by all three components. \`Cfg\` in the type column is the component's
own config type: \`EtherealCfg\`, \`EventHorizonCfg\` or \`EtherealDitherCfg\`.

${rowsToTable(STATE_PROPS)}

### Tuning this in the playground

The playground edits the same cascade, one cell at a time. The \`Base\` row is
the flat config every state inherits; each named state below it is a \`states\`
entry. Inside a row, two pill strips pick the cell you are editing: theme, then
interaction slot.

On the \`Base\` row the theme pills read \`base\` and \`dark ^\` rather than
light/dark, because the base config is not symmetric: \`base\` edits the shared
flat props, and \`dark ^\` writes a \`themes.dark\` override on top — the same
shape as Tailwind's base styles plus \`dark:\` variants. On a named state the
pills are plain \`light\` / \`dark\`, because a state does have two symmetric
branches.

A green dot on a pill means that cell holds overrides; an amber dot beside a
control means that cell sets it, and clicking it clears the override. The
expanded control section persists across theme, slot and state switches.

<a id="event-horizon-api"></a>
## \`<EventHorizon>\` props

${groupsToMarkdown(EVENT_HORIZON_GROUPS)}
${presets}
<a id="ethereal-dither-api"></a>
## \`<EtherealDither>\` props

The same travelling comet rendered as ordered-dithered blocks on a canvas. It
repaints every tick instead of writing CSS variables, so consider
\`setTickRate(30)\` when you use it.

${groupsToMarkdown(ETHEREAL_DITHER_GROUPS)}

<a id="behavior"></a>
## Notes for coding agents

- The host **must** be \`position: relative\` and \`isolation: isolate\`, and the
  effect **must** be a child of it. Without the stacking context the glow paints
  over your content instead of behind it.
- Keep your own content on a higher layer (\`relative z-10\`) so it sits above
  the glow.
- Replaced elements (\`<input>\`, \`<img>\`, \`<textarea>\`) cannot contain
  children. Use \`<EtherealWrap>\` / \`<EventHorizonWrap>\` / \`<EtherealDitherWrap>\`,
  which render the host span for you.
- All three components already ship the \`'use client'\` directive, so they can
  be imported straight into a React Server Component.
- \`place: 'external'\` and \`'ext-border'\` paint outside the host and can be
  clipped by any ancestor with \`overflow: hidden\`.
- One shared rAF loop drives every mounted instance; instances pause when
  off-screen and render a static glow under \`prefers-reduced-motion: reduce\`.
`
}

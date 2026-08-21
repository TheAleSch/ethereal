"use client"

import { useCallback } from "react"
import { Bot, Check } from "lucide-react"

import { abs } from "@/content/site"
import { cn } from "@/lib/utils"
import { useCopy } from "@/lib/use-copy"
import { hostSnippet } from "./host-snippet"
import type { PreviewKind } from "./host-snippet"
import type { PreviewHostKind } from "./preview-host-kind"

/** Everything an assistant needs that the JSX alone does not carry.
 *
 *  Pasting the generated snippet into a chat loses the two things people
 *  actually get wrong: the package it comes from, and the host contract (the
 *  effect is a CHILD of a `relative isolate` element, and replaced elements
 *  cannot host it). Those are not visible anywhere in the snippet, so an
 *  assistant reconstructs them by guessing. The reference URL is handed over
 *  rather than inlined — it is ~23kB and the assistant can fetch it. */
export function aiPayload(
  code: string,
  effect: string,
  host: PreviewHostKind,
  label: string,
  kind: PreviewKind,
  light: boolean
) {
  // the generated code is `import` + a generic host; split them so the real
  // previewed host can replace the generic one and the import still leads
  const [imports = "", jsx = ""] = code.split("\n\n")
  const snippet = `${imports}\n\n${hostSnippet(host, jsx.trim(), label, kind, light)}`

  return `I'm using ${effect} from the \`@theale/ethereal\` React package.

Here is the exact configuration I tuned in the playground, on the same host
element the playground previews it on:

\`\`\`tsx
${snippet}
\`\`\`

Rules that this snippet does not show, and that are easy to get wrong:

- The effect is a CHILD of the element it decorates. That element must have
  \`position: relative\` AND \`isolation: isolate\`, and your own content must sit
  on a higher layer (\`relative z-10\`).
- Replaced elements (\`input\`, \`textarea\`, \`img\`, \`video\`) cannot contain
  children — wrap them with the \`*Wrap\` variant instead.
- The effect element renders nothing of its own. Do not give it a className and
  do not try to size it.
- \`place: 'external'\` / \`'both'\` paint outside the host, so any ancestor with
  \`overflow: hidden\` clips them.

Full API reference (fetch this): ${abs("/llms-full.txt")}

Help me integrate this into my app.`
}

export function CopyForAi({
  code,
  effect,
  host,
  label,
  kind,
  light,
  className,
}: {
  code: string
  /** the component name, e.g. "<Ethereal>" — names the effect in the prompt */
  effect: string
  /** which preview host is selected, so the snippet matches what is on screen */
  host: PreviewHostKind
  label: string
  /** which effect tab, and which backdrop — together they pick the surface
   *  classes, so the paste matches what is on screen */
  kind: PreviewKind
  light: boolean
  className?: string
}) {
  // useCopy never reports success on a failed write — a silent lie there
  // means the user pastes whatever was in the clipboard before
  const { state, copy } = useCopy()
  const copyPayload = useCallback(
    () => void copy(aiPayload(code, effect, host, label, kind, light)),
    [copy, code, effect, host, label, kind, light]
  )

  return (
    <button
      type="button"
      onClick={copyPayload}
      aria-label="Copy this configuration as a prompt, with the host contract and a link to the full reference"
      title="Copy for an AI assistant — includes the host contract and the reference URL"
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      {state === "copied" ? (
        <Check className="size-3.5 text-emerald-400" />
      ) : (
        <Bot className="size-3.5" />
      )}
      {state === "copied"
        ? "Copied"
        : state === "error"
          ? "Copy failed"
          : "Copy for AI"}
    </button>
  )
}

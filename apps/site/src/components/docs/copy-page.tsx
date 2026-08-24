"use client"

import { Check, ChevronDown, Copy, ExternalLink, FileText } from "lucide-react"

import { abs } from "@/content/site"
import { useCopy } from "@/lib/use-copy"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** The generated markdown reference — same bytes as /llms-full.txt. */
const MD_PATH = "/docs.md"

// Pre-seeded prompts. Both assistants can fetch a URL, so handing them the
// markdown endpoint beats pasting 23kB into a query string (and beats the URL
// length limits that would truncate it).
const PROMPT = encodeURIComponent(
  `Read ${abs(MD_PATH)} and help me use @theale/ethereal in my React app.`
)
const ASK = [
  { label: "Open in Claude", href: `https://claude.ai/new?q=${PROMPT}` },
  { label: "Open in ChatGPT", href: `https://chatgpt.com/?q=${PROMPT}` },
]

export function CopyPage() {
  const { state, copy } = useCopy(2000)
  const copyPage = () =>
    void copy(async () => {
      // fetched rather than bundled: the markdown is a build artifact, and
      // inlining 23kB of it into the page payload to support one button
      // would be a poor trade
      const res = await fetch(MD_PATH)
      if (!res.ok) throw new Error(String(res.status))
      return res.text()
    })

  const btn =
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:bg-white/5 focus-visible:outline-none"

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-white/10">
      <button
        type="button"
        onClick={copyPage}
        className={cn(btn, "border-r border-white/10")}
      >
        {state === "copied" ? (
          <Check className="size-3.5 text-emerald-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {state === "copied"
          ? "Copied"
          : state === "error"
            ? "Copy failed"
            : "Copy as Markdown"}
      </button>
      <Popover>
        <PopoverTrigger
          aria-label="More formats for AI tools"
          className={cn(btn, "px-1.5")}
        >
          <ChevronDown className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <a
            href={MD_PATH}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <FileText className="size-3.5" />
            View as Markdown
          </a>
          {ASK.map((a) => (
            <a
              key={a.label}
              href={a.href}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
              {a.label}
            </a>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}

"use client"

import { Check, Copy } from "lucide-react"
import { useCopy } from "@/lib/use-copy"
import { cn } from "@/lib/utils"

export function CodeBlock({
  code,
  lang = "tsx",
  className,
}: {
  code: string
  lang?: string
  className?: string
}) {
  const { copied, state, copy } = useCopy()

  return (
    <div
      data-slot="docs-code-block"
      className={cn("group relative", className)}
    >
      <button
        data-slot="docs-code-copy"
        type="button"
        onClick={() => void copy(code)}
        title={copied ? "Copied" : "Copy code"}
        aria-label={
          copied ? "Copied" : state === "error" ? "Copy failed" : "Copy code"
        }
        className="hit-44 absolute top-1/2 right-2 z-10 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-[#151518] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <pre className="overflow-x-auto rounded-xl border border-white/[0.07] bg-[#0b0b0d] p-4 pr-16 text-[13px] leading-relaxed">
        <code data-lang={lang} className="font-mono text-zinc-300">
          {code}
        </code>
      </pre>
    </div>
  )
}

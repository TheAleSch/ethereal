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
    <div className={cn("group relative", className)}>
      <button
        type="button"
        onClick={() => void copy(code)}
        aria-label={
          copied ? "Copied" : state === "error" ? "Copy failed" : "Copy code"
        }
        className="hit-44 absolute top-2.5 right-2.5 z-10 inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:border-white/20 hover:text-foreground focus-visible:opacity-100"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <pre className="overflow-x-auto rounded-lg border border-white/[0.07] bg-[#0b0b0d] p-4 text-[13px] leading-relaxed">
        <code data-lang={lang} className="font-mono text-zinc-300">
          {code}
        </code>
      </pre>
    </div>
  )
}

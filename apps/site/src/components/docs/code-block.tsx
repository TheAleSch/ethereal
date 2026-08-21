"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
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
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copy = () => {
    // onClick only fires in the browser — no SSR guard needed, but be defensive
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- lib.dom types Clipboard as always present; it is absent on insecure origins (plain http, file://), where reading it unguarded throws
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    }).catch(() => setCopied(false))
  }

  return (
    <div className={cn("group relative", className)}>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute top-2.5 right-2.5 z-10 inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:border-white/20 hover:text-foreground focus-visible:opacity-100"
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

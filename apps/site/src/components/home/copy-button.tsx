"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copy = useCallback(() => {
    // client-only event handler — safe to touch the clipboard here
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- lib.dom types Clipboard as always present; it is absent on insecure origins (plain http, file://), so the button must no-op rather than throw
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    }).catch(() => setCopied(false))
  }, [value])

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
    </button>
  )
}

"use client"

import { Check, Copy } from "lucide-react"

import { useCopy } from "@/lib/use-copy"
import { cn } from "@/lib/utils"

export function CopyButton({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const { copied, state, copy } = useCopy()

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      aria-label={
        copied
          ? "Copied"
          : state === "error"
            ? "Copy failed"
            : "Copy to clipboard"
      }
      className={cn(
        "hit-44-pseudo inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-input/30 text-muted-foreground transition-colors hover:bg-input/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      {copied ? (
        <Check className="size-4 text-emerald-400" />
      ) : (
        <Copy className="size-4" />
      )}
    </button>
  )
}

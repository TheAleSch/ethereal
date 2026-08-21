"use client"

import * as React from "react"
import { Ethereal, type EtherealProps } from "@theale/ethereal"

import { cn } from "@/lib/utils"

/**
 * A button wearing the travelling-light glow.
 *
 * The only host contract is a stacking context — `relative isolate` — which
 * this component applies for you. Everything else is an ordinary <button>.
 *
 * Pass any Ethereal config through `glow`:
 *   <EtherealButton glow={{ path: "around", heads: 2, spin: "counter" }}>
 */
export function EtherealButton({
  glow,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { glow?: EtherealProps }) {
  return (
    <button
      className={cn(
        "relative isolate inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium transition-colors hover:bg-white/[0.08]",
        className
      )}
      {...props}
    >
      {/* z-10 keeps the label above the glow layers */}
      <span className="relative z-10">{children}</span>
      <Ethereal path="around" heads={2} spin="counter" {...glow} />
    </button>
  )
}

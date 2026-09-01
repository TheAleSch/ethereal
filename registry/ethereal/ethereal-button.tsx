"use client";

import * as React from "react";
import { Ethereal, type EtherealProps } from "ethereal-glow";

import { cn } from "@/lib/utils";

/**
 * A button wearing the travelling-light glow.
 *
 * The only host contract is a stacking context — `relative isolate` — which
 * this component applies for you. Everything else is an ordinary <button>:
 * display, sizing and colors are defaults your `className`/`style` can
 * override, so `hidden` and `style={{ display: "none" }}` work as expected.
 *
 * Pass any Ethereal config through `glow`:
 *   <EtherealButton glow={{ path: "around", heads: 2, spin: "counter" }}>
 */
export const EtherealButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { glow?: EtherealProps }
>(function EtherealButton({ glow, className, style, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium transition-colors hover:bg-white/[0.08]",
        className,
        // Host-contract invariants come last so tailwind-merge cannot let
        // caller utilities such as `static` or `isolation-auto` cancel them.
        "relative isolate",
      )}
      // Caller styles spread first: anything except the host contract may be
      // overridden (display: none must win; position/isolation must not).
      style={{
        ...style,
        position: "relative",
        isolation: "isolate",
      }}
      {...props}
    >
      {/* z-10 keeps the label above the glow layers */}
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
      <Ethereal path="around" heads={2} spin="counter" {...glow} />
    </button>
  );
});

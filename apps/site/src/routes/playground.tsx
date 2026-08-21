import { createFileRoute } from "@tanstack/react-router"

import { pageHead } from "@/lib/head"

import { Playground } from "@/components/playground/playground"

// tab is optional in the TYPE (so `<Link to="/playground">` needs no search
// prop) but always resolved at runtime; the component defaults a missing tab.
type PlaygroundSearch = {
  tab?: "ethereal" | "eh" | "dither"
  // override objects ride the search params NATIVELY — TanStack's search
  // serializer already JSON-encodes values, so passing a pre-stringified
  // JSON string would double-encode (and hand-written ?c={...} links would
  // arrive parsed as objects and fail a string check)
  c?: Record<string, unknown>
  h?: Record<string, unknown>
  d?: Record<string, unknown>
  s?: string // Ethereal named state (built-in or a key of st)
  st?: Record<string, unknown> // custom/customized state partials
  tm?: Record<string, unknown> // per-theme base config overrides
}

const asObj = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined

export const Route = createFileRoute("/playground")({
  // parse defensively: only known shapes survive, everything else falls back
  validateSearch: (search: Record<string, unknown>): PlaygroundSearch => ({
    tab: search.tab === "eh" ? "eh" : search.tab === "dither" ? "dither" : search.tab === "ethereal" ? "ethereal" : undefined,
    c: asObj(search.c),
    h: asObj(search.h),
    d: asObj(search.d),
    s: typeof search.s === "string" ? search.s : undefined,
    st: asObj(search.st),
    tm: asObj(search.tm),
  }),
  head: () => pageHead("/playground"),
  component: Playground,
})

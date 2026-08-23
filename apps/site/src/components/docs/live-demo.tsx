import { Ethereal } from "@theale/ethereal"

// A single live effect instance for the top of the docs page. Ethereal renders
// an empty <span> on the server (all DOM work happens in useEffect), so this is
// safe under prerender — the glow lights up on the client.
export function LiveDemo() {
  return (
    <div className="flex items-center justify-center rounded-xl border border-white/[0.07] bg-[#0a0a0c] px-6 py-10">
      <div className="relative isolate rounded-xl border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm font-medium text-foreground">
        <span className="relative z-10">Get started</span>
        <Ethereal path="around" heads={2} spin="counter" hover="boost" />
      </div>
    </div>
  )
}

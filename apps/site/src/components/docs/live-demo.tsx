import { Ethereal } from "ethereal-glow"
import { Link } from "@tanstack/react-router"

// A single live effect instance for the top of the docs page. Ethereal renders
// an empty <span> on the server (all DOM work happens in useEffect), so this is
// safe under prerender — the glow lights up on the client.
export function LiveDemo() {
  return (
    <div className="flex items-center justify-center rounded-2xl bg-white/[0.02] p-6 sm:p-8">
      <Link
        to="/playground"
        className="relative isolate inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-7 py-3 text-sm font-medium text-foreground transition-[color,background-color,transform] hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none active:scale-[0.96]"
      >
        <span className="relative z-10">Get started</span>
        <Ethereal path="around" heads={2} spin="counter" hover="boost" />
      </Link>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"

/** Quiet hint for the hidden Asteroids game in <KonamiAsteroids/>. Dismissed
 *  state persists, so it nags once and never again. */
export function KonamiTip() {
  const [dismissed, setDismissed] = useState(true)

  // read localStorage after mount — the route is prerendered, so reading it
  // during render would hydrate a tree that differs from the static HTML
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("ethereal:konami-tip") === "done")
    } catch {
      setDismissed(false)
    }
  }, [])

  if (dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem("ethereal:konami-tip", "done")
    } catch {
      /* private mode — the tip simply returns next visit */
    }
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      aria-label="Dismiss hint: try the Konami code"
      className="fixed right-4 bottom-4 z-40 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
    >
      try the konami code
    </button>
  )
}

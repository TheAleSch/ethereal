"use client"

import { useEffect, useRef, useState } from "react"
import { getTickRate } from "ethereal-glow"

import { cn } from "@/lib/utils"

/** Frames actually painted per second, sampled over a rolling window.
 *
 *  This measures the BROWSER's frame rate, not the effect's tick rate — the
 *  two differ on purpose. `setTickRate` gates how often the shared loop does
 *  work; the compositor still paints at display refresh. A tick rate of 30
 *  with a solid 60 here means the gating is working, not that something is
 *  dropping frames. Both are shown so the distinction is visible. */
function useFps(sampleMs = 500) {
  const [fps, setFps] = useState<number | null>(null)
  const frames = useRef(0)
  const since = useRef(0)

  useEffect(() => {
    let raf = 0
    let alive = true
    const loop = (t: number) => {
      if (!alive) return
      if (!since.current) since.current = t
      frames.current++
      const dt = t - since.current
      if (dt >= sampleMs) {
        setFps(Math.round((frames.current * 1000) / dt))
        frames.current = 0
        since.current = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [sampleMs])

  return fps
}

/** Long-task pressure: the fraction of the last second spent in tasks over
 *  50ms. A glow that looks smooth while pinning the main thread is still a
 *  problem for the page it sits on, and an fps readout alone hides that. */
function useJank(windowMs = 1000) {
  const [blockedMs, setBlockedMs] = useState<number | null>(null)
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typed as required, but `supportedEntryTypes` is missing on older Safari, where reading .includes off undefined would throw before observe() ever ran
    if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return
    let entries: { end: number; dur: number }[] = []
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        entries.push({ end: e.startTime + e.duration, dur: e.duration })
    })
    obs.observe({ entryTypes: ["longtask"] })
    const id = setInterval(() => {
      const now = performance.now()
      entries = entries.filter((e) => now - e.end < windowMs)
      setBlockedMs(Math.round(entries.reduce((a, e) => a + e.dur, 0)))
    }, 500)
    return () => {
      obs.disconnect()
      clearInterval(id)
    }
  }, [windowMs])
  return blockedMs
}

export function PerfHud({ className }: { className?: string }) {
  const fps = useFps()
  const blocked = useJank()
  const [tick, setTick] = useState<number | null>(null)

  // the tick rate is module-level in the package, so poll rather than
  // subscribe — at 1Hz this costs nothing and avoids adding an observer to
  // the library purely for a debug readout
  useEffect(() => {
    const read = () => setTick(getTickRate())
    read()
    const id = setInterval(read, 1000)
    return () => clearInterval(id)
  }, [])

  const reduced =
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typed as required on Window, but jsdom (and any non-browser DOM shim this renders under) does not implement matchMedia
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

  const fpsTone =
    fps === null
      ? "text-muted-foreground"
      : fps >= 55
        ? "text-emerald-400"
        : fps >= 30
          ? "text-amber-300"
          : "text-red-400"

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 bottom-3 z-20 flex flex-col gap-0.5 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-right font-mono text-[10px] leading-tight text-muted-foreground backdrop-blur-sm",
        className
      )}
    >
      <span className={cn("tabular-nums", fpsTone)}>{fps ?? "—"} fps</span>
      <span className="tabular-nums">
        tick {tick === 0 ? "native" : `${tick ?? "—"}`}
      </span>
      {blocked !== null && (
        <span
          className={cn(
            "tabular-nums",
            blocked > 100 ? "text-amber-300" : undefined
          )}
        >
          blocked {blocked}ms/s
        </span>
      )}
      {reduced && <span className="text-amber-300">reduced motion</span>}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"

// deterministic pseudo-random (same idea as the playground starfield) so the
// server-rendered HTML matches hydration exactly — no Math.random in render
const rand = (i: number, s = 1) => {
  const x = Math.sin((i + 1) * 12.9898 * s) * 43758.5453
  return x - Math.floor(x)
}

// every value quantized to a short string — server and client Math.sin can
// disagree in the last float digits, which hydration flags as a mismatch
const STARS = Array.from({ length: 160 }, (_, i) => ({
  left: `${(rand(i, 1.3) * 100).toFixed(2)}%`,
  top: `${(rand(i, 2.7) * 100).toFixed(2)}%`,
  size: rand(i, 3.1) > 0.85 ? 2 : 1,
  base: +(0.25 + rand(i, 4.9) * 0.55).toFixed(3),
  dur: (2.5 + rand(i, 5.3) * 5).toFixed(2),
  delay: (-rand(i, 6.1) * 8).toFixed(2),
}))

type Shot = { id: number; x: number; y: number; angle: number }

/**
 * Full-viewport starry-night backdrop: fixed behind everything, deep navy
 * wash, twinkling stars, and a shooting star every few seconds.
 * Client-only randomness lives in effects; the starfield itself is
 * deterministic and prerender-safe.
 */
export function StarBg() {
  const [shots, setShots] = useState<Shot[]>([])

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let n = 0
    const spawn = (x: number, y: number) =>
      setShots((s) => [...s.slice(-5), { id: n++, x, y, angle: 15 + Math.random() * 40 }])
    // ambient: one every few seconds from the upper sky
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(
        () => {
          spawn(5 + Math.random() * 60, Math.random() * 45)
          schedule()
        },
        4000 + Math.random() * 7000
      )
    }
    schedule()
    // interactive: every click launches one from the click point
    const onClick = (e: MouseEvent) => {
      spawn((e.clientX / window.innerWidth) * 100, (e.clientY / window.innerHeight) * 100)
    }
    window.addEventListener("click", onClick)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* deep-space wash, brightest near the top like the preview panel */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#101012_0%,#0a0a0b_45%,#060606_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_-10%,rgba(255,255,255,0.05),transparent_60%)]" />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="star-twinkle absolute rounded-full bg-white motion-reduce:animate-none"
          style={
            {
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              // fallback when the animation is off (reduced motion);
              // the keyframes read the var for the per-star peak
              opacity: s.base,
              "--tw-star-base": String(s.base),
              animationDuration: `${s.dur}s`,
              animationDelay: `${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
      {shots.map((shot) => (
        <span
          key={shot.id}
          className="absolute"
          style={{ left: `${shot.x}%`, top: `${shot.y}%`, transform: `rotate(${shot.angle}deg)` }}
        >
          <span
            className="shooting-star block"
            onAnimationEnd={() => setShots((s) => s.filter((x) => x.id !== shot.id))}
          />
        </span>
      ))}
    </div>
  )
}

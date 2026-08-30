// Shared gradient/color helpers for both effects.

export const smoothstep = (fraction: number) => fraction * fraction * (3 - 2 * fraction)

// trapezoid envelope: 0 before `riseStart`, ramping to 1 across the rise,
// flat until `fallStart`, ramping back to 0 by `fallEnd`
export const trap = (progress: number, riseStart: number, riseEnd: number, fallStart: number, fallEnd: number) =>
  progress < riseStart
    ? 0
    : progress < riseEnd
      ? smoothstep((progress - riseStart) / (riseEnd - riseStart))
      : progress < fallStart
        ? 1
        : progress < fallEnd
          ? smoothstep(1 - (progress - fallStart) / (fallEnd - fallStart))
          : 0

export type TravelEase = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'back' | 'bounce'

export const EASE: Record<TravelEase, (progress: number) => number> = {
  linear: (progress) => progress,
  'ease-in': (progress) => progress * progress * progress,
  'ease-out': (progress) => 1 - Math.pow(1 - progress, 3),
  'ease-in-out': (progress) =>
    progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2,
  back: (progress) => {
    const overshoot = 1.70158,
      amplitude = overshoot + 1
    return amplitude * progress * progress * progress - overshoot * progress * progress
  },
  bounce: (progress) => {
    const scale = 7.5625,
      split = 2.75
    if (progress < 1 / split) return scale * progress * progress
    if (progress < 2 / split) return scale * (progress -= 1.5 / split) * progress + 0.75
    if (progress < 2.5 / split) return scale * (progress -= 2.25 / split) * progress + 0.9375
    return scale * (progress -= 2.625 / split) * progress + 0.984375
  },
}

// "r,g,b" triple from any CSS color. An invalid triple embedded in a
// gradient invalidates the whole background/mask longhand (a dropped MASK
// silently floods the element with unmasked paint), so this must never emit
// NaN — unparseable inputs fall back to white with a one-time warning.
const TRIP_CACHE_LIMIT = 256
const tripCache = new Map<string, string>()
let normCtx: CanvasRenderingContext2D | null | undefined
export const trip = (color: string): string => {
  const cached = tripCache.get(color)
  if (cached) {
    // Refresh insertion order so streamed palettes cannot keep old entries
    // resident while evicting colors that are still in active use.
    tripCache.delete(color)
    tripCache.set(color, cached)
    return cached
  }
  let out: string | null = null
  let hex = color.startsWith('#') ? color.slice(1) : null
  // expand #rgb/#rgba shorthand before slicing
  if (hex && (hex.length === 3 || hex.length === 4))
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('')
  if (hex && hex.length >= 6) {
    const red = parseInt(hex.slice(0, 2), 16),
      green = parseInt(hex.slice(2, 4), 16),
      blue = parseInt(hex.slice(4, 6), 16)
    if (!Number.isNaN(red + green + blue)) out = `${red},${green},${blue}`
  } else if (!hex) {
    // integer rgb()/rgba() only — %, hsl(), named colors etc. fall through
    // to canvas normalization (digits alone would mis-read them)
    const match = /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/.exec(color)
    if (match) out = `${match[1]},${match[2]},${match[3]}`
  }
  if (!out && typeof document !== 'undefined') {
    // canvas normalizes any valid CSS color to #rrggbb or rgba(r,g,b,a)
    if (normCtx === undefined) normCtx = document.createElement('canvas').getContext('2d')
    if (normCtx) {
      // an INVALID assignment to fillStyle is silently ignored per spec, so
      // the seed value survives and reads back as a legitimate answer —
      // "greeen" would come back as the seeded black. Seeding twice with
      // different colors tells the two apart: only an ignored assignment
      // leaves both seeds in place.
      normCtx.fillStyle = '#000000'
      normCtx.fillStyle = color
      const normalized = normCtx.fillStyle as string
      normCtx.fillStyle = '#ffffff'
      normCtx.fillStyle = color
      const confirm = normCtx.fillStyle as string
      if (normalized !== confirm) {
        // ignored by the canvas — leave `out` null for the white fallback
      } else if (normalized.startsWith('#')) {
        out = `${parseInt(normalized.slice(1, 3), 16)},${parseInt(normalized.slice(3, 5), 16)},${parseInt(normalized.slice(5, 7), 16)}`
      } else {
        const match = /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/.exec(normalized)
        if (match) out = `${match[1]},${match[2]},${match[3]}`
      }
    }
  }
  if (!out) {
    out = '255,255,255'
    devWarn(`[ethereal-glow] could not parse color "${color}" — using white`)
  }
  tripCache.set(color, out)
  if (tripCache.size > TRIP_CACHE_LIMIT) tripCache.delete(tripCache.keys().next().value!)
  return out
}

// display-p3 triple: same channel values, wider primaries → visible pop on
// wide-gamut screens (true >1.0 HDR white isn't expressible in CSS colors yet)
export const p3t = (color: string) =>
  trip(color)
    .split(',')
    .map((channel) => (+channel / 255).toFixed(3))
    .join(' ')

// maps a 0..1 path fraction onto the ELEMENT box of a layer inset by `inset`
// px — any layer with inset -N must pass N for gradients AND masks or the
// paint drifts away from its mask window as the head orbits
export const pos = (inset: number, fraction: string, offset?: string) =>
  `calc(${inset}px + (100% - ${2 * inset}px) * ${fraction}${offset ? ` + (${offset})` : ''})`

// ax/ay = |tangent| — blends ellipse w/h so the glow rotates with the travel
// direction as the head rounds the border
// nx/ny = the path's OUTWARD normal at the head — carried separately from
// dx/dy because a reversed head (bottom's second sweep, counter spin) flips
// its motion tangent, and deriving the normal from that tangent would point
// it inward. Default (0,1): outward for the bottom edge.
export const HEADS = [
  {
    x: 'var(--bx,.5)',
    y: 'var(--by,1)',
    dx: 'var(--dx,1)',
    dy: 'var(--dy,0)',
    ax: 'var(--adx,1)',
    ay: 'var(--ady,0)',
    nx: 'var(--nx,0)',
    ny: 'var(--ny,1)',
  },
  {
    x: 'var(--bx2,.5)',
    y: 'var(--by2,1)',
    dx: 'var(--dx2,1)',
    dy: 'var(--dy2,0)',
    ax: 'var(--adx2,1)',
    ay: 'var(--ady2,0)',
    nx: 'var(--nx2,0)',
    ny: 'var(--ny2,1)',
  },
] as const

export type Head = (typeof HEADS)[number]

export const rotWDir = (width: number, height: number, head: Head, scaleVar = 'var(--bw,1)') =>
  `calc((${width}px * ${head.ax} + ${height}px * ${head.ay}) * ${scaleVar})`
export const rotHDir = (width: number, height: number, head: Head, scaleVar = 'var(--bh,1)') =>
  `calc((${height}px * ${head.ax} + ${width}px * ${head.ay}) * ${scaleVar})`

// monotonic golden-ratio phase stagger — instances never run in sync, and
// (unlike counting live instances) mount/unmount churn can't hand two
// neighbours the same phase slot
let phaseCounter = 0
export const nextPhase = () => phaseCounter++ * 0.618

/** Console diagnostics are DEV-ONLY: `process.env.NODE_ENV` is statically
 *  replaced by every mainstream bundler, so a production build strips these
 *  calls (and their message strings) instead of spamming a consumer's error
 *  breadcrumbs. The `typeof process` guard keeps unbundled browser ESM from
 *  throwing on the bare global. */
// declared here, not via @types/node — this package is browser-only and the
// literal `process.env.NODE_ENV` below is what bundlers pattern-match on
declare const process: { env: { NODE_ENV?: string } } | undefined
export const devWarn = (message: string): void => {
  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    typeof console !== 'undefined'
  )
    console.warn(message)
}

// both effects drive the SAME CSS variables (--bx/--bs1../--hov …) on their
// host — two effects on one host silently corrupt each other, so warn
type HostClaims = { count: number; names: Map<string, number> }
const claimedHosts = new WeakMap<HTMLElement, HostClaims>()
export function claimHost(host: HTMLElement, name: string) {
  const claims = claimedHosts.get(host) ?? { count: 0, names: new Map<string, number>() }
  if (claims.count > 0) {
    const previous = [...claims.names.keys()].join('/> and <')
    devWarn(`[ethereal-glow] host already has <${previous}/> — <${name}/> on the same element will fight over CSS variables`)
  }
  claims.count++
  claims.names.set(name, (claims.names.get(name) ?? 0) + 1)
  claimedHosts.set(host, claims)
  let released = false
  return () => {
    if (released) return
    released = true
    const current = claimedHosts.get(host)
    if (!current) return
    const named = (current.names.get(name) ?? 1) - 1
    if (named > 0) current.names.set(name, named)
    else current.names.delete(name)
    current.count--
    if (current.count <= 0) claimedHosts.delete(host)
  }
}

// shared host sanity checks at mount
export function checkHost(host: HTMLElement, name: string) {
  if (getComputedStyle(host).position === 'static')
    devWarn(`[ethereal-glow] <${name}/> host has position:static — the glow will anchor to the wrong ancestor. Add position:relative + isolation:isolate.`)
}

// resolve a computed border-radius (may be '50%' or elliptical '24px 12px')
// to a px number against the host box — parseFloat alone reads '50%' as 50px
export function radiusPx(radius: string, host: HTMLElement) {
  const box = Math.min(host.offsetWidth, host.offsetHeight)
  // Elliptical corners ('40px 10px') carry a horizontal AND a vertical radius,
  // but every consumer here (the dither SDF, the hole path, the mask corners)
  // is isotropic and needs ONE number. Take the SMALLER axis: an over-large
  // radius bulges the silhouette past the real corner, which reads as paint
  // leaking outside the button; an under-large one merely hugs it tighter.
  const values = radius
    .trim()
    .split(/\s+/)
    .map((part) => {
      const value = parseFloat(part) || 0
      return part.includes('%') ? (value / 100) * box : value
    })
  return values.length ? Math.min(...values) : 0
}

// evenodd path: layer box with a ROUNDED hole where the button sits
export const holePath = (width: number, height: number, inset: number, radius: number) => {
  const corner = Math.max(0, Math.min(radius, width / 2, height / 2))
  const boxW = width + 2 * inset,
    boxH = height + 2 * inset,
    x0 = inset,
    y0 = inset,
    x1 = inset + width,
    y1 = inset + height
  return `path(evenodd, "M0 0 H${boxW} V${boxH} H0 Z M${x0 + corner} ${y0} H${x1 - corner} A${corner} ${corner} 0 0 1 ${x1} ${y0 + corner} V${y1 - corner} A${corner} ${corner} 0 0 1 ${x1 - corner} ${y1} H${x0 + corner} A${corner} ${corner} 0 0 1 ${x0} ${y1 - corner} V${y0 + corner} A${corner} ${corner} 0 0 1 ${x0 + corner} ${y0} Z")`
}

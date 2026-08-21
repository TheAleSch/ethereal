// Smooth constant-speed perimeter path — superellipse + arc-length LUT, so
// position and tangent never snap at the corners.
export const PATH_N = 512

type LUT = { pts: [number, number][]; cum: number[]; total: number }

// LUTs keyed by corner exponent + aspect (host w/h, quantized): arc-length s
// stays truly proportional to on-screen px, so px offsets (chain spacing,
// blob lags) land at the same physical distance on every edge.
const pathLUTs = new Map<string, LUT>()

export function getLUT(corner: number, aspect: number): LUT {
  // corner ≤ 0 → pow(0, negative) = Infinity → NaN cascade poisoning the
  // cached LUT (and every --bx/--by var) forever; clamp before the cache key
  const exponent = Math.max(0.05, Math.min(1.5, corner))
  const key = `${exponent}|${aspect}`
  let lut = pathLUTs.get(key)
  if (!lut) {
    // lower exponent → squarer path: the head stays pressed on the border
    // through corners instead of cutting across them
    const superellipse = (value: number) => Math.sign(value) * Math.pow(Math.abs(value), exponent)
    const pts: [number, number][] = []
    for (let step = 0; step <= PATH_N; step++) {
      const angle = (2 * Math.PI * step) / PATH_N
      pts.push([0.5 + 0.5 * superellipse(Math.sin(angle)), 0.5 + 0.5 * superellipse(Math.cos(angle))])
    }
    const cum = [0]
    for (let step = 1; step <= PATH_N; step++)
      cum.push(
        cum[step - 1]! +
          Math.hypot((pts[step]![0] - pts[step - 1]![0]) * aspect, pts[step]![1] - pts[step - 1]![1])
      )
    lut = { pts, cum, total: cum[PATH_N]! }
    pathLUTs.set(key, lut)
  }
  return lut
}

// full perimeter length in px for a host of height hostPx (LUT space is
// height-normalized), used to convert px offsets into path fractions
export const pathPx = (corner: number, aspect: number, hostPx: number) => hostPx * getLUT(corner, aspect).total

/** Arc-length fraction of the superellipse nearest `(x, y)`. This inverse is
 * needed by canvas pixels: two points can be close in straight-line distance
 * while living on opposite sides of a pill. */
export function pathFractionAt(x: number, y: number, corner = 0.3, aspect = 3) {
  const exponent = Math.max(0.05, Math.min(1.5, corner))
  const inverse = 1 / exponent
  const dx = 2 * x - 1
  const dy = 2 * y - 1
  const sin = Math.sign(dx) * Math.pow(Math.abs(dx), inverse)
  const cos = Math.sign(dy) * Math.pow(Math.abs(dy), inverse)
  let angle = Math.atan2(sin, cos)
  if (angle < 0) angle += 2 * Math.PI

  const approximate = Math.round((angle / (2 * Math.PI)) * PATH_N) % PATH_N
  const { pts, cum, total } = getLUT(exponent, aspect)
  let bestSquared = Number.POSITIVE_INFINITY
  let bestDistance = 0
  // LUT interpolation cuts slightly inside the mathematical superellipse at
  // corners, so angle alone can miss by several samples. A small local search
  // finds the closest real segment without scanning all 512 path points.
  for (let offset = -12; offset <= 12; offset++) {
    const index = (approximate + offset + PATH_N) % PATH_N
    const from = pts[index]!
    const to = pts[index + 1]!
    const vx = (to[0] - from[0]) * aspect
    const vy = to[1] - from[1]
    const tx = (x - from[0]) * aspect
    const ty = y - from[1]
    const blend = Math.max(0, Math.min(1, (tx * vx + ty * vy) / (vx * vx + vy * vy || 1)))
    const projectedX = tx - vx * blend
    const projectedY = ty - vy * blend
    const squared = projectedX * projectedX + projectedY * projectedY
    if (squared < bestSquared) {
      bestSquared = squared
      bestDistance = cum[index]! + (cum[index + 1]! - cum[index]!) * blend
    }
  }
  return bestDistance / total
}

// quantized (0.25 steps) and clamped so LUT cache stays small
export const quantAspect = (width: number, height: number) =>
  Math.max(0.5, Math.min(8, Math.round((width / Math.max(1, height)) * 4) / 4))

export function walkSmooth(fraction: number, corner = 0.3, aspect = 3) {
  const along = ((fraction % 1) + 1) % 1
  const { pts, cum, total } = getLUT(corner, aspect)
  const target = along * total
  let lo = 1,
    hi = PATH_N
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid]! < target) lo = mid + 1
    else hi = mid
  }
  const blend = (target - cum[lo - 1]!) / (cum[lo]! - cum[lo - 1]! || 1)
  const x = pts[lo - 1]![0] + (pts[lo]![0] - pts[lo - 1]![0]) * blend
  const y = pts[lo - 1]![1] + (pts[lo]![1] - pts[lo - 1]![1]) * blend
  const dx = pts[lo]![0] - pts[lo - 1]![0],
    dy = pts[lo]![1] - pts[lo - 1]![1]
  const len = Math.hypot(dx, dy) || 1
  return { x, y, dx: dx / len, dy: dy / len }
}

// rectangular walk for STATIC placement only (needles around the perimeter)
export function walkRect(fraction: number) {
  const along = ((fraction % 1) + 1) % 1
  if (along < 0.35) {
    const onEdge = along / 0.35
    return { x: 0.04 + 0.92 * onEdge, y: 1, dx: 1, dy: 0, edge: 'bottom' as const }
  }
  if (along < 0.5) {
    const onEdge = (along - 0.35) / 0.15
    return { x: 1, y: 1 - onEdge, dx: 0, dy: -1, edge: 'right' as const }
  }
  if (along < 0.85) {
    const onEdge = (along - 0.5) / 0.35
    return { x: 0.96 - 0.92 * onEdge, y: 0, dx: -1, dy: 0, edge: 'top' as const }
  }
  const onEdge = (along - 0.85) / 0.15
  return { x: 0, y: onEdge, dx: 0, dy: 1, edge: 'left' as const }
}

// needle at a random perimeter point (breathe-jitter "reshuffle")
export function randEdgePos(seed: number) {
  const onEdge = rand(seed, 6.3)
  const edge = (['bottom', 'right', 'top', 'left'] as const)[Math.floor(rand(seed, 5.1) * 4) % 4]!
  if (edge === 'bottom') return { x: 0.04 + 0.92 * onEdge, y: 1, edge }
  if (edge === 'right') return { x: 1, y: 1 - onEdge, edge }
  if (edge === 'top') return { x: 0.96 - 0.92 * onEdge, y: 0, edge }
  return { x: 0, y: onEdge, edge }
}

export const rand = (index: number, salt = 1) => {
  const noise = Math.sin((index + 1) * 12.9898 * salt) * 43758.5453
  return noise - Math.floor(noise)
}

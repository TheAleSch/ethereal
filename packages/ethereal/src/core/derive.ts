// Derived states — the arithmetic behind "a named state is a VARIATION of the
// config you gave", not a replacement for it.
//
// The old built-in tables hard-set a whole look per state: `thinking` pinned
// `path: 'breathe'`, `audio` pinned `path: 'static'` plus ten other keys.
// Switching state therefore threw the caller's preset away and rendered a
// different effect that happened to share a component. These helpers exist so
// each effect can instead READ the incoming config and bend it: same colors,
// same path, same silhouette, different temperament.
//
// Nothing here knows about a specific effect — the per-effect rules live next
// to the config type they read, in ethereal.tsx / event-horizon.tsx /
// ethereal-dither.tsx. What generalises is the character (how much quicker is
// "quicker") and the numeric shaping, and that is what lives here.

/** Turns a merged config into the variation a named state asks for. Returns
 *  `{}` for a state it has no opinion about — including `'idle'`, which must
 *  render exactly like no state at all. */
export type StateDeriver<C> = (cfg: C, state: string) => Partial<C>

/** The two temperaments, as numbers. One place to retune every effect.
 *
 *  `thinking` is busy: it moves quicker and less predictably, and stops
 *  reacting to the pointer because the component is not asking to be clicked.
 *  `audio` is alert: it travels steadier, sits a touch brighter, and is
 *  shaped so an attached audio source has something to push around. */
export const THINKING = {
  /** duration multiplier — lower is quicker */
  durationScale: 0.7,
  /** added to wander/flicker/shimmer-style restlessness knobs (capped at 1) */
  restlessness: 0.3,
  /** fraction of the pulse range collapsed toward its midpoint */
  pulseTighten: 0.25,
} as const

export const AUDIO = {
  durationScale: 1.15,
  /** fraction of the restlessness knobs removed — higher is steadier */
  steadiness: 0.5,
  /** multiplier on the "how present is it" knob (strength, halo) */
  presence: 1.1,
  pulseTighten: 0.15,
} as const

// Rounding keeps derived values readable in devtools and keeps them stable to
// compare — 3.1 * 0.7 is 2.1699999999999995 in binary floating point, and a
// value that ugly ends up verbatim in a CSS custom property.
const round = (value: number) => Math.round(value * 1000) / 1000

/** A config key can arrive as NaN from a hand-edited URL or a bad input; the
 *  derivation must not be the thing that turns that into a poisoned clock. */
const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)

/** Scale one lap's duration. Speeding up is floored so an already-frantic
 *  preset does not strobe: the result never drops below `floor` seconds — and
 *  never comes back SLOWER than it went in, which a plain `Math.max(floor, …)`
 *  would do to a caller who deliberately asked for 0.4. */
export function scaleDuration(duration: number, factor: number, floor = 0.6): number {
  const current = finite(duration, 1)
  const scaled = current * factor
  return round(factor < 1 ? Math.max(Math.min(current, floor), scaled) : scaled)
}

/** Add restlessness to a 0..1 knob without exceeding `ceiling` — and without
 *  lowering a caller who is already past the ceiling on their own. */
export function lift(value: number, amount: number, ceiling = 1): number {
  const current = finite(value, 0)
  return round(Math.max(current, Math.min(ceiling, current + amount)))
}

/** Remove a fraction of a knob — `damp(0.8, 0.5)` is 0.4. Steadiness, applied
 *  to the same knobs `lift` raises. */
export function damp(value: number, fraction: number): number {
  return round(finite(value, 0) * (1 - fraction))
}

/** Multiply a knob (strength, halo, brightness) and round it. */
export function scale(value: number, factor: number, fallback = 1): number {
  return round(finite(value, fallback) * factor)
}

/** Collapse a min/max pulse range toward its own midpoint. Preserves where the
 *  caller centred the pulse — a range of 0.5..2 stays centred on 1.25 — and
 *  only narrows how far it swings. */
export function tightenPulse(
  pulse: { pulseMin: number; pulseMax: number },
  fraction: number
): { pulseMin: number; pulseMax: number } {
  const low = finite(pulse.pulseMin, 1)
  const high = finite(pulse.pulseMax, 1)
  const mid = (low + high) / 2
  return {
    pulseMin: round(mid + (low - mid) * (1 - fraction)),
    pulseMax: round(mid + (high - mid) * (1 - fraction)),
  }
}

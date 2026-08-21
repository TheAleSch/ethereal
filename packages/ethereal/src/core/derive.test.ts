/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { damp, lift, scale, scaleDuration, tightenPulse } from './derive'

// The numeric shaping behind every derived state. Each of these has a guard in
// it that exists because the naive version misbehaves on a real preset — the
// tests below pin the guards, not the arithmetic.
describe('scaleDuration', () => {
  it('scales a duration and rounds off binary-float noise', () => {
    // 3.1 * 0.7 is 2.1699999999999995 unrounded, and that string would land
    // verbatim in a CSS custom property
    expect(scaleDuration(3.1, 0.7)).toBe(2.17)
  })

  it('floors how fast it will drive an already-quick preset', () => {
    // 0.7 * 0.7 = 0.49, under the 0.6s floor — a strobe, not a thinking state
    expect(scaleDuration(0.7, 0.7)).toBe(0.6)
  })

  it('never returns something SLOWER than it was given', () => {
    // a caller who deliberately asked for 0.4 keeps 0.4; a plain
    // Math.max(floor, scaled) would have handed back 0.6 and slowed them down
    expect(scaleDuration(0.4, 0.7)).toBe(0.4)
  })

  it('applies no floor when slowing down', () => {
    expect(scaleDuration(6, 1.15)).toBe(6.9)
  })

  it('falls back to 1s for a non-finite duration rather than propagating NaN', () => {
    // configs arrive from URL-shared playground links; a NaN here poisons the
    // animation clock for the life of the page
    expect(scaleDuration(Number.NaN, 0.7)).toBe(0.7)
  })
})

describe('lift', () => {
  it('adds restlessness up to the ceiling', () => {
    expect(lift(0, 0.3)).toBe(0.3)
    expect(lift(0.5, 0.3)).toBe(0.8)
    expect(lift(0.9, 0.3)).toBe(1)
  })

  it('never lowers a caller who is already past the ceiling', () => {
    // clamping to the ceiling would make "more restless" less restless
    expect(lift(1.6, 0.3)).toBe(1.6)
  })
})

describe('damp', () => {
  it('removes a fraction of a knob', () => {
    expect(damp(0.8, 0.5)).toBe(0.4)
    expect(damp(0, 0.5)).toBe(0)
  })
})

describe('scale', () => {
  it('multiplies and rounds', () => {
    expect(scale(1, 1.1)).toBe(1.1)
    expect(scale(0.9, 1.1)).toBe(0.99)
  })
})

describe('tightenPulse', () => {
  it("narrows the swing while keeping the caller's midpoint", () => {
    // 0.8..1.4 is centred on 1.1 — tightening must not drag the pulse toward
    // 1.0, or a preset that deliberately pulses bright comes back dimmer
    const tight = tightenPulse({ pulseMin: 0.8, pulseMax: 1.4 }, 0.25)
    expect((tight.pulseMin + tight.pulseMax) / 2).toBeCloseTo(1.1, 10)
    expect(tight.pulseMax - tight.pulseMin).toBeCloseTo(0.6 * 0.75, 10)
  })

  it('leaves a range that does not swing alone', () => {
    expect(tightenPulse({ pulseMin: 1, pulseMax: 1 }, 0.25)).toEqual({ pulseMin: 1, pulseMax: 1 })
  })
})

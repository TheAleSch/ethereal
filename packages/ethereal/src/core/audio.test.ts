// The audio drive's contract is "modulate what the user tuned, never replace
// it". That reduces to a handful of properties the mapping must hold — these
// pin them, because every one of them was violated by the previous version
// and none of them is visible in a screenshot of a moving effect.
import { describe, expect, it } from 'vitest'

import { audioFrame, newAudioEnvelope } from './audio'

const BANDS = 8
const silent = new Float32Array(BANDS)
const FRAME = 1 / 60

/** run `seconds` worth of 60fps frames at a constant input */
const run = (
  env: ReturnType<typeof newAudioEnvelope>,
  seconds: number,
  rms: number,
  bands: ArrayLike<number>,
  sensitivity = 1,
  dip = 0
) => {
  const depths = { glow: 1, hotspot: 1, bands: 1 }
  let frame = audioFrame(env, rms, bands, sensitivity, FRAME, depths, dip)
  for (let step = 1; step < Math.round(seconds / FRAME); step++)
    frame = audioFrame(env, rms, bands, sensitivity, FRAME, depths, dip)
  return frame
}

describe('audioFrame', () => {
  it('rests at exactly 1 in silence — the effect renders as configured', () => {
    const frame = run(newAudioEnvelope(), 2, 0, silent)
    expect(frame.aud).toBe(1)
    expect(frame.ahot).toBe(1)
    for (const band of frame.bands) expect(band).toBe(1)
  })

  it('treats room tone below the noise floor as silence', () => {
    const roomTone = new Float32Array(BANDS).fill(0.008)
    const frame = run(newAudioEnvelope(), 2, 0.009, roomTone)
    expect(frame.aud).toBe(1)
    for (const band of frame.bands) expect(band).toBe(1)
  })

  it('sensitivity scales the deviation, not the output', () => {
    const loud = new Float32Array(BANDS).fill(0.5)
    const quietSens = run(newAudioEnvelope(), 1, 0.3, loud, 0.5)
    const loudSens = run(newAudioEnvelope(), 1, 0.3, loud, 2)
    // 4x the sensitivity => 4x the distance from the resting value of 1
    expect(loudSens.aud - 1).toBeCloseTo((quietSens.aud - 1) * 4, 5)
    // and sensitivity 0 must be a total no-op, not "quiet"
    expect(run(newAudioEnvelope(), 1, 0.3, loud, 0).aud).toBe(1)
  })

  it('auto-gains: a quiet mic and a loud mic reach the same full drive', () => {
    const quietBands = new Float32Array(BANDS).fill(0.04)
    const loudBands = new Float32Array(BANDS).fill(0.8)
    const quiet = run(newAudioEnvelope(), 3, 0.05, quietBands)
    const loud = run(newAudioEnvelope(), 3, 0.6, loudBands)
    expect(quiet.aud).toBeCloseTo(loud.aud, 2)
  })

  it('is frame-rate independent — 30fps and 120fps agree after a second', () => {
    const bands = new Float32Array(BANDS).fill(0.4)
    const slow = newAudioEnvelope()
    for (let step = 0; step < 30; step++) audioFrame(slow, 0.3, bands, 1, 1 / 30)
    const fast = newAudioEnvelope()
    for (let step = 0; step < 120; step++) audioFrame(fast, 0.3, bands, 1, 1 / 120)
    expect(slow.level).toBeCloseTo(fast.level, 3)
  })

  it('attacks faster than it releases', () => {
    const bands = new Float32Array(BANDS).fill(0.5)
    const env = newAudioEnvelope()
    run(env, 0.08, 0.4, bands)
    const afterAttack = env.level
    run(env, 0.08, 0, silent)
    const dropped = afterAttack - env.level
    expect(afterAttack).toBeGreaterThan(0.5) // fast attack: mostly there in 80ms
    expect(dropped).toBeLessThan(afterAttack * 0.5) // slow release: still lit
  })

  it('spreads the bands apart on a shaped spectrum — a waveform, not a level', () => {
    // energy only in the low bands, as in a vowel
    const shaped = Float32Array.from([0.9, 0.8, 0.6, 0.3, 0.1, 0.05, 0.02, 0.01])
    const frame = run(newAudioEnvelope(), 1.5, 0.4, shaped)
    // Every band self-normalizes against its own peak, so a steady tone
    // eventually flattens; what must hold is that they left 1 at all and the
    // row has spread rather than moving as one block.
    const spread = Math.max(...frame.bands) - Math.min(...frame.bands)
    expect(spread).toBeGreaterThan(0)
    for (const band of frame.bands) {
      expect(band).toBeGreaterThanOrEqual(0.25)
      expect(band).toBeLessThanOrEqual(2.6)
    }
  })

  it('clamps a saturating input instead of blowing past the ceiling', () => {
    const pinned = new Float32Array(BANDS).fill(1)
    const frame = run(newAudioEnvelope(), 3, 1, pinned, 8)
    for (const band of frame.bands) expect(band).toBeLessThanOrEqual(2.6)
  })
})

// The complaint these pin: on real music the effect "barely moved" and "some
// parts stayed pinned up all the time". Both are one defect — the drive had a
// reference for its maximum (a decaying peak) and none for its minimum, so a
// mastered track, which never returns to silence, lived in the top of the
// range and the busiest bands sat at the clamp.
describe('audioFrame against a moving reference', () => {
  /** a crude "track": a beat every ~0.4s over a bed that never goes silent,
   *  which is what mastered music actually looks like to an analyser */
  const music = (env: ReturnType<typeof newAudioEnvelope>, seconds: number, sensitivity = 1) => {
    const frames = Math.round(seconds / FRAME)
    const seen: { aud: number; band: number }[] = []
    for (let step = 0; step < frames; step++) {
      const beat = step % 24 < 5
      const rms = beat ? 0.34 : 0.2
      const bands = new Float32Array(BANDS).fill(beat ? 0.6 : 0.34)
      const frame = audioFrame(env, rms, bands, sensitivity, FRAME)
      if (step > frames / 2) seen.push({ aud: frame.aud, band: frame.bands[3]! })
    }
    return seen
  }

  it('keeps a busy band off its ceiling', () => {
    const seen = music(newAudioEnvelope(), 6)
    const bandMax = Math.max(...seen.map((s) => s.band))
    expect(bandMax).toBeLessThan(2.55) // the clamp is 2.6
  })

  it('uses the beats, not silence, as the bottom of the range', () => {
    const seen = music(newAudioEnvelope(), 6)
    const span = Math.max(...seen.map((s) => s.aud)) - Math.min(...seen.map((s) => s.aud))
    // the loud/quiet ratio here is under 2:1 — against a fixed floor that was
    // a few hundredths of travel, which is the "it barely moves" complaint
    expect(span).toBeGreaterThan(0.1)
  })

  it('still rests at 1 once the music stops', () => {
    const env = newAudioEnvelope()
    music(env, 6)
    const settled = run(env, 10, 0, silent)
    // to the 3 decimals the host is written with — the envelopes decay
    // asymptotically, so after real sound this is 1 ± float dust rather than
    // the exact 1 a never-driven host holds
    expect(settled.aud).toBeCloseTo(1, 6)
    for (const band of settled.bands) expect(band).toBeCloseTo(1, 5)
  })
})

// `dip` buys a downward half of the swing: the lulls INSIDE a sound fall below
// the tuned look instead of merely returning to it. The property that makes it
// safe to ship on by default-able terms is that it must cost nothing when
// there is no sound at all — the module's whole promise is that a silent host
// renders as configured.
describe('audioFrame dip', () => {
  const loudBands = new Float32Array(BANDS).fill(0.5)

  it('changes nothing in silence, however deep', () => {
    const frame = run(newAudioEnvelope(), 3, 0, silent, 1, 1)
    expect(frame.aud).toBe(1)
    expect(frame.ahot).toBe(1)
  })

  it('is a no-op at 0 — the default is the old behaviour to the bit', () => {
    const withDip = run(newAudioEnvelope(), 1, 0.3, loudBands, 1, 0)
    const withoutArg = run(newAudioEnvelope(), 1, 0.3, loudBands, 1)
    expect(withDip.aud).toBe(withoutArg.aud)
    expect(withDip.ahot).toBe(withoutArg.ahot)
  })

  it('drops BELOW rest in a lull, where an undipped drive can only return to it', () => {
    // a second of sound, then a pause short enough that `presence` is still up
    const dipped = newAudioEnvelope()
    run(dipped, 1, 0.3, loudBands, 1, 1)
    const dippedLull = run(dipped, 0.5, 0, silent, 1, 1)
    const plain = newAudioEnvelope()
    run(plain, 1, 0.3, loudBands, 1, 0)
    const plainLull = run(plain, 0.5, 0, silent, 1, 0)

    expect(dippedLull.aud).toBeLessThan(1)
    expect(dippedLull.ahot).toBeLessThan(1)
    expect(plainLull.aud).toBeGreaterThanOrEqual(1)
  })

  it('covers a wider range across the same loud/quiet cycle', () => {
    const span = (dip: number) => {
      const env = newAudioEnvelope()
      run(env, 1, 0.3, loudBands, 1, dip)
      const peak = run(env, 0.3, 0.5, loudBands, 1, dip).aud
      const trough = run(env, 0.5, 0, silent, 1, dip).aud
      return peak - trough
    }
    expect(span(1)).toBeGreaterThan(span(0))
  })

  it('lets the lull recover to rest once the sound really stops', () => {
    const env = newAudioEnvelope()
    run(env, 1, 0.3, loudBands, 1, 1)
    const lull = run(env, 0.5, 0, silent, 1, 1)
    // PRESENCE_RELEASE is 1.4s — several time constants later there is no
    // "quiet within sound" left to be quieter than
    const settled = run(env, 8, 0, silent, 1, 1)
    expect(lull.aud).toBeLessThan(1)
    expect(settled.aud).toBeCloseTo(1, 2)
  })

  it('never drives a variable to zero, whatever the sensitivity', () => {
    const env = newAudioEnvelope()
    run(env, 1, 0.4, loudBands, 8, 1)
    const lull = run(env, 0.5, 0, silent, 8, 1)
    // these are multipliers on radii and alphas: 0 is not "very quiet", it is
    // the effect gone
    expect(lull.aud).toBeGreaterThanOrEqual(0.2)
    expect(lull.ahot).toBeGreaterThanOrEqual(0.2)
  })

  it('leaves the needles alone — they already travel both ways', () => {
    const shaped = Float32Array.from([0.9, 0.8, 0.6, 0.3, 0.1, 0.05, 0.02, 0.01])
    const dipped = run(newAudioEnvelope(), 1.5, 0.4, shaped, 1, 1)
    const plain = run(newAudioEnvelope(), 1.5, 0.4, shaped, 1, 0)
    // gating them on a negative swing would invert the row rather than lower it
    expect(dipped.bands).toEqual(plain.bands)
  })
})

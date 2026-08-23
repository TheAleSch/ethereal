// The path helpers feed --bx/--by every frame. Their guards are the kind that
// look decorative and are not: without the corner clamp a shared playground
// link can poison the CACHED LUT with NaN for the life of the page, and
// without the negative wrap counter-spin (which subtracts a px offset from a
// fraction that is often ~0) walks off the front of the LUT.
import { describe, expect, it } from 'vitest'

import { PATH_CACHE_LIMIT, PATH_N, getLUT, pathFractionAt, pathPx, quantAspect, walkRect, walkSmooth } from './path'

const finite = (...values: number[]) => values.every((value) => Number.isFinite(value))

describe('getLUT', () => {
  it('builds a finite, monotonic arc-length table', () => {
    const lut = getLUT(0.3, 3)
    expect(lut.pts).toHaveLength(PATH_N + 1)
    expect(lut.total).toBeGreaterThan(0)
    for (let step = 1; step <= PATH_N; step++) expect(lut.cum[step]!).toBeGreaterThanOrEqual(lut.cum[step - 1]!)
    for (const [x, y] of lut.pts) expect(finite(x, y)).toBe(true)
  })

  it('clamps a corner of 0 or below — pow(0, negative) is Infinity', () => {
    for (const corner of [0, -1, -1e9]) {
      const lut = getLUT(corner, 3)
      expect(Number.isFinite(lut.total)).toBe(true)
      for (const [x, y] of lut.pts) expect(finite(x, y)).toBe(true)
    }
  })

  it('clamps a corner above the useful range instead of exploding', () => {
    const lut = getLUT(1000, 3)
    expect(Number.isFinite(lut.total)).toBe(true)
    // clamped to the same table as the top of the range
    expect(lut.total).toBe(getLUT(1.5, 3).total)
  })

  it('caches per (corner, aspect) pair', () => {
    expect(getLUT(0.3, 2)).toBe(getLUT(0.3, 2))
    expect(getLUT(0.3, 2)).not.toBe(getLUT(0.3, 2.5))
  })

  it('keeps a 65-key active working set hot across repeated passes', () => {
    const corners = Array.from({ length: 65 }, (_, index) => 0.05 + index / 400)
    const active = corners.map((corner) => getLUT(corner, 3))
    for (let pass = 0; pass < 3; pass++)
      corners.forEach((corner, index) => expect(getLUT(corner, 3)).toBe(active[index]))
  })

  it('quantizes keys and evicts old LUTs at the fixed cache bound', () => {
    expect(getLUT(0.3001, 2.01)).toBe(getLUT(0.3002, 2.02))
    const old = getLUT(0.0525, 7.75)
    for (let index = 0; index <= PATH_CACHE_LIMIT; index++) getLUT(0.2 + index * 0.01, 3)
    expect(getLUT(0.0525, 7.75)).not.toBe(old)
  })
})

describe('quantAspect', () => {
  it('quantizes to 0.25 steps and clamps, so the LUT cache stays small', () => {
    expect(quantAspect(203, 41)).toBe(quantAspect(200, 40))
    expect(quantAspect(1, 1000)).toBe(0.5)
    expect(quantAspect(1000, 1)).toBe(8)
  })

  it('survives a zero-height host', () => {
    expect(Number.isFinite(quantAspect(100, 0))).toBe(true)
  })
})

describe('walkSmooth', () => {
  it('wraps a negative fraction to the end of the path', () => {
    // counter-spin and px lags produce fractions just below 0 every frame
    const behind = walkSmooth(-0.001, 0.3, 3)
    const same = walkSmooth(0.999, 0.3, 3)
    expect(behind.x).toBeCloseTo(same.x, 10)
    expect(behind.y).toBeCloseTo(same.y, 10)
  })

  it('wraps fractions above 1', () => {
    const past = walkSmooth(1.25, 0.3, 3)
    const same = walkSmooth(0.25, 0.3, 3)
    expect(past.x).toBeCloseTo(same.x, 10)
    expect(past.y).toBeCloseTo(same.y, 10)
  })

  it('stays inside the unit box with a unit tangent, all the way round', () => {
    for (let step = 0; step <= 64; step++) {
      const point = walkSmooth(step / 64, 0.3, 3)
      expect(finite(point.x, point.y, point.dx, point.dy)).toBe(true)
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
      expect(Math.hypot(point.dx, point.dy)).toBeCloseTo(1, 6)
    }
  })

  it('emits no NaN for a hostile corner value', () => {
    const point = walkSmooth(0.5, -1, 3)
    expect(finite(point.x, point.y, point.dx, point.dy)).toBe(true)
  })
})

describe('walkRect', () => {
  it('walks bottom → right → top → left', () => {
    expect(walkRect(0).edge).toBe('bottom')
    expect(walkRect(0.4).edge).toBe('right')
    expect(walkRect(0.6).edge).toBe('top')
    expect(walkRect(0.9).edge).toBe('left')
  })

  it('hands each edge its own unit direction', () => {
    expect([walkRect(0.1).dx, walkRect(0.1).dy]).toEqual([1, 0])
    expect([walkRect(0.4).dx, walkRect(0.4).dy]).toEqual([0, -1])
    expect([walkRect(0.6).dx, walkRect(0.6).dy]).toEqual([-1, 0])
    expect([walkRect(0.9).dx, walkRect(0.9).dy]).toEqual([0, 1])
  })

  it('wraps like walkSmooth', () => {
    expect(walkRect(-0.25)).toEqual(walkRect(0.75))
    expect(walkRect(1.5)).toEqual(walkRect(0.5))
  })
})

describe('pathPx', () => {
  it('scales the perimeter with host height', () => {
    expect(pathPx(0.3, 3, 80)).toBeCloseTo(2 * pathPx(0.3, 3, 40), 10)
  })
})

describe('pathFractionAt', () => {
  it('round-trips points from the smooth perimeter path', () => {
    for (const fraction of [0, 0.07, 0.25, 0.49, 0.73, 0.97]) {
      const point = walkSmooth(fraction, 0.3, 3)
      expect(pathFractionAt(point.x, point.y, 0.3, 3)).toBeCloseTo(fraction, 2)
    }
  })

  it('keeps opposite edges half a perimeter apart', () => {
    const bottom = pathFractionAt(0.5, 1, 0.3, 3)
    const top = pathFractionAt(0.5, 0, 0.3, 3)
    expect(Math.abs(bottom - top)).toBeCloseTo(0.5, 2)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'normalizes a hostile aspect %s consistently',
    (aspect) => {
      const fraction = pathFractionAt(0.5, 1, 0.3, aspect)
      expect(Number.isFinite(fraction)).toBe(true)
      expect(fraction).toBeCloseTo(pathFractionAt(0.5, 1, 0.3, 3), 8)
    },
  )
})

import { describe, expect, it } from 'vitest'

import { MAX_COLOR_LENGTH, MAX_PALETTE_COLORS, boundedPalette, finiteNumber, runtimeConfigSignature } from './normalize'

describe('runtime normalization', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '4', {}, null])(
    'falls back for a non-finite/non-number value %s',
    (value) => expect(finiteNumber(value, 7, 0, 10)).toBe(7),
  )

  it('clamps finite values', () => {
    expect(finiteNumber(-2, 7, 0, 10)).toBe(0)
    expect(finiteNumber(20, 7, 0, 10)).toBe(10)
  })

  it('stops reading a palette as soon as the package bound is reached', () => {
    const colors = Array.from({ length: MAX_PALETTE_COLORS }, () => '#123456')
    Object.defineProperty(colors, MAX_PALETTE_COLORS, {
      get: () => {
        throw new Error('boundedPalette scanned beyond its bound')
      },
    })
    colors.length = 500_000
    expect(boundedPalette(colors, ['#fff'])).toHaveLength(MAX_PALETTE_COLORS)
  })

  it('drops non-string entries and falls back when none remain', () => {
    expect(boundedPalette([null, 3, {}], ['#fff'])).toEqual(['#fff'])
  })

  it('rejects individually oversized color strings', () => {
    expect(boundedPalette(['x'.repeat(MAX_COLOR_LENGTH + 1)], ['#fff'])).toEqual(['#fff'])
  })

  it('signs circular and bigint hostile values without throwing', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => runtimeConfigSignature({ duration: circular, repeatDelay: 1n }, ['#fff'])).not.toThrow()
  })
})

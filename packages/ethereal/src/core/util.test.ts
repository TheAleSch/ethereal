// @vitest-environment jsdom
//
// `trip` feeds every gradient and mask in the package. A single invalid
// channel invalidates the WHOLE background/mask longhand it sits in — a
// dropped mask floods the element with unmasked paint — so the contract is
// "never emit NaN, fall back to white, and say so once". These pin that,
// plus the border-radius resolution the dither silhouette rides on.
//
// jsdom has no canvas, so the canvas normalization branch is stubbed with a
// context that reproduces the one browser behaviour the bug hinged on:
// assigning an INVALID color to fillStyle is silently ignored, leaving the
// previous value in place.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { claimHost, p3t, radiusPx, trip } from './util'

const NAMED: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  rebeccapurple: '#663399',
}

const toHex = (value: string): string | null => {
  const color = value.trim().toLowerCase()
  if (NAMED[color]) return NAMED[color]!
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(color)
  if (hex) {
    const digits = hex[1]!
    const full =
      digits.length <= 4
        ? digits
            .slice(0, 3)
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : digits.slice(0, 6)
    return `#${full}`
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]\s*(\d+)[,\s]\s*(\d+)/.exec(color)
  if (rgb)
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((channel) => Number(channel).toString(16).padStart(2, '0'))
      .join('')}`
  const hsl = /^hsl\(\s*(\d+)/.exec(color)
  // enough to prove the branch is reached; exact hue conversion is the
  // browser's job, not this stub's
  if (hsl) return '#00ff00'
  return null
}

beforeEach(() => {
  const real = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = real(tag) as HTMLElement
    if (tag !== 'canvas') return element
    let current = '#000000'
    const context = {
      get fillStyle() {
        return current
      },
      set fillStyle(next: string) {
        const parsed = toHex(next)
        // the spec's silent no-op — the exact behaviour that used to turn
        // every unparseable color into the seeded black
        if (parsed) current = parsed
      },
    }
    ;(element as HTMLCanvasElement).getContext = (() =>
      context) as unknown as HTMLCanvasElement['getContext']
    return element
  }) as typeof document.createElement)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('trip', () => {
  it('reads hex, shorthand hex and hex with alpha', () => {
    expect(trip('#ffffff')).toBe('255,255,255')
    expect(trip('#f00')).toBe('255,0,0')
    expect(trip('#ff000088')).toBe('255,0,0')
  })

  it('reads integer rgb()/rgba() without touching the canvas', () => {
    expect(trip('rgb(255,50,100)')).toBe('255,50,100')
    expect(trip('rgba(10, 20, 30, 0.5)')).toBe('10,20,30')
    // browsers clamp out-of-range channels; the fast path must agree
    expect(trip('rgb(999,0,0)')).toBe('255,0,0')
    expect(trip('rgba(300, 256, 1000, 0.5)')).toBe('255,255,255')
  })

  it('normalizes named and functional colors through the canvas', () => {
    expect(trip('rebeccapurple')).toBe('102,51,153')
    expect(trip('hsl(120 50% 50%)')).toBe('0,255,0')
  })

  it('still reads a color that happens to equal the canvas seed', () => {
    // the invalid-input detection seeds fillStyle twice; black and white must
    // not be mistaken for "the assignment was ignored"
    expect(trip('black')).toBe('0,0,0')
    expect(trip('white')).toBe('255,255,255')
  })

  it('falls back to white and warns ONCE for an unparseable color', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // a plausible typo, and a truncated hex: both used to come back as black,
    // which renders as nothing under `add`/mask compositing — silently
    expect(trip('greeen')).toBe('255,255,255')
    expect(trip('#12')).toBe('255,255,255')
    expect(warn).toHaveBeenCalledTimes(2)
    // cached: a color parsed once never warns again, however many layers use it
    expect(trip('greeen')).toBe('255,255,255')
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('never emits NaN, whatever it is handed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const color of ['', 'not-a-color', '#', '#gg0000', 'rgb()', 'var(--nope)'])
      expect(trip(color)).not.toMatch(/NaN/)
  })

  it('feeds p3t a valid triple for an invalid input', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(p3t('nonsense')).toBe('1.000 1.000 1.000')
  })

  it('evicts old parsed colors instead of retaining streamed palettes forever', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = 'cache-lru-first'
    expect(trip(first)).toBe('255,255,255')
    for (let index = 0; index <= 256; index++) trip(`cache-lru-${index}`)
    const before = warn.mock.calls.length
    expect(trip(first)).toBe('255,255,255')
    expect(warn).toHaveBeenCalledTimes(before + 1)
  })
})

describe('claimHost', () => {
  it('warns when a second effect of the same type claims one host', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const target = document.createElement('div')
    const releaseFirst = claimHost(target, 'Ethereal')
    const releaseSecond = claimHost(target, 'Ethereal')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('will fight over CSS variables')
    releaseFirst()
    releaseSecond()
  })

  it('keeps remaining claims tracked after out-of-order cleanup', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const target = document.createElement('div')
    const releaseFirst = claimHost(target, 'Ethereal')
    const releaseSecond = claimHost(target, 'EventHorizon')
    releaseFirst()
    const releaseThird = claimHost(target, 'EtherealDither')
    expect(warn).toHaveBeenCalledTimes(2)
    releaseSecond()
    releaseThird()
  })
})

describe('radiusPx', () => {
  const host = (width: number, height: number) =>
    ({ offsetWidth: width, offsetHeight: height }) as HTMLElement

  it('reads a px radius as-is', () => {
    expect(radiusPx('12px', host(200, 40))).toBe(12)
  })

  it('resolves a percentage against the SHORT side of the box', () => {
    expect(radiusPx('50%', host(200, 40))).toBe(20)
  })

  it('takes the smaller axis of an elliptical radius', () => {
    // one scalar has to stand in for both axes; the larger one would bulge
    // the silhouette outside the host's actual corner
    expect(radiusPx('40px 10px', host(200, 80))).toBe(10)
    expect(radiusPx('50% 10%', host(200, 40))).toBe(4)
  })

  it('reads a missing or malformed radius as 0', () => {
    expect(radiusPx('', host(200, 40))).toBe(0)
    expect(radiusPx('none', host(200, 40))).toBe(0)
  })
})

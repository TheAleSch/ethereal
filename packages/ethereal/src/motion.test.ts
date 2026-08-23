// @vitest-environment jsdom
//
// The layer snapshots in ethereal.render.test.ts deliberately never let the
// ticker run — every custom property in them is a `var(--bx, 0.5)` FALLBACK.
// That leaves the animation itself, the actual product, unpinned: deleting the
// body of tickAll keeps those snapshots green. These tests fire real frames
// and assert the host's live properties move, hold when paused, and reverse
// with EventHorizon's `dir`.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Ethereal, bottomSweepEnvelope, type EtherealProps } from './ethereal'
import { EventHorizon, type EventHorizonProps } from './event-horizon'
import { setPaused } from './core/ticker'
import { ControlledIntersectionObserver, ControlledResizeObserver, installControlledObservers } from './test-observers'

const EtherealSubject: (props: EtherealProps) => ReturnType<typeof Ethereal> = Ethereal
const HorizonSubject: (props: EventHorizonProps) => ReturnType<typeof EventHorizon> = EventHorizon

let frame: (now: number) => void
let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement
let reduceMotion = false
let measuredW = 200
let measuredH = 60

beforeEach(() => {
  reduceMotion = false
  measuredW = 200
  measuredH = 60
  const globals = globalThis as Record<string, unknown>
  globals.IS_REACT_ACT_ENVIRONMENT = true
  let pending: ((now: number) => void) | null = null
  globals.requestAnimationFrame = (callback: (now: number) => void) => {
    pending = callback
    return 1
  }
  globals.cancelAnimationFrame = () => {
    pending = null
  }
  frame = (now: number) => {
    const callback = pending
    pending = null
    callback?.(now)
  }
  globals.matchMedia = (media: string) => ({
    media,
    matches: reduceMotion && media.includes('prefers-reduced-motion'),
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })
  installControlledObservers()
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => measuredW)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => measuredH)

  host = document.createElement('div')
  host.style.position = 'relative'
  document.body.appendChild(host)
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  setPaused(false)
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const render = (element: ReturnType<typeof createElement>) => {
  root = createRoot(host)
  act(() => root!.render(element))
}

const read = (name: string) => host.style.getPropertyValue(name)

/** run `count` frames of ~60fps starting at `start` ms */
function run(count: number, start = 100) {
  for (let index = 0; index < count; index++) frame(start + index * 16)
}

const dispatchMousePointer = (type: string) =>
  act(() => {
    host.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true }), { pointerType: 'mouse', pointerId: 1 }))
  })

describe('Ethereal drives its host every frame', () => {
  it('halves the hidden interval between every bottom sweep', () => {
    expect(bottomSweepEnvelope(0)).toBe(0)
    expect(bottomSweepEnvelope(0.0625)).toBe(0)
    expect(bottomSweepEnvelope(0.0626)).toBeGreaterThan(0)
    expect(bottomSweepEnvelope(0.9374)).toBeGreaterThan(0)
    expect(bottomSweepEnvelope(0.9375)).toBe(0)
    expect(bottomSweepEnvelope(1)).toBe(0)
  })

  it('writes and MOVES the head, blob and needle properties', () => {
    render(createElement(EtherealSubject, { path: 'around', duration: 2, needles: 6 }))
    run(2)
    const early = ['--bx', '--by', '--p1x1', '--p1y1'].map(read)
    for (const value of early) expect(value).not.toBe('')
    run(20, 1000)
    const later = ['--bx', '--by', '--p1x1', '--p1y1'].map(read)
    expect(later).not.toEqual(early)
  })

  it('points BOTH bottom heads’ spotlight normals outward, not just the forward one', () => {
    // head2 sweeps right-to-left, so its motion tangent is reversed — but the
    // bottom edge's outward side is straight down for both heads. Deriving
    // the normal from the reversed tangent put head2's spotlight INSIDE the
    // host (spotOffset 10 → 10px above the border instead of below it).
    render(createElement(EtherealSubject, { path: 'bottom', heads: 2, spotOffset: 10 }))
    run(4)
    expect(parseFloat(read('--ny'))).toBeGreaterThan(0)
    expect(parseFloat(read('--ny2'))).toBeGreaterThan(0)
  })

  it('keeps a counter-spinning second head’s normal outward all the way around', () => {
    render(
      createElement(EtherealSubject, {
        path: 'around',
        heads: 2,
        spin: 'counter',
        duration: 2,
        spotOffset: 10,
      })
    )
    run(2)
    // the path is convex around (0.5, 0.5): outward means the normal points
    // away from the centre at every sampled head position
    for (let sample = 0; sample < 24; sample++) {
      run(1, 400 + sample * 160)
      for (const suffix of ['', '2']) {
        const headX = parseFloat(read(`--bx${suffix}`))
        const headY = parseFloat(read(`--by${suffix}`))
        const normalX = parseFloat(read(`--nx${suffix}`))
        const normalY = parseFloat(read(`--ny${suffix}`))
        const outward = normalX * (headX - 0.5) + normalY * (headY - 0.5)
        expect(outward, `head${suffix || '1'} at sample ${sample}`).toBeGreaterThan(0)
      }
    }
  })

  it('holds every property still while the ticker is paused', () => {
    render(createElement(EtherealSubject, { path: 'around', duration: 2 }))
    run(4)
    const held = ['--bx', '--by', '--bw', '--bh'].map(read)
    setPaused(true)
    run(20, 5000)
    expect(['--bx', '--by', '--bw', '--bh'].map(read)).toEqual(held)
    setPaused(false)
  })

  it('performs no style writes while paused', () => {
    render(createElement(EtherealSubject, { path: 'around', heads: 2, hotspots: 8, spotSamples: 16 }))
    run(3)
    const writes = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')
    writes.mockClear()
    setPaused(true)
    run(10, 1000)
    expect(writes).not.toHaveBeenCalled()
  })

  it('keeps reveal interaction active across a whileHover rebuild', () => {
    render(createElement(EtherealSubject, { hover: 'reveal', whileHover: { colors: ['#ff0000'] } }))
    dispatchMousePointer('pointerenter')
    run(48)
    expect(Number(read('--hov'))).toBeGreaterThan(0.9)
  })

  it('recomputes size-derived internal masks after a responsive shrink', () => {
    measuredW = 200
    measuredH = 200
    render(createElement(EtherealSubject, { place: 'internal' }))
    const masks = () =>
      Array.from(host.querySelectorAll<HTMLElement>('span span'))
        .map((element) => element.style.mask)
        .join(' ')
    expect(masks()).toContain('28px')
    measuredH = 40
    for (const observer of ControlledResizeObserver.instances) observer.trigger()
    expect(masks()).toContain('16px')
    expect(masks()).not.toContain('transparent 28px')
  })

  it('stops CSS work offscreen and resumes after intersection', () => {
    render(createElement(EtherealSubject, { path: 'around' }))
    const observer = ControlledIntersectionObserver.instances[0]!
    observer.trigger(false)
    const before = read('--bx')
    run(6)
    expect(read('--bx')).toBe(before)
    observer.trigger(true)
    run(2, 500)
    expect(read('--bx')).not.toBe(before)
  })

  it('breathes the glow height between heightMin and heightMax on travel paths', () => {
    render(
      createElement(EtherealSubject, {
        path: 'around',
        duration: 1,
        heightMin: 1.5,
        heightMax: 3,
      })
    )
    const heights: number[] = []
    for (let index = 0; index < 90; index++) {
      frame(100 + index * 16)
      heights.push(Number(read('--bh')))
    }
    // the oscillator must live inside the configured window and actually swing
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(1.5)
    expect(Math.max(...heights)).toBeLessThanOrEqual(3)
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.8)
  })

  it('lets a breathe field contract without collapsing or blinking out', () => {
    render(
      createElement(EtherealSubject, {
        path: 'breathe',
        duration: 1,
        breatheAmp: 0.5,
        needleJitter: true,
      })
    )
    const widths: number[] = []
    const reshuffleOpacity: number[] = []
    for (let index = 0; index < 90; index++) {
      frame(100 + index * 16)
      widths.push(Number(read('--bw')))
      reshuffleOpacity.push(Number(read('--njFade')))
    }
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(0.8)
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(0.5)
    expect(Math.min(...reshuffleOpacity)).toBeGreaterThanOrEqual(0.55)
  })

  it('resumes from where it froze rather than the wall clock', () => {
    render(createElement(EtherealSubject, { path: 'around', duration: 8 }))
    run(4)
    const before = Number(read('--bx'))
    setPaused(true)
    run(20, 5000) // five seconds of paused frames
    setPaused(false)
    run(2, 9000)
    // one frame of travel on an 8s cycle, not five seconds' worth
    expect(Math.abs(Number(read('--bx')) - before)).toBeLessThan(0.05)
  })

  it('paints a static frame under prefers-reduced-motion and never ticks', () => {
    reduceMotion = true
    render(createElement(EtherealSubject, { path: 'around', duration: 2, hover: 'reveal' }))
    // hover: 'reveal' would leave a reduced-motion user with a permanently
    // invisible effect unless the static branch forces the reveal open
    expect(read('--hov')).toBe('1')
    expect(read('--bedge')).toBe('1')
    const still = ['--bx', '--by'].map(read)
    run(20)
    expect(['--bx', '--by'].map(read)).toEqual(still)
  })

  it('recomputes responsive masks under prefers-reduced-motion', () => {
    reduceMotion = true
    measuredW = 200
    measuredH = 200
    render(createElement(EtherealSubject, { place: 'internal' }))
    const masks = () =>
      Array.from(host.querySelectorAll<HTMLElement>('span span'))
        .map((element) => element.style.mask)
        .join(' ')
    expect(masks()).toContain('28px')
    measuredH = 40
    for (const observer of ControlledResizeObserver.instances) observer.trigger()
    expect(masks()).toContain('16px')
    expect(masks()).not.toContain('transparent 28px')
  })
})

describe('EventHorizon drives its host every frame', () => {
  const sample = (count: number, start: number) => {
    const seen: { bx: number; by: number; dx: number; dy: number }[] = []
    for (let index = 0; index < count; index++) {
      frame(start + index * 16)
      seen.push({
        bx: Number(read('--bx')),
        by: Number(read('--by')),
        dx: Number(read('--dx')),
        dy: Number(read('--dy')),
      })
    }
    return seen
  }

  it('writes head, tangent and tail-node properties that move', () => {
    render(createElement(HorizonSubject, { duration: 2, nodes: 5 }))
    run(2)
    for (const name of ['--bx', '--by', '--dx', '--dy', '--adx', '--ady', '--tx1', '--ty1'])
      expect(read(name)).not.toBe('')
    const early = ['--bx', '--by', '--tx1', '--ty1'].map(read)
    run(20, 1000)
    expect(['--bx', '--by', '--tx1', '--ty1'].map(read)).not.toEqual(early)
  })

  it('keeps the tangent pointing along the direction of travel — both ways round', () => {
    // this is what `dir: -1` (the Ember disk preset) is: the head walks the
    // path backwards AND its tangent is negated. Drop the negation and the
    // tail streams out in front of the head.
    for (const dir of [1, -1] as const) {
      if (root) act(() => root!.unmount())
      host.remove()
      host = document.createElement('div')
      host.style.position = 'relative'
      document.body.appendChild(host)
      render(createElement(HorizonSubject, { duration: 2, dir, corner: 0.3 }))
      const seen = sample(40, 100)
      let checked = 0
      for (let index = 1; index < seen.length; index++) {
        const previous = seen[index - 1]!
        const current = seen[index]!
        // only on the straights, where motion is unambiguously along one axis
        if (Math.abs(current.dx) < 0.95) continue
        const moved = current.bx - previous.bx
        if (Math.abs(moved) < 1e-4) continue
        expect(Math.sign(moved)).toBe(Math.sign(current.dx))
        checked++
      }
      expect(checked).toBeGreaterThan(0)
    }
  })

  it('runs the path in the opposite order for dir: -1', () => {
    render(createElement(HorizonSubject, { duration: 2, dir: 1 }))
    const forward = sample(30, 100).map((point) => point.bx)
    act(() => root!.unmount())
    root = null
    host.remove()
    host = document.createElement('div')
    host.style.position = 'relative'
    document.body.appendChild(host)
    render(createElement(HorizonSubject, { duration: 2, dir: -1 }))
    const backward = sample(30, 100).map((point) => point.bx)
    expect(backward).not.toEqual(forward)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', '-1', 0])(
    'keeps every animated coordinate finite for a hostile dir %s',
    (dir) => {
      render(
        createElement(HorizonSubject, {
          duration: 2,
          nodes: 5,
          dir: dir as EventHorizonProps['dir'],
        }),
      )
      run(3)
      for (const name of ['--bx', '--by', '--dx', '--dy', '--adx', '--ady', '--tx1', '--ty1'])
        expect(Number.isFinite(Number(read(name))), name).toBe(true)
    },
  )

  it('holds still while paused', () => {
    render(createElement(HorizonSubject, { duration: 2 }))
    run(4)
    const held = ['--bx', '--by', '--tx1', '--ty1'].map(read)
    setPaused(true)
    run(20, 5000)
    expect(['--bx', '--by', '--tx1', '--ty1'].map(read)).toEqual(held)
    setPaused(false)
  })

  it('keeps reveal interaction active across a whileHover rebuild', () => {
    render(createElement(HorizonSubject, { hover: 'reveal', whileHover: { colors: ['#ff0000'] } }))
    dispatchMousePointer('pointerenter')
    run(48)
    expect(Number(read('--hov'))).toBeGreaterThan(0.9)
  })

  it('honors intersection visibility transitions', () => {
    render(createElement(HorizonSubject, { duration: 2 }))
    const observer = ControlledIntersectionObserver.instances[0]!
    observer.trigger(false)
    const before = read('--bx')
    run(5)
    expect(read('--bx')).toBe(before)
    observer.trigger(true)
    run(2, 500)
    expect(read('--bx')).not.toBe(before)
  })
})

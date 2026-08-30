// @vitest-environment jsdom
//
// The dither renderer paints into an ImageData buffer rather than emitting
// CSS, so the layer snapshots that cover the other two effects say nothing
// about it: a flipped `place` polarity, a dead quantizer or a paused clock
// that keeps running are all invisible to the rest of the suite. This drives
// the real component through a fake 2D context and reads the pixels back.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EtherealDither,
  bottomSweepPosition,
  perimeterHotspotDistanceNormSq,
  type EtherealDitherProps,
} from './ethereal-dither'
import { pathFractionAt, pathPx } from './core/path'
import { setPaused } from './core/ticker'
import { ControlledIntersectionObserver, ControlledResizeObserver, installControlledObservers } from './test-observers'

const Subject: (props: EtherealDitherProps) => ReturnType<typeof EtherealDither> = EtherealDither

const HOST_W = 200
const HOST_H = 60

type Painted = { width: number; height: number; data: Uint8ClampedArray }

/** the most recent painted frame (Array.prototype.at is past this target) */
const last = (frames: Painted[]) => frames[frames.length - 1]!

let painted: Painted[]
let frame: (now: number) => void
let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement
let measuredW = HOST_W
let measuredH = HOST_H

beforeEach(() => {
  painted = []
  measuredW = HOST_W
  measuredH = HOST_H
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
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })
  installControlledObservers()

  // jsdom lays nothing out: the grid would be 1×1 without a host box
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => measuredW)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => measuredH)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return {
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (image: Painted) =>
        painted.push({
          width: image.width,
          height: image.height,
          data: image.data.slice(),
        }),
    } as unknown as CanvasRenderingContext2D
  } as unknown as HTMLCanvasElement['getContext'])

  container = document.createElement('div')
  container.style.position = 'relative'
  document.body.appendChild(container)
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  setPaused(false)
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function render(props: EtherealDitherProps) {
  root = createRoot(container)
  act(() => root!.render(createElement(Subject, props)))
}

/** last painted frame as a cell lookup in HOST coordinates */
function cells(block: number, bleed: number) {
  const image = last(painted)
  return {
    image,
    /** alpha of the cell whose centre is nearest (x, y) in host px */
    alphaAt(x: number, y: number) {
      const gx = Math.floor((x + bleed) / block)
      const gy = Math.floor((y + bleed) / block)
      if (gx < 0 || gy < 0 || gx >= image.width || gy >= image.height) return 0
      return image.data[(gy * image.width + gx) * 4 + 3]!
    },
    get litCells() {
      let count = 0
      for (let index = 3; index < image.data.length; index += 4) if (image.data[index]! > 0) count++
      return count
    },
  }
}

/** run enough frames for the comet to pass a given point of its cycle */
function run(frames: number, start = 100, step = 16) {
  for (let index = 0; index < frames; index++) frame(start + index * step)
}

/** Drop the mounted instance and hand the next render a fresh host — React
 *  refuses to open a second root on a container it has already owned. */
function remount() {
  if (root) act(() => root!.unmount())
  root = null
  container.remove()
  container = document.createElement('div')
  container.style.position = 'relative'
  document.body.appendChild(container)
  painted = []
}

/** How many painted cells lead with red versus with green.
 *
 *  The palette is what the config merge is being asked about, and the
 *  white-hot core only ever lifts the OTHER channels TOWARD the leading one
 *  (whiteness tops out at 0.85), so the leader survives the melt and a
 *  single-color palette gives an unambiguous readout. */
function channelLead() {
  const image = last(painted)
  let redLeads = 0
  let greenLeads = 0
  for (let index = 0; index < image.data.length; index += 4) {
    if (image.data[index + 3]! === 0) continue
    const red = image.data[index]!
    const green = image.data[index + 1]!
    if (red > green) redLeads++
    else if (green > red) greenLeads++
  }
  return { redLeads, greenLeads }
}

/** jsdom ships no PointerEvent constructor. The listeners under test read only
 *  `pointerType`, `pointerId` and `button`, so a MouseEvent carrying those
 *  fields is indistinguishable to them. */
type PointerFields = { button?: number } & Record<string, unknown>
function pointerEvent(type: string, { button = 0, ...fields }: PointerFields = {}) {
  // `button` is a read-only getter on MouseEvent, so it has to travel in the
  // constructor init rather than being assigned on afterwards
  return Object.assign(new MouseEvent(type, { bubbles: true, button }), {
    pointerType: 'mouse',
    pointerId: 1,
    ...fields,
  })
}

const dispatchOnHost = (type: string, fields?: PointerFields) =>
  act(() => {
    container.dispatchEvent(pointerEvent(type, fields))
  })

describe('EtherealDither canvas', () => {
  it('does not reflect an around-path hotspot onto the opposite edge of a pill', () => {
    const aspect = HOST_W / HOST_H
    const perimeter = pathPx(0.3, aspect, HOST_H)
    const bottom = pathFractionAt(0.5, 1, 0.3, aspect)
    const top = pathFractionAt(0.5, 0, 0.3, aspect)
    const reach = 75

    // Straight-line distance is only the host height, which is why the old
    // renderer painted a convincing reflected copy on the far edge.
    expect(HOST_H ** 2).toBeLessThan(reach ** 2)
    expect(perimeterHotspotDistanceNormSq(top, bottom, perimeter, 0, reach)).toBeGreaterThan(1)
    // Even an intentionally huge outward bloom must not wrap around and make
    // a second hotspot on the opposite edge.
    expect(perimeterHotspotDistanceNormSq(top, bottom, perimeter, 0, 400)).toBeGreaterThan(1)
  })

  it('paints something, on a grid sized from the host box plus bleed', () => {
    render({ block: 4, band: 8, bleed: 12, duration: 4 })
    run(4)
    const { image, litCells } = cells(4, 12)
    expect(image.width).toBe(Math.ceil((HOST_W + 24) / 4))
    expect(image.height).toBe(Math.ceil((HOST_H + 24) / 4))
    expect(litCells).toBeGreaterThan(0)
  })

  it('caps the grid under a cell budget for hostile band/block combinations', () => {
    // ?d={"band":1000,"block":2} once produced a ~9.4M-cell grid — three
    // Float32Arrays plus an ImageData, ~143 MiB, allocated before the first
    // paint. The renderer must coarsen the block instead.
    render({ band: 1000, block: 2, duration: 4 })
    run(2)
    const canvas = container.querySelector('canvas')!
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(100_000)
    // and the auto bleed derived from the band wears the same ceiling as an
    // explicit one, so the grid overhang cannot grow unbounded either
    expect(canvas.width).toBeLessThanOrEqual(Math.ceil((HOST_W + 2 * 400) / 2) + 1)
  })

  it('uses exported defaults for every invalid numeric fallback', () => {
    render({})
    const defaultCanvas = container.querySelector('canvas')!
    const expected = { width: defaultCanvas.width, height: defaultCanvas.height, inset: defaultCanvas.style.inset }
    remount()
    render({
      block: Number.NaN,
      reach: Number.NaN,
      band: Number.NaN,
      levels: Number.NaN,
      bleed: Number.NaN,
      corner: Number.NaN,
      duration: Number.NaN,
      repeatDelay: Number.NaN,
      strength: Number.NaN,
      saturation: Number.NaN,
      brightness: Number.NaN,
      hueRange: Number.NaN,
    })
    const invalidCanvas = container.querySelector('canvas')!
    expect({ width: invalidCanvas.width, height: invalidCanvas.height, inset: invalidCanvas.style.inset }).toEqual(expected)
  })

  it('gives bottom counter heads mirrored positions instead of collapsing them', () => {
    for (const travel of [0, 0.1, 0.4, 0.5, 0.6, 0.9])
      expect(bottomSweepPosition(travel, true)).not.toBeCloseTo(bottomSweepPosition(travel, false), 8)
  })

  it('place: external paints OUTSIDE the host silhouette only', () => {
    render({
      place: 'external',
      block: 4,
      band: 10,
      bleed: 16,
      reach: 400,
      strength: 4,
      duration: 4,
    })
    run(6)
    const grid = cells(4, 16)
    // the middle of the host is deep inside the silhouette
    expect(grid.alphaAt(HOST_W / 2, HOST_H / 2)).toBe(0)
    let outside = 0
    for (let x = -12; x < HOST_W + 12; x += 4) {
      outside += grid.alphaAt(x, -8)
      outside += grid.alphaAt(x, HOST_H + 8)
    }
    expect(outside).toBeGreaterThan(0)
  })

  it('place: internal is its exact inverse', () => {
    render({
      place: 'internal',
      block: 4,
      band: 10,
      bleed: 16,
      reach: 400,
      strength: 4,
      duration: 4,
    })
    run(6)
    const grid = cells(4, 16)
    let outside = 0
    for (let x = -12; x < HOST_W + 12; x += 4) {
      outside += grid.alphaAt(x, -8)
      outside += grid.alphaAt(x, HOST_H + 8)
    }
    expect(outside).toBe(0)
    let inside = 0
    for (let x = 4; x < HOST_W - 4; x += 4) inside += grid.alphaAt(x, HOST_H - 2)
    expect(inside).toBeGreaterThan(0)
  })

  it('quantizes alpha to `levels` steps', () => {
    render({
      levels: 2,
      block: 4,
      band: 10,
      bleed: 16,
      reach: 400,
      strength: 4,
      duration: 4,
    })
    run(6)
    const { image } = cells(4, 16)
    const alphas = new Set<number>()
    for (let index = 3; index < image.data.length; index += 4)
      if (image.data[index]! > 0) alphas.add(image.data[index]!)
    // 2 levels → 50% and 100%, nothing in between
    expect([...alphas].sort((a, b) => a - b)).toEqual([128, 255])
  })

  it('moves the comet between frames', () => {
    render({
      block: 4,
      band: 10,
      bleed: 16,
      duration: 2,
      hueRange: 0,
      flicker: 0,
    })
    run(2)
    const first = last(painted).data.slice()
    run(24, 2000)
    const later = last(painted).data
    expect(later.length).toBe(first.length)
    let identical = true
    for (let index = 0; index < later.length; index++)
      if (later[index] !== first[index]) {
        identical = false
        break
      }
    expect(identical).toBe(false)
  })

  it('rests the canvas clear through the repeatDelay gap instead of freezing at the endpoint', () => {
    // duration 1s + repeatDelay 10s: the gap spans cycleT ∈ (1, 11); the
    // stagger phase shifts time by at most one duration, so animation time
    // ≈ 5s lands deep in the gap for ANY phase — past both smoothstep
    // shoulders. wander is set to catch the sentinel-progress drift bug too.
    render({
      block: 4,
      band: 10,
      bleed: 16,
      duration: 1,
      repeatDelay: 10,
      wander: 0.4,
      flicker: 0,
    })
    run(320)
    expect(cells(4, 16).litCells).toBe(0)
  })

  it('HOLDS every clock while the ticker is paused', () => {
    render({ block: 4, band: 10, bleed: 16, duration: 2 })
    run(6)
    const before = painted.length
    const frozen = last(painted).data.slice()
    setPaused(true)
    run(10, 5000)
    // a paused frame must not repaint at all — the dither used to keep
    // orbiting and drifting its palette off the wall clock while every other
    // renderer held still
    expect(painted.length).toBe(before)
    setPaused(false)
    run(1, 9000)
    expect(painted.length).toBe(before + 1)
    // and it resumes from where it froze, not 5 seconds ahead
    const resumed = last(painted).data
    let moved = 0
    for (let index = 3; index < resumed.length; index += 4) if (resumed[index] !== frozen[index]) moved++
    expect(moved).toBeLessThan(resumed.length / 4 / 2)
  })

  it('repaints config rebuilds and resizes synchronously while paused', () => {
    render({ block: 4, band: 10, bleed: 16, duration: 2 })
    run(6)
    setPaused(true)
    const beforeConfig = painted.length
    act(() => root!.render(createElement(Subject, { block: 4, band: 10, bleed: 16, duration: 3 })))
    expect(painted.length).toBeGreaterThan(beforeConfig)
    expect(cells(4, 16).litCells).toBeGreaterThan(0)

    measuredW = 320
    measuredH = 80
    const beforeResize = painted.length
    for (const observer of ControlledResizeObserver.instances) observer.trigger()
    expect(painted.length).toBeGreaterThan(beforeResize)
    expect(last(painted).width).toBe(Math.ceil((320 + 32) / 4))
    expect(last(painted).height).toBe(Math.ceil((80 + 32) / 4))
    expect(cells(4, 16).litCells).toBeGreaterThan(0)
  })

  it('skips frames while offscreen and resumes when visible again', () => {
    render({ block: 4, band: 10, bleed: 16 })
    const observer = ControlledIntersectionObserver.instances[0]!
    observer.trigger(false)
    const before = painted.length
    run(4)
    expect(painted).toHaveLength(before)
    observer.trigger(true)
    run(1, 500)
    expect(painted).toHaveLength(before + 1)
  })

  it('paints a static frame under prefers-reduced-motion, without the ticker', () => {
    ;(globalThis as Record<string, unknown>).matchMedia = (media: string) => ({
      media,
      matches: media.includes('prefers-reduced-motion'),
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })
    render({ block: 4, band: 10, bleed: 16, duration: 4 })
    expect(painted).toHaveLength(1)
    run(10)
    expect(painted).toHaveLength(1)
  })
})

// The invariant at the bottom of core/state.test.ts can only prove that this
// component's SOURCE contains a `mergeConfig` call — a call whose result was
// dropped on the floor would satisfy it just as well. These tests mount the
// real renderer and read the merged config back out of the painted pixels.
//
// Every assertion here is deliberately CLOCK-FREE: each mounted instance takes
// the next stagger from the module-wide phase counter, so two instances never
// agree on where the head is. Comparing raw frames between two mounts would
// "pass" on the stagger alone and prove nothing about the merge, so the
// readouts used are palette identity (which cell colors do not depend on the
// clock) and glow extent (which is a tube around the whole perimeter).
describe('EtherealDither paints through the shared config pipeline', () => {
  // hueRange/saturation/brightness at their identity values keep the painted
  // palette byte-identical to `colors` — the renderer skips its HSL rebuild
  const PAINTED: EtherealDitherProps = {
    block: 4,
    band: 10,
    bleed: 16,
    duration: 4,
    reach: 60,
    strength: 3,
    hueRange: 0,
    saturation: 1,
    brightness: 1,
  }

  it('paints the `themes` branch the resolved theme selects, and only that one', () => {
    const themes = { dark: { colors: ['#ff0000'] }, light: { colors: ['#00ff00'] } }
    render({ ...PAINTED, theme: 'dark', themes })
    run(6)
    const dark = channelLead()
    expect(dark.redLeads).toBeGreaterThan(0)
    // the component's own default palette is a blue/violet/rose mix that
    // would put cells in BOTH buckets, so a zero here also rules out a merge
    // that never read `themes` at all
    expect(dark.greenLeads).toBe(0)

    remount()
    render({ ...PAINTED, theme: 'light', themes })
    run(6)
    const light = channelLead()
    expect(light.greenLeads).toBeGreaterThan(0)
    expect(light.redLeads).toBe(0)
  })

  it('applies the derived `thinking` variation instead of rendering the idle config', () => {
    // `hover: 'boost'` widens the glow the moment the pointer arrives, and
    // deriveEtherealDitherState turns hover OFF for `thinking` — so the lit
    // area under a hovered pointer is a decisive readout of whether the
    // derivation ran, and one that does not depend on where the head happens
    // to be: the glow is a tube around the WHOLE perimeter, so its area
    // tracks `reach`, not the clock.
    const configured: EtherealDitherProps = {
      ...PAINTED,
      reach: 20,
      duration: 6,
      hover: 'boost',
      hoverAmount: 10,
      colors: ['#ff0000'],
    }
    render(configured)
    dispatchOnHost('pointerenter')
    // the hover ramp is an exponential chase on dt — 48 frames settles it
    run(48)
    const idleLit = cells(4, 16).litCells

    remount()
    render({ ...configured, state: 'thinking' })
    dispatchOnHost('pointerenter')
    run(48)
    const thinkingLit = cells(4, 16).litCells

    // measured across a full cycle the gap never drops below ~6.5x; 4x leaves
    // room for the head crossing a corner without making the test vacuous
    expect(thinkingLit).toBeGreaterThan(0)
    expect(idleLit).toBeGreaterThan(thinkingLit * 4)
  })

  it('applies a custom `states` entry, from the branch matching the resolved theme', () => {
    const states = { loading: { light: { base: { colors: ['#00ff00'] } } } }
    render({ ...PAINTED, colors: ['#ff0000'], theme: 'light', state: 'loading', states })
    run(6)
    const applied = channelLead()
    expect(applied.greenLeads).toBeGreaterThan(0)
    expect(applied.redLeads).toBe(0)

    remount()
    // no `dark` branch on the state: the flat prop underneath stays in force
    render({ ...PAINTED, colors: ['#ff0000'], theme: 'dark', state: 'loading', states })
    run(6)
    const untouched = channelLead()
    expect(untouched.redLeads).toBeGreaterThan(0)
    expect(untouched.greenLeads).toBe(0)
  })

  it('lets whilePressed outrank whileHover on the mounted host', () => {
    // a pure-blue base leaves red and green exactly equal in every painted
    // cell — including after the white-hot melt, which lifts both by the same
    // amount — so "neither leads" is a readable third state
    const overlaid: EtherealDitherProps = {
      ...PAINTED,
      colors: ['#0000ff'],
      whileHover: { colors: ['#00ff00'] },
      whilePressed: { colors: ['#ff0000'] },
    }
    render(overlaid)
    run(6)
    const resting = channelLead()
    expect(cells(4, 16).litCells).toBeGreaterThan(0)
    expect(resting.redLeads).toBe(0)
    expect(resting.greenLeads).toBe(0)

    dispatchOnHost('pointerenter')
    run(6, 500)
    const hovered = channelLead()
    expect(hovered.greenLeads).toBeGreaterThan(0)
    expect(hovered.redLeads).toBe(0)

    // still hovered — the press overlay must land ON TOP of the hover one
    dispatchOnHost('pointerdown')
    run(6, 900)
    const pressed = channelLead()
    expect(pressed.redLeads).toBeGreaterThan(0)
    expect(pressed.greenLeads).toBe(0)
  })

  it('fades the rebuilt canvas over transitionMs whenever the merged config moves', () => {
    render({ ...PAINTED, transitionMs: 250 })
    const canvas = container.querySelector('canvas')!
    // clear what the MOUNT wrote, so only a rebuild can put it back
    canvas.style.transition = ''
    canvas.style.opacity = ''

    act(() => root!.render(createElement(Subject, { ...PAINTED, strength: 2, transitionMs: 250 })))
    expect(container.querySelector('canvas')!.style.transition).toBe('opacity 250ms ease')
    expect(container.querySelector('canvas')!.style.opacity).toBe('1')

    // and a state change is a config change like any other
    container.querySelector('canvas')!.style.transition = ''
    act(() =>
      root!.render(createElement(Subject, { ...PAINTED, strength: 2, transitionMs: 250, state: 'thinking' }))
    )
    expect(container.querySelector('canvas')!.style.transition).toBe('opacity 250ms ease')
  })

  it('leaves the rebuilt canvas un-faded for transitionMs: 0', () => {
    render({ ...PAINTED, transitionMs: 0 })
    act(() => root!.render(createElement(Subject, { ...PAINTED, strength: 2, transitionMs: 0 })))
    const canvas = container.querySelector('canvas')!
    expect(canvas.style.transition).toBe('')
    expect(canvas.style.opacity).toBe('1')
  })
})

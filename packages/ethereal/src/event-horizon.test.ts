// @vitest-environment jsdom
//
// The invariant at the bottom of core/state.test.ts can only prove that each
// component's SOURCE contains a `mergeConfig` call — a call whose result was
// dropped on the floor would satisfy it just as well. These tests mount the
// real EventHorizon and read the layers it actually builds, so every rung of
// the shared merge is pinned by what reaches the DOM: the `themes` branch,
// the derived named state, a caller's own `states` table, the hover/press
// precedence, and the fade that covers a rebuild.
//
// Every assertion here is deliberately CLOCK-FREE. Each mounted instance takes
// the next stagger from the module-wide phase counter, so two instances never
// agree on where the head is; anything that compared frame pixels between two
// mounts would "pass" on the stagger alone and prove nothing about the merge.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EventHorizon, type EventHorizonProps } from './event-horizon'
import { setPaused } from './core/ticker'

const Subject: (props: EventHorizonProps) => ReturnType<typeof EventHorizon> = EventHorizon

let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement

beforeEach(() => {
  const globals = globalThis as Record<string, unknown>
  globals.IS_REACT_ACT_ENVIRONMENT = true
  // the layers are built in the mount effect, before any frame — nothing here
  // ever needs to tick, so the rAF callback is simply parked
  globals.requestAnimationFrame = () => 1
  globals.cancelAnimationFrame = () => {}
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
  class Noop {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  globals.ResizeObserver = Noop
  globals.IntersectionObserver = Noop

  // jsdom lays nothing out; the halo/lens boxes are sized from the host box
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(60)

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

function render(props: EventHorizonProps) {
  root = createRoot(host)
  act(() => root!.render(createElement(Subject, props)))
}

/** Drop the mounted instance and hand the next render a fresh host — React
 *  refuses to open a second root on a container it has already owned. */
function remount() {
  if (root) act(() => root!.unmount())
  root = null
  host.remove()
  host = document.createElement('div')
  host.style.position = 'relative'
  document.body.appendChild(host)
}

/** The effect's own wrapper span, the element whose opacity transition covers
 *  a rebuild. */
const effectRoot = () => host.querySelector<HTMLSpanElement>(':scope > span')!

/** Every layer's `background`, whitespace-stripped and joined.
 *
 *  jsdom re-serialises the rgba() triples it can parse ("rgba(0, 0, 0, 0.9)")
 *  and leaves the ones nested inside a calc()/var() gradient exactly as the
 *  component wrote them, so only a space-free compare matches both forms. */
const paintedBackgrounds = () =>
  Array.from(host.querySelectorAll<HTMLElement>('span span'))
    .map((layer) => layer.style.background)
    .join(' ~ ')
    .replace(/\s+/g, '')

/** Every layer's `mask`, same normalisation. The reveal window around the head
 *  is sized from `tail` and `shimmer`, so it is where a derived state shows. */
const paintedMasks = () =>
  Array.from(host.querySelectorAll<HTMLElement>('span span'))
    .map((layer) => layer.style.mask)
    .join(' ~ ')
    .replace(/\s+/g, '')

/** jsdom ships no PointerEvent constructor. The listeners under test read only
 *  `pointerType`, `pointerId` and `button`, so a MouseEvent carrying those
 *  fields is indistinguishable to them. */
function pointerEvent(type: string, { button = 0, ...fields }: PointerFields = {}) {
  // `button` is a read-only getter on MouseEvent, so it has to travel in the
  // constructor init rather than being assigned on afterwards
  return Object.assign(new MouseEvent(type, { bubbles: true, button }), {
    pointerType: 'mouse',
    pointerId: 1,
    ...fields,
  })
}

type PointerFields = { button?: number } & Record<string, unknown>

const dispatchOnHost = (type: string, fields?: PointerFields) =>
  act(() => {
    host.dispatchEvent(pointerEvent(type, fields))
  })

// trip('#ff2000') / trip('#00ff20') / the untouched component default
const THEMED_DARK = 'rgba(255,32,0,'
const THEMED_LIGHT = 'rgba(0,255,32,'
const COMPONENT_DEFAULT = 'rgba(255,180,107,'

describe('EventHorizon renders through the shared config pipeline', () => {
  it('paints the `themes` branch the resolved theme selects, and only that one', () => {
    const themes = { dark: { colors: ['#ff2000'] }, light: { colors: ['#00ff20'] } }
    // lens: 0 keeps the backdrop annuli out of the way; they carry no color
    render({ theme: 'dark', themes, lens: 0 })
    const dark = paintedBackgrounds()
    expect(dark).toContain(THEMED_DARK)
    expect(dark).not.toContain(THEMED_LIGHT)
    // the palette must come from the theme branch rather than the defaults
    // leaking through a merge that never read `themes`
    expect(dark).not.toContain(COMPONENT_DEFAULT)

    remount()
    render({ theme: 'light', themes, lens: 0 })
    const light = paintedBackgrounds()
    expect(light).toContain(THEMED_LIGHT)
    expect(light).not.toContain(THEMED_DARK)
    expect(light).not.toContain(COMPONENT_DEFAULT)
  })

  it('applies the derived `thinking` variation instead of rendering the idle config', () => {
    // `hover: 'reveal'` starts every layer hidden until the pointer arrives,
    // and deriveEventHorizonState turns hover OFF for `thinking` — so the
    // reveal gate is a one-bit readout of whether derivation ran at all.
    const configured: EventHorizonProps = { hover: 'reveal', tail: 2, shimmer: 0.4, lens: 0 }
    render(configured)
    expect(host.style.getPropertyValue('--hov')).toBe('0')
    const idleWindow = paintedMasks()

    remount()
    render({ ...configured, state: 'thinking' })
    expect(host.style.getPropertyValue('--hov')).toBe('1')
    // thinking also shortens the stream (tail × 0.9) and lifts its shimmer,
    // both of which size the reveal window the tail is drawn through
    expect(paintedMasks()).not.toBe(idleWindow)
  })

  it("renders `state: 'idle'` exactly like no state at all", () => {
    // the deriver returns {} for idle, so the two must be indistinguishable
    render({ lens: 0, shadow: 0.42 })
    const stateless = paintedBackgrounds()
    remount()
    render({ lens: 0, shadow: 0.42, state: 'idle' })
    expect(paintedBackgrounds()).toBe(stateless)
  })

  it('applies a custom `states` entry, from the branch matching the resolved theme', () => {
    // shadow lands verbatim in the vignette gradient, so it reads straight
    // back out of the built layer
    const states = {
      loading: {
        light: { base: { shadow: 0.9 } },
        dark: { base: { shadow: 0.1 } },
      },
    }
    render({ theme: 'light', state: 'loading', states, lens: 0 })
    const painted = paintedBackgrounds()
    expect(painted).toContain('rgba(0,0,0,0.9)')
    expect(painted).not.toContain('rgba(0,0,0,0.1)')
    // the component default (0.35) must not survive underneath
    expect(painted).not.toContain('rgba(0,0,0,0.35)')
  })

  it('lets a custom state outrank the `themes` branch below it', () => {
    // merge order is themes → state, so the state wins; the inverse would let
    // a theme baseline silently pin a key across every state
    render({
      theme: 'dark',
      themes: { dark: { shadow: 0.2 } },
      state: 'loading',
      states: { loading: { dark: { base: { shadow: 0.8 } } } },
      lens: 0,
    })
    const painted = paintedBackgrounds()
    expect(painted).toContain('rgba(0,0,0,0.8)')
    expect(painted).not.toContain('rgba(0,0,0,0.2)')
  })

  it('lets whilePressed outrank whileHover on the mounted host', () => {
    render({ whileHover: { shadow: 0.2 }, whilePressed: { shadow: 0.8 }, lens: 0 })
    // resting: neither overlay, the component default
    expect(paintedBackgrounds()).toContain('rgba(0,0,0,0.35)')

    dispatchOnHost('pointerenter')
    expect(paintedBackgrounds()).toContain('rgba(0,0,0,0.2)')

    // still hovered — the press overlay must land ON TOP of the hover one
    dispatchOnHost('pointerdown', { button: 0 })
    const pressed = paintedBackgrounds()
    expect(pressed).toContain('rgba(0,0,0,0.8)')
    expect(pressed).not.toContain('rgba(0,0,0,0.2)')
  })

  it('fades the rebuilt layers over transitionMs whenever the merged config moves', () => {
    render({ shadow: 0.3, transitionMs: 250, lens: 0 })
    const effect = effectRoot()
    // clear what the MOUNT wrote, so only a rebuild can put it back
    effect.style.transition = ''
    effect.style.opacity = ''

    act(() => root!.render(createElement(Subject, { shadow: 0.6, transitionMs: 250, lens: 0 })))
    expect(effectRoot().style.transition).toBe('opacity 250ms ease')
    expect(effectRoot().style.opacity).toBe('1')

    // and a state change is a config change like any other
    effectRoot().style.transition = ''
    act(() =>
      root!.render(createElement(Subject, { shadow: 0.6, transitionMs: 250, lens: 0, state: 'thinking' }))
    )
    expect(effectRoot().style.transition).toBe('opacity 250ms ease')
  })

  it('leaves the rebuilt layers un-faded for transitionMs: 0', () => {
    render({ shadow: 0.3, transitionMs: 0, lens: 0 })
    act(() => root!.render(createElement(Subject, { shadow: 0.6, transitionMs: 0, lens: 0 })))
    expect(effectRoot().style.transition).toBe('')
    expect(effectRoot().style.opacity).toBe('1')
  })
})

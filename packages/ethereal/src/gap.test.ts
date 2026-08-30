// @vitest-environment jsdom
//
// `repeatDelay` is documented as a DEAD interval: the effect rests dark
// between travel cycles. These tests drive the shared ticker deep into the
// gap and read the visibility envelope each renderer actually writes —
// Ethereal's `--bedge` and Event Horizon's `--hov`. Before the gap envelope
// existed, both stayed fully painted (and kept moving under `wander`) for the
// whole delay, which is exactly the regression pinned here.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Ethereal, type EtherealProps } from './ethereal'
import { EventHorizon, type EventHorizonProps } from './event-horizon'

// createElement's overloads fight the components' own prop generics — pin the
// callable shape once, the way the other renderer suites do
const ESubject: (props: EtherealProps) => ReturnType<typeof Ethereal> = Ethereal
const HSubject: (props: EventHorizonProps) => ReturnType<typeof EventHorizon> = EventHorizon

let frame: (now: number) => void
let container: HTMLDivElement
let root: ReturnType<typeof createRoot> | null = null

beforeEach(() => {
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  container = document.createElement('div')
  container.style.position = 'relative'
  document.body.appendChild(container)
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function mount(element: ReturnType<typeof createElement>) {
  root = createRoot(container)
  act(() => root!.render(element))
}

/** Advance the shared ticker to roughly `seconds` of animation time. */
function runTo(seconds: number, step = 16) {
  const frames = Math.ceil((seconds * 1000) / step)
  for (let index = 0; index <= frames; index++) frame(100 + index * step)
}

/** The renderers write their per-frame vars onto an internal layer element —
 *  find whichever element carries `name` and read it. */
function readVar(name: string): string {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
    const value = el.style.getPropertyValue(name)
    if (value !== '') return value
  }
  return ''
}

// With duration 1s + repeatDelay 10s the cycle is 11s and the gap spans
// cycleT ∈ (1, 11). The per-instance stagger phase shifts time by at most
// one duration (1s), so animation time ≈ 5s lands at cycleT ∈ [5, 6] —
// deep inside the gap for ANY phase, past both smoothstep shoulders.
describe('repeatDelay is a dead interval', () => {
  it('Ethereal drives its visibility envelope to zero through the gap', () => {
    mount(
      createElement(ESubject, {
        path: 'around',
        duration: 1,
        repeatDelay: 10,
        wander: 0.4,
      }),
    )
    runTo(5)
    expect(parseFloat(readVar('--bedge'))).toBe(0)
  })

  it('Event Horizon drives its glow envelope to zero through the gap', () => {
    mount(createElement(HSubject, { duration: 1, repeatDelay: 10 }))
    runTo(5)
    expect(parseFloat(readVar('--hov'))).toBe(0)
  })

  it('Ethereal stays fully visible with the default repeatDelay of 0', () => {
    mount(createElement(ESubject, { path: 'around', duration: 1 }))
    runTo(5)
    expect(parseFloat(readVar('--bedge'))).toBe(1)
  })
})

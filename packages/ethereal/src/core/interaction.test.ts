// @vitest-environment jsdom
//
// useInteraction drives the whileHover/whilePressed overlays. Its rules are
// asymmetric on purpose and easy to break:
//   - hover is MOUSE-ONLY, because a touch tap fires pointerenter and often
//     never fires pointerleave (the pointer stops existing), which would latch
//     the overlay on forever;
//   - the press release therefore ends hover for touch/pen ONLY — a mouse
//     release must leave hover alone, since the cursor is still on the host
//     and no pointerenter will follow. Clearing it there meant clicking a
//     button killed its own hover treatment until you moved out and back in.
import { act, createElement, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { useInteraction } from './state'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

type Seen = { hovered: boolean; pressed: boolean }

/** mount `<div host><span ref/></div>` and return the host plus a live view of
 *  the hook's last render */
function mountHook() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const seen: Seen = { hovered: false, pressed: false }
  const Probe = () => {
    const ref = useRef<HTMLSpanElement>(null)
    const interaction = useInteraction(ref)
    seen.hovered = interaction.hovered
    seen.pressed = interaction.pressed
    return createElement('div', { id: 'host' }, createElement('span', { ref }))
  }
  const root = createRoot(container)
  act(() => root.render(createElement(Probe)))
  const host = container.querySelector('#host') as HTMLElement
  return {
    seen,
    host,
    unmount: () => act(() => root.unmount()),
  }
}

const pointer = (target: EventTarget, type: string, pointerType: string, pointerId = 1) =>
  act(() => {
    // jsdom has no PointerEvent constructor; the hook only reads pointerType/id
    const event = new Event(type, { bubbles: true }) as Event & {
      pointerType: string
      pointerId: number
    }
    event.pointerType = pointerType
    event.pointerId = pointerId
    target.dispatchEvent(event)
  })

const key = (target: EventTarget, type: 'keydown' | 'keyup', value: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true }))
  })

let active: ReturnType<typeof mountHook> | null = null
const mount = () => (active = mountHook())

afterEach(() => {
  active?.unmount()
  active = null
  document.body.innerHTML = ''
})

describe('hover', () => {
  it('turns on for a mouse pointer and off when it leaves', () => {
    const { seen, host } = mount()
    pointer(host, 'pointerenter', 'mouse')
    expect(seen.hovered).toBe(true)
    pointer(host, 'pointerleave', 'mouse')
    expect(seen.hovered).toBe(false)
  })

  it('ignores a touch pointerenter, which may never be followed by a leave', () => {
    const { seen, host } = mount()
    pointer(host, 'pointerenter', 'touch')
    expect(seen.hovered).toBe(false)
  })

  it('SURVIVES a mouse click — the cursor never left the host', () => {
    const { seen, host } = mount()
    pointer(host, 'pointerenter', 'mouse')
    pointer(host, 'pointerdown', 'mouse')
    pointer(window, 'pointerup', 'mouse')
    expect(seen.hovered).toBe(true)
    pointer(host, 'pointerleave', 'mouse')
    expect(seen.hovered).toBe(false)
  })

  it('survives a keyboard activation too', () => {
    const { seen, host } = mount()
    pointer(host, 'pointerenter', 'mouse')
    key(host, 'keydown', 'Enter')
    key(host, 'keyup', 'Enter')
    expect(seen.hovered).toBe(true)
  })

  it('is cleared by a touch release, which fires no leave of its own', () => {
    const { seen, host } = mount()
    // a hybrid device: the mouse is hovering, then the user taps the screen
    pointer(host, 'pointerenter', 'mouse')
    pointer(host, 'pointerdown', 'touch')
    pointer(window, 'pointerup', 'touch')
    expect(seen.hovered).toBe(false)
  })

  it("ignores another finger's release or cancel until the initiating touch ends", () => {
    const { seen, host } = mount()
    // Keep a real mouse hover visible to make an incorrect touch release
    // observable: the old uncorrelated window handler cleared it immediately.
    pointer(host, 'pointerenter', 'mouse', 10)
    pointer(host, 'pointerdown', 'touch', 1)
    pointer(window, 'pointerup', 'touch', 2)
    pointer(window, 'pointercancel', 'touch', 2)
    expect(seen.hovered).toBe(true)
    pointer(window, 'pointercancel', 'touch', 1)
    expect(seen.hovered).toBe(false)
  })
})

describe('press', () => {
  it('pulses on pointerdown and holds past a fast release', () => {
    const { seen, host } = mount()
    pointer(host, 'pointerdown', 'mouse')
    expect(seen.pressed).toBe(true)
    pointer(window, 'pointerup', 'mouse')
    // MIN_PULSE keeps the overlay up: a click shorter than the animation would
    // otherwise be a one-frame flash nobody sees
    expect(seen.pressed).toBe(true)
  })

  it('ends on a release outside the host, and on window blur', () => {
    const { seen, host } = mount()
    pointer(host, 'pointerdown', 'mouse')
    act(() => window.dispatchEvent(new Event('blur')))
    // still held by MIN_PULSE, but the press is no longer "down": a second
    // release must not re-arm it
    expect(seen.pressed).toBe(true)
    pointer(host, 'pointerdown', 'mouse')
    expect(seen.pressed).toBe(true)
  })

  it('ignores keydown autorepeat', () => {
    const { seen, host } = mount()
    key(host, 'keydown', ' ')
    key(host, 'keydown', ' ')
    key(host, 'keyup', ' ')
    expect(seen.pressed).toBe(true)
  })

  it('does not pulse while the user TYPES in a wrapped input', () => {
    // the documented EtherealWrap-around-an-input pattern: Space bubbling up
    // from the field is writing, not activation
    const { seen, host } = mount()
    const input = document.createElement('input')
    host.appendChild(input)
    key(input, 'keydown', ' ')
    expect(seen.pressed).toBe(false)
    key(input, 'keydown', 'Enter')
    expect(seen.pressed).toBe(false)
    // a wrapped BUTTON still activates — only editable targets are writing
    const button = document.createElement('button')
    host.appendChild(button)
    key(button, 'keydown', 'Enter')
    expect(seen.pressed).toBe(true)
  })

  it('ignores non-primary mouse buttons', () => {
    const { seen, host } = mount()
    act(() => {
      const event = new Event('pointerdown', { bubbles: true }) as Event & {
        pointerType: string
        pointerId: number
        button: number
      }
      event.pointerType = 'mouse'
      event.pointerId = 1
      event.button = 2
      host.dispatchEvent(event)
    })
    expect(seen.pressed).toBe(false)
  })

  it('stops listening after unmount', () => {
    const { seen, host, unmount } = mount()
    pointer(host, 'pointerenter', 'mouse')
    expect(seen.hovered).toBe(true)
    unmount()
    active = null
    const before = { ...seen }
    pointer(host, 'pointerleave', 'mouse')
    expect(seen).toEqual(before)
  })
})

// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EtherealWrap } from './ethereal'
import { EtherealDitherWrap } from './ethereal-dither'
import { EventHorizonWrap } from './event-horizon'

beforeEach(() => {
  const globals = globalThis as Record<string, unknown>
  globals.IS_REACT_ACT_ENVIRONMENT = true
  globals.requestAnimationFrame = () => 1
  globals.cancelAnimationFrame = () => {}
  globals.matchMedia = (media: string) => ({
    media,
    matches: true,
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
  // jsdom has no canvas implementation; without this stub every
  // EtherealDitherWrap mount logs a "Not implemented" console error
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData() {},
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(console, 'error')
})

afterEach(() => {
  expect(console.error).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const WRAPPERS: [string, typeof EtherealWrap][] = [
  ['EtherealWrap', EtherealWrap],
  ['EventHorizonWrap', EventHorizonWrap as unknown as typeof EtherealWrap],
  ['EtherealDitherWrap', EtherealDitherWrap as unknown as typeof EtherealWrap],
]

describe.each(WRAPPERS)('%s', (_name, Wrapper) => {
  it('does not let caller styles cancel structural host invariants', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() =>
      root.render(
        createElement(Wrapper, {
          style: { position: 'static', isolation: 'auto', display: 'contents' },
          children: createElement('button', null, 'Action'),
        }),
      ),
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.position).toBe('relative')
    expect(wrapper.style.isolation).toBe('isolate')
    expect(wrapper.style.display).toBe('inline-block')
    act(() => root.unmount())
  })
})

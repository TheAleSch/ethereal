// @vitest-environment jsdom
//
// How many times the layer tree is BUILT for one mount. useTheme starts at
// 'light' and corrects itself after the first commit, so a naive build effect
// ran once with the stale theme and again with the real one: on every dark
// page each effect built its whole layer tree twice and crossfaded out of a
// first build nobody asked for.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Ethereal, type EtherealProps } from './ethereal'

const Subject: (props: EtherealProps) => ReturnType<typeof Ethereal> = Ethereal

let root: Root | null = null

beforeEach(() => {
  const globals = globalThis as Record<string, unknown>
  globals.IS_REACT_ACT_ENVIRONMENT = true
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** Mount on a host carrying `data-theme` and count the generations built.
 *  Counted from the mutation records' targets: a superseded generation has
 *  already been removed again by the time the records are read. */
function buildsOnMount(dataTheme: 'light' | 'dark', props: EtherealProps = {}) {
  const host = document.createElement('div')
  host.style.position = 'relative'
  host.setAttribute('data-theme', dataTheme)
  document.body.appendChild(host)
  const observer = new MutationObserver(() => {})
  observer.observe(host, { childList: true, subtree: true })
  root = createRoot(host)
  act(() => root!.render(createElement(Subject, props)))
  const fx = host.firstElementChild
  let builds = 0
  for (const record of observer.takeRecords()) if (record.target === fx) builds += record.addedNodes.length
  observer.disconnect()
  return builds
}

describe('Ethereal builds its layer tree once per mount', () => {
  it('on a light page', () => {
    expect(buildsOnMount('light')).toBe(1)
  })

  it('on a dark page, where the theme hook starts out stale', () => {
    expect(buildsOnMount('dark')).toBe(1)
  })

  it('with a theme-branched config on a dark page', () => {
    expect(buildsOnMount('dark', { themes: { dark: { glowBlur: 20 } } })).toBe(1)
  })
})

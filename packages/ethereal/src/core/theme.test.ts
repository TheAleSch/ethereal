// @vitest-environment jsdom
//
// detectTheme's ORDER is the contract: an explicit prop beats the host, the
// host beats its ancestors, and the OS scheme is the last resort. The ancestor
// walk in the middle is the one nobody notices missing — it is what makes the
// shadcn/Tailwind "theme lives on a wrapper" pattern work at all.
import { createElement, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { detectTheme, subscribeTheme, useReducedMotion, useTheme } from './theme'

let prefersDark = false
let prefersReduced = false
let motionListeners = new Set<() => void>()

beforeEach(() => {
  document.body.innerHTML = ''
  prefersDark = false
  prefersReduced = false
  motionListeners = new Set()
  ;(globalThis as Record<string, unknown>).matchMedia = (media: string) => ({
    media,
    get matches() {
      if (media.includes('prefers-color-scheme: dark')) return prefersDark
      if (media.includes('prefers-reduced-motion')) return prefersReduced
      return false
    },
    onchange: null,
    addListener(listener: () => void) {
      if (media.includes('prefers-reduced-motion')) motionListeners.add(listener)
    },
    removeListener(listener: () => void) {
      motionListeners.delete(listener)
    },
    addEventListener(_type: string, listener: () => void) {
      if (media.includes('prefers-reduced-motion')) motionListeners.add(listener)
    },
    removeEventListener(_type: string, listener: () => void) {
      motionListeners.delete(listener)
    },
    dispatchEvent: () => false,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

/** build `<div …outer><div …inner><host/></div></div>` and return the host */
function mount(host: Partial<Record<'attr' | 'className', string>>, ancestors: string[] = []) {
  let parent: HTMLElement = document.body
  for (const spec of ancestors) {
    const wrapper = document.createElement('div')
    if (spec.startsWith('.')) wrapper.className = spec.slice(1)
    else wrapper.setAttribute('data-theme', spec)
    parent.appendChild(wrapper)
    parent = wrapper
  }
  const element = document.createElement('button')
  if (host.attr) element.setAttribute('data-theme', host.attr)
  if (host.className) element.className = host.className
  parent.appendChild(element)
  return element
}

describe('detectTheme', () => {
  it('takes an explicit theme over everything else', () => {
    const host = mount({ attr: 'light' }, ['dark'])
    expect(detectTheme(host, 'dark')).toBe('dark')
  })

  it('defaults to light with no host', () => {
    expect(detectTheme(null)).toBe('light')
  })

  it('reads the host data-theme first', () => {
    expect(detectTheme(mount({ attr: 'dark' }))).toBe('dark')
    expect(detectTheme(mount({ attr: 'light' }, ['dark']))).toBe('light')
  })

  it('ignores a meaningless data-theme value', () => {
    expect(detectTheme(mount({ attr: 'midnight' }, ['dark']))).toBe('dark')
  })

  it('reads host .dark/.light classes after the attribute', () => {
    expect(detectTheme(mount({ className: 'dark' }))).toBe('dark')
    expect(detectTheme(mount({ className: 'light' }, ['dark']))).toBe('light')
    expect(detectTheme(mount({ attr: 'light', className: 'dark' }))).toBe('light')
  })

  it('walks ancestors — the "theme on a wrapper" pattern', () => {
    expect(detectTheme(mount({}, ['dark']))).toBe('dark')
    expect(detectTheme(mount({}, ['.dark']))).toBe('dark')
    // several levels up, and the NEAREST one wins
    expect(detectTheme(mount({}, ['dark', 'plain', 'plain']))).toBe('dark')
    expect(detectTheme(mount({}, ['dark', '.light']))).toBe('light')
  })

  it('falls back to the OS scheme only when nothing in the tree says anything', () => {
    prefersDark = true
    expect(detectTheme(mount({}))).toBe('dark')
    expect(detectTheme(mount({}, ['light']))).toBe('light')
    prefersDark = false
    expect(detectTheme(mount({}))).toBe('light')
  })
})

describe('subscribeTheme', () => {
  it('fires once for a burst of theme mutations, and stops after unsubscribe', async () => {
    let calls = 0
    const stop = subscribeTheme(() => calls++)
    document.documentElement.setAttribute('data-theme', 'dark')
    document.documentElement.className = 'dark'
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(1)
    stop()
    document.documentElement.setAttribute('data-theme', 'light')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(1)
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.className = ''
  })

  it('ignores class changes that do not move dark/light membership', async () => {
    let calls = 0
    const stop = subscribeTheme(() => calls++)
    document.body.className = 'container flex'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(0)
    stop()
    document.body.className = ''
  })
})

describe('useReducedMotion', () => {
  it('updates a mounted consumer when the OS preference changes', () => {
    const seen: boolean[] = []
    const Subject = () => {
      seen.push(useReducedMotion())
      return null
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(createElement(Subject)))
    expect(seen[seen.length - 1]).toBe(false)

    act(() => {
      prefersReduced = true
      motionListeners.forEach((listener) => listener())
    })
    expect(seen[seen.length - 1]).toBe(true)

    act(() => root.unmount())
    expect(motionListeners.size).toBe(0)
  })
})

describe('useTheme', () => {
  it('re-reads a stable detector when the owner re-renders', () => {
    let backing: 'light' | 'dark' = 'light'
    const detector = () => backing
    const seen: string[] = []
    const Subject = () => {
      const ref = useRef<HTMLDivElement>(null)
      seen.push(useTheme(ref, undefined, detector))
      return createElement('div', { ref })
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(createElement(Subject)))
    expect(seen[seen.length - 1]).toBe('light')

    // the detector's backing store changes, then the OWNER re-renders with
    // the same callback identity — the docs make the caller own re-render
    // timing, so this render must observe the new value
    backing = 'dark'
    act(() => root.render(createElement(Subject)))
    expect(seen[seen.length - 1]).toBe('dark')

    act(() => root.unmount())
  })
})

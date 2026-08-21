// @vitest-environment jsdom
//
// CHARACTERIZATION test for the layer builder. It asserts nothing about what
// the gradients *should* be — it pins what they currently ARE, so any refactor
// of the layer/gradient construction that changes a single stop, offset or
// filter term shows up as a snapshot diff instead of a silent visual
// regression. The browser e2e drives the playground UI and never reads the CSS
// these layers produce, so this file is the only thing standing between a
// "pure refactor" and a changed render.
//
// The snapshot is a dump of every declared inline property on the effect span
// and its layer tree, plus the host's custom properties — i.e. everything the
// builder actually emits, in emission order.
/// <reference types="vite/client" />
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { Ethereal, type EtherealProps } from './ethereal'

// Ethereal's props parameter is optional, which types it as taking no props at
// all through createElement — this alias restores the real prop type
const Subject: (props: EtherealProps) => ReturnType<typeof Ethereal> = Ethereal

beforeAll(() => {
  const g = globalThis as Record<string, unknown>
  g.IS_REACT_ACT_ENVIRONMENT = true
  // The shared ticker must never advance: one frame would overwrite the host's
  // custom properties with wall-clock-derived values and every snapshot would
  // flap. Stubbing rAF (rather than faking reduced-motion) keeps the component
  // on its normal code path, including the `hover: 'reveal'` --hov init that
  // the reduced-motion branch overrides.
  g.requestAnimationFrame = () => 0
  g.cancelAnimationFrame = () => {}
  g.matchMedia = (media: string) => ({
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
  g.ResizeObserver = Noop
  g.IntersectionObserver = Noop
})

// split on TOP-LEVEL commas only, so each radial-gradient in a stack lands on
// its own snapshot line and a reviewer sees which one changed
function splitLayers(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(value.slice(start).trim())
  return out
}

function styleLines(el: HTMLElement, indent: string, only?: (prop: string) => boolean): string[] {
  const lines: string[] = []
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style.item(i)
    if (only && !only(prop)) continue
    const parts = splitLayers(el.style.getPropertyValue(prop))
    if (parts.length > 1) {
      lines.push(`${indent}${prop}:`)
      for (const p of parts) lines.push(`${indent}  ${p},`)
    } else {
      lines.push(`${indent}${prop}: ${parts[0]}`)
    }
  }
  return lines
}

function describeTree(el: HTMLElement, indent: string, label: string): string[] {
  const lines = [`${indent}${label}`, ...styleLines(el, indent + '  ')]
  Array.from(el.children).forEach((child, i) => {
    lines.push(...describeTree(child as HTMLElement, indent + '  ', `child[${i}]`))
  })
  return lines
}

function renderStyles(props: EtherealProps): string {
  const host = document.createElement('div')
  // asymmetric borders on purpose: the effect span anchors to the border box
  // per side, and a uniform border would hide a regression there
  host.style.cssText =
    'position:relative;isolation:isolate;border-style:solid;border-top-width:1px;border-right-width:2px;border-bottom-width:3px;border-left-width:4px;border-top-left-radius:12px'
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(createElement(Subject, props))
  })
  const fx = host.firstElementChild as HTMLElement
  const lines = [
    'host custom properties',
    ...styleLines(host, '  ', (p) => p.startsWith('--')),
    ...describeTree(fx, '', 'effect span'),
  ]
  act(() => {
    root.unmount()
  })
  host.remove()
  return lines.join('\n')
}

const CASES: [name: string, props: EtherealProps][] = [
  ['defaults', {}],
  ['path around, two heads, counter spin', { path: 'around', heads: 2, spin: 'counter' }],
  ['path bottom', { path: 'bottom' }],
  ['path breathe', { path: 'breathe' }],
  ['path static', { path: 'static' }],
  ['place internal', { place: 'internal' }],
  ['place external', { place: 'external' }],
  ['place ext-border', { place: 'ext-border' }],
  ['place both', { place: 'both' }],
  ['round spot with explicit samples', { spotShape: 'round', spotSamples: 5 }],
  ['adaptive spot on around', { spotShape: 'adaptive', path: 'around' }],
  ['hotspot cluster', { hotspots: 4, hotSpread: 40 }],
  ['comet trail with lead', { trail: 2.5, lead: 1, trailFade: 0.9 }],
  ['needles', { needles: 14, needleHeight: 1.8 }],
  ['hover reveal', { hover: 'reveal' }],
  ['spot offset and blur', { spotOffset: 6, spotBlur: 3, blendSoftness: 0.9 }],
  // spotH scales the paint itself (blobs, needles, relight bands), not just
  // the reveal window — a card can carry a beam instead of a border strip
  ['tall beam', { spotH: 180, heightMin: 1, heightMax: 2, path: 'around' }],
  ['p3 gamut', { gamut: 'p3' }],
  ['light theme', { theme: 'light', themes: { light: { glowBlur: 4, hueRange: 5 }, dark: { glowBlur: 20, hueRange: 40 } } }],
  ['dark theme', { theme: 'dark', themes: { light: { glowBlur: 4, hueRange: 5 }, dark: { glowBlur: 20, hueRange: 40 } } }],
  ['state thinking', { state: 'thinking' }],
]

describe('Ethereal rendered layers', () => {
  for (const [name, props] of CASES) {
    it(name, () => {
      expect(renderStyles(props)).toMatchSnapshot()
    })
  }
})

/** same dump, but with the host measuring a real size — the zero-size jsdom
 *  host above exercises the fallback bounds and misses every size-dependent
 *  clamp (that gap hid the tall-beam composer spill) */
function renderStylesSized(props: EtherealProps, width: number, height: number): string {
  const widthSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width)
  const heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
  try {
    return renderStyles(props)
  } finally {
    widthSpy.mockRestore()
    heightSpy.mockRestore()
  }
}

// the Assistant-prompt shape that produced the spill: tall beam, both sides,
// on a short-but-wide chat composer
const TALL_BEAM: EtherealProps = { spotH: 120, place: 'both', glowBlur: 18, needles: 16, spotW: 220 }

describe('Ethereal internal bands on a measured host', () => {
  it('keeps every internal edge band strictly below half the composer height', () => {
    const dump = renderStylesSized(TALL_BEAM, 480, 120)
    // internal edge bands read `transparent Npx, transparent calc(100% - Npx)`
    // — opposing bands meet in the middle at half the short dimension, so any
    // inset at or past 60px on a 120px host is interior spill, not edge light
    const insets = [...dump.matchAll(/transparent (\d+)px, transparent calc\(100% - \1px\)/g)].map((match) =>
      Number(match[1])
    )
    expect(insets.length).toBeGreaterThan(0)
    for (const inset of insets) expect(inset).toBeLessThan(60)
  })

  it('keeps the compact-pill guard at least as tight as before the tall-beam work', () => {
    const dump = renderStylesSized({}, 96, 40)
    const insets = [...dump.matchAll(/transparent (\d+)px, transparent calc\(100% - \1px\)/g)].map((match) =>
      Number(match[1])
    )
    expect(insets.length).toBeGreaterThan(0)
    for (const inset of insets) expect(inset).toBeLessThanOrEqual(18)
  })

  const SIZED_CASES: [name: string, props: EtherealProps, width: number, height: number][] = [
    ['compact pill', {}, 96, 40],
    ['chat composer with tall beam', TALL_BEAM, 480, 120],
    ['320×180 card, tall beam around', { spotH: 180, heightMin: 1, heightMax: 2, path: 'around' }, 320, 180],
  ]
  for (const [name, props, width, height] of SIZED_CASES) {
    it(name, () => {
      expect(renderStylesSized(props, width, height)).toMatchSnapshot()
    })
  }
})

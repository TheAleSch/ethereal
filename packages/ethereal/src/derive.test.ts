/// <reference types="vite/client" />
//
// The per-effect derivation rules, and the precedence they sit in.
//
// The bug these exist to prevent: a named state used to be a hard-coded look.
// `ETHEREAL_STATES.thinking` pinned `path: 'breathe'` plus ten more keys, so
// `state="thinking"` did not vary the preset you configured — it replaced it
// with a different effect that happened to share a component. Every "identity
// survives" assertion below is that bug.
import { describe, expect, it } from 'vitest'

import { mergeConfig, type StateConfig } from './core/state'
import { ETHEREAL, ETHEREAL_STATES, deriveEtherealState, type EtherealCfg } from './ethereal'
import {
  ETHEREAL_DITHER,
  ETHEREAL_DITHER_STATES,
  deriveEtherealDitherState,
  type EtherealDitherCfg,
} from './ethereal-dither'
import { EVENT_HORIZON, EVENT_HORIZON_STATES, deriveEventHorizonState, type EventHorizonCfg } from './event-horizon'

const NONE = { hovered: false, pressed: false }

// a config that looks nothing like the defaults, so "the result is recognisably
// this config" is a claim with teeth
const CUSTOM_ETHEREAL: EtherealCfg = {
  ...ETHEREAL,
  colors: ['rgb(255,0,0)', 'rgb(200,0,60)'],
  path: 'around',
  heads: 2,
  spin: 'counter',
  place: 'external',
  duration: 8,
  wander: 0.1,
  flicker: 0.2,
  needles: 3,
  spotW: 120,
  spotH: 40,
  strength: 0.5,
}

describe('deriveEtherealState', () => {
  it('leaves the identity of the config alone in every state', () => {
    const varied = { ...CUSTOM_ETHEREAL, ...deriveEtherealState(CUSTOM_ETHEREAL, 'thinking') }
    expect(varied.colors).toEqual(CUSTOM_ETHEREAL.colors)
    // the regression in one line: `around` must not come back as `breathe`
    expect(varied.path).toBe('around')
    expect(varied.heads).toBe(2)
    expect(varied.spin).toBe('counter')
    expect(varied.place).toBe('external')
    expect(varied.spotW).toBe(120)
    expect(varied.spotH).toBe(40)
  })

  it('derives thinking from the caller’s own numbers, not from constants', () => {
    const thinking = deriveEtherealState(CUSTOM_ETHEREAL, 'thinking')
    // quicker than the config it came from, and derived FROM it — a config at
    // 8s and one at 3.1s must not land on the same duration
    expect(thinking.duration).toBe(5.6)
    expect(deriveEtherealState(ETHEREAL, 'thinking').duration).toBe(2.17)
    // more restless than the caller was, from where the caller was
    expect(thinking.wander).toBeGreaterThan(CUSTOM_ETHEREAL.wander)
    expect(thinking.flicker).toBeGreaterThan(CUSTOM_ETHEREAL.flicker)
    // busy, not interactive
    expect(thinking.hover).toBe('none')
  })

  it('turns reveal off while thinking, because a hidden indicator is not one', () => {
    const reveal = { ...CUSTOM_ETHEREAL, hover: 'reveal' as const }
    expect(deriveEtherealState(reveal, 'thinking').hover).toBe('none')
  })

  it('has no opinion about idle or an unknown state', () => {
    expect(deriveEtherealState(CUSTOM_ETHEREAL, 'idle')).toEqual({})
    expect(deriveEtherealState(CUSTOM_ETHEREAL, 'speaking')).toEqual({})
  })
})

describe('deriveEventHorizonState', () => {
  const custom: EventHorizonCfg = {
    ...EVENT_HORIZON,
    colors: ['#00ff88', '#0088ff'],
    duration: 10,
    ring: 4,
    nodes: 15,
    shape: 'round',
    dir: -1,
    halo: 0.5,
    shimmer: 0.2,
  }

  it('leaves the identity of the disk alone in every state', () => {
    const varied = { ...custom, ...deriveEventHorizonState(custom, 'thinking') }
    expect(varied.colors).toEqual(custom.colors)
    expect(varied.ring).toBe(4)
    expect(varied.nodes).toBe(15)
    expect(varied.shape).toBe('round')
    expect(varied.dir).toBe(-1)
  })

  it('agitates the stream for thinking', () => {
    const thinking = deriveEventHorizonState(custom, 'thinking')
    expect(thinking.duration).toBe(7)
    expect(thinking.shimmer).toBeGreaterThan(custom.shimmer)
    expect(thinking.tail).toBeLessThan(custom.tail)
    expect(thinking.hover).toBe('none')
  })

  it('has no opinion about idle or an unknown state', () => {
    expect(deriveEventHorizonState(custom, 'idle')).toEqual({})
    expect(deriveEventHorizonState(custom, 'nothing-like-it')).toEqual({})
  })
})

describe('deriveEtherealDitherState', () => {
  const custom: EtherealDitherCfg = {
    ...ETHEREAL_DITHER,
    colors: ['#fff', '#000'],
    path: 'bottom',
    place: 'internal',
    block: 6,
    levels: 2,
    band: 12,
    duration: 10,
    wander: 0.4,
    flicker: 0.4,
  }

  it('leaves the blocks themselves alone in every state', () => {
    const varied = { ...custom, ...deriveEtherealDitherState(custom, 'thinking') }
    expect(varied.colors).toEqual(custom.colors)
    expect(varied.path).toBe('bottom')
    expect(varied.place).toBe('internal')
    expect(varied.block).toBe(6)
    expect(varied.levels).toBe(2)
    expect(varied.band).toBe(12)
  })

  it('derives the temperament from the caller’s numbers', () => {
    const thinking = deriveEtherealDitherState(custom, 'thinking')
    expect(thinking.duration).toBe(7)
    expect(thinking.wander).toBeGreaterThan(custom.wander)
    expect(thinking.hover).toBe('none')
  })

  it('has no opinion about idle or an unknown state', () => {
    expect(deriveEtherealDitherState(custom, 'idle')).toEqual({})
  })
})

// A deriver runs inside a React render, on a config object the caller owns and
// may hold across renders. Mutating it, or returning a different answer for the
// same input, would show up as a flicker nobody can reproduce.
describe('the derivers are pure', () => {
  const cases = [
    ['ethereal', deriveEtherealState, CUSTOM_ETHEREAL],
    ['event-horizon', deriveEventHorizonState, EVENT_HORIZON],
    ['ethereal-dither', deriveEtherealDitherState, ETHEREAL_DITHER],
  ] as const

  for (const [name, derive, cfg] of cases)
    it(`${name}/thinking is stable and mutates nothing`, () => {
      const before = structuredClone(cfg)
      const first = derive(cfg as never, 'thinking')
      const second = derive(cfg as never, 'thinking')
      expect(first).toEqual(second)
      expect(first).not.toBe(second) // a fresh object, never a shared one
      expect(cfg).toEqual(before)
    })
})

// Precedence is expressed once, in mergeConfig. These assert the whole chain
// through the real built-in tables rather than through a fixture, because the
// point of the change is what the SHIPPED states now do.
describe('derived states inside mergeConfig', () => {
  const merge = (
    props: Partial<EtherealCfg>,
    state: string | null | undefined,
    states?: Record<string, StateConfig<EtherealCfg>>
  ): EtherealCfg =>
    mergeConfig<EtherealCfg>({
      defaults: ETHEREAL,
      props,
      state,
      builtIns: ETHEREAL_STATES,
      states,
      derive: deriveEtherealState,
      theme: 'dark',
      interaction: NONE,
    })

  it('renders idle and no-state byte-identically to the un-stated config', () => {
    // the package is unpublished, so the LOOK of thinking was fair game to
    // change — idle was not
    const unstated = merge({ path: 'around', duration: 8 }, undefined)
    expect(merge({ path: 'around', duration: 8 }, 'idle')).toEqual(unstated)
    expect(merge({ path: 'around', duration: 8 }, null)).toEqual(unstated)
    expect(unstated).toEqual({ ...ETHEREAL, path: 'around', duration: 8 })
  })

  it('applies the derived variation for a built-in state whose table entry is empty', () => {
    const thinking = merge({ path: 'around', duration: 8 }, 'thinking')
    expect(thinking.path).toBe('around')
    expect(thinking.duration).toBe(5.6)
  })

  it('lets an explicit state config beat the derived one, key by key', () => {
    const states: Record<string, StateConfig<EtherealCfg>> = {
      thinking: { dark: { base: { duration: 0.9 } } },
    }
    const thinking = merge({ path: 'around', duration: 8 }, 'thinking', states)
    // the escape hatch wins on the key it names...
    expect(thinking.duration).toBe(0.9)
    // ...and the derivation still supplies the keys it does not
    expect(thinking.hover).toBe('none')
  })

  it('derives from the caller’s config, never from the state above it', () => {
    // if derivation read the post-state config it would compound: the explicit
    // 0.9 above would be scaled again, and the escape hatch would not hold
    const states: Record<string, StateConfig<EtherealCfg>> = {
      thinking: { dark: { base: { wander: 0 } } },
    }
    expect(merge({ duration: 8, wander: 0.1 }, 'thinking', states).wander).toBe(0)
  })

  it('derives above a theme branch, so a per-theme duration still varies', () => {
    const out = mergeConfig<EtherealCfg>({
      defaults: ETHEREAL,
      props: {},
      themes: { dark: { duration: 8 } },
      state: 'thinking',
      builtIns: ETHEREAL_STATES,
      derive: deriveEtherealState,
      theme: 'dark',
      interaction: NONE,
    })
    expect(out.duration).toBe(5.6)
  })

  it('does not derive anything for an unknown state', () => {
    const warn = console.warn
    console.warn = () => {}
    try {
      expect(merge({ duration: 8 }, 'sleeping-xyz').duration).toBe(8)
    } finally {
      console.warn = warn
    }
  })

  it('ships built-in tables that carry no look of their own', () => {
    // the whole point: what a state DOES is derived, so the tables hold only
    // the names. Anything reappearing here is a rule that could not be
    // written — and should arrive with a comment saying why.
    for (const table of [ETHEREAL_STATES, EVENT_HORIZON_STATES, ETHEREAL_DITHER_STATES])
      for (const [name, config] of Object.entries(table)) expect(config, name).toEqual({})
  })
})

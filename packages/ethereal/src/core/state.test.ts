/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest'

import {
  INTERACTION_VARIANTS,
  THEME_VARIANTS,
  mergeConfig,
  resolveState,
  resolveTheme,
  type StateConfig,
  type ThemeConfig,
} from './state'

type Cfg = { duration: number; strength: number; path: string }

const NONE = { hovered: false, pressed: false }
const HOVER = { hovered: true, pressed: false }
const PRESS = { hovered: true, pressed: true }

const builtIns: Record<string, StateConfig<Cfg>> = {
  idle: {},
  thinking: {
    light: {
      base: { duration: 3, strength: 1 },
      whileHover: { strength: 1.4 },
      whilePressed: { strength: 2, path: 'breathe' },
    },
    dark: {
      base: { duration: 4, strength: 2 },
      whileHover: { strength: 1.8 },
      whilePressed: { strength: 2.4 },
    },
  },
}

describe('resolveState', () => {
  it('returns nothing when no state is named', () => {
    expect(resolveState(undefined, builtIns, undefined, 'dark', NONE)).toEqual({})
  })

  it('picks the branch matching the resolved theme', () => {
    expect(resolveState('thinking', builtIns, undefined, 'light', NONE)).toEqual({ duration: 3, strength: 1 })
    expect(resolveState('thinking', builtIns, undefined, 'dark', NONE)).toEqual({ duration: 4, strength: 2 })
  })

  it('never leaks the other theme branch', () => {
    const out = resolveState('thinking', builtIns, undefined, 'light', PRESS)
    expect(out.strength).not.toBe(2.4)
  })

  it('merges whileHover over base within a theme', () => {
    expect(resolveState('thinking', builtIns, undefined, 'light', HOVER)).toEqual({ duration: 3, strength: 1.4 })
  })

  it('lets whilePressed beat whileHover when both are active', () => {
    expect(resolveState('thinking', builtIns, undefined, 'light', PRESS)).toEqual({
      duration: 3,
      strength: 2,
      path: 'breathe',
    })
  })

  it('layers whilePressed on top of whileHover, not directly on base — a real press is {hovered:true,pressed:true}', () => {
    // custom-only state (no built-in counterpart), matching the reachable
    // playground failure: dark.whileHover sets strength, dark.whilePressed
    // sets a different key. Since a real press is {hovered:true,pressed:true},
    // whilePressed must sit on top of whileHover, not skip straight to base.
    const custom: Record<string, StateConfig<Cfg>> = {
      custom: {
        dark: {
          base: { duration: 1, strength: 1, path: 'bottom' },
          whileHover: { strength: 1.8 },
          whilePressed: { duration: 5 },
        },
      },
    }
    const out = resolveState('custom', builtIns, custom, 'dark', PRESS)
    expect(out).toEqual({ duration: 5, strength: 1.8, path: 'bottom' })
  })

  it('lets light hover differ from dark hover', () => {
    const light = resolveState('thinking', builtIns, undefined, 'light', HOVER)
    const dark = resolveState('thinking', builtIns, undefined, 'dark', HOVER)
    expect(light.strength).toBe(1.4)
    expect(dark.strength).toBe(1.8)
  })

  it('overrides built-ins at each leaf independently', () => {
    const custom: Record<string, StateConfig<Cfg>> = {
      thinking: { dark: { base: { duration: 99 }, whileHover: { strength: 42 } } },
    }
    // base duration overridden, base strength still inherited
    expect(resolveState('thinking', builtIns, custom, 'dark', NONE)).toEqual({ duration: 99, strength: 2 })
    // custom hover wins over built-in hover
    expect(resolveState('thinking', builtIns, custom, 'dark', HOVER).strength).toBe(42)
  })

  it('resolves a custom-only state with no built-in counterpart', () => {
    const custom: Record<string, StateConfig<Cfg>> = { custom: { dark: { base: { duration: 7 } } } }
    expect(resolveState('custom', builtIns, custom, 'dark', NONE)).toEqual({ duration: 7 })
  })

  it('warns once for an unknown state and returns no overrides', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveState('nope-xyz', builtIns, undefined, 'dark', NONE)).toEqual({})
    expect(resolveState('nope-xyz', builtIns, undefined, 'dark', NONE)).toEqual({})
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('ignores overlays for an unknown state rather than half-applying them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveState('nope-abc', builtIns, undefined, 'dark', PRESS)).toEqual({})
    warn.mockRestore()
  })
})

describe('resolveTheme', () => {
  const themes: ThemeConfig<Cfg> = {
    light: { strength: 0.8, path: 'bottom' },
    dark: { strength: 1.4 },
  }

  it('returns nothing when no themes are given', () => {
    expect(resolveTheme<Cfg>(undefined, 'dark')).toEqual({})
  })

  it('returns nothing when the resolved theme has no branch', () => {
    expect(resolveTheme<Cfg>({ light: { strength: 0.8 } }, 'dark')).toEqual({})
  })

  it('picks the branch matching the resolved theme', () => {
    expect(resolveTheme(themes, 'light')).toEqual({ strength: 0.8, path: 'bottom' })
    expect(resolveTheme(themes, 'dark')).toEqual({ strength: 1.4 })
  })

  it('does not share structure with the input branch', () => {
    const src: ThemeConfig<Cfg> = { dark: { strength: 1.4 } }
    const out = resolveTheme(src, 'dark')
    ;(out as Partial<Cfg>).strength = 99
    expect(src.dark!.strength).toBe(1.4)
  })
})

describe('variant lists', () => {
  it('are the single source of truth for variant slots', () => {
    expect(THEME_VARIANTS).toEqual(['light', 'dark'])
    expect(INTERACTION_VARIANTS).toEqual(['base', 'whileHover', 'whilePressed'])
  })
})

// mergeConfig IS the merge all three components run — testing it here tests
// them, which a hand-written copy of the spread expression never did.
describe('mergeConfig', () => {
  const DEFAULTS: Cfg = { duration: 1, strength: 1, path: 'bottom' }

  const merge = (
    over: Partial<Cfg>,
    themes: ThemeConfig<Cfg> | undefined,
    state: string | null | undefined,
    theme: 'light' | 'dark',
    interaction = NONE,
    overlays: { whileHover?: Partial<Cfg>; whilePressed?: Partial<Cfg> } = {}
  ): Cfg =>
    mergeConfig<Cfg>({
      defaults: DEFAULTS,
      props: over,
      themes,
      state,
      builtIns,
      theme,
      interaction,
      ...overlays,
    })

  it('lets the flat props override the defaults', () => {
    expect(merge({ strength: 2 }, undefined, undefined, 'dark').strength).toBe(2)
    expect(merge({}, undefined, undefined, 'dark').path).toBe('bottom')
  })

  it('lets a theme branch override the flat props', () => {
    expect(merge({ strength: 2 }, { dark: { strength: 5 } }, undefined, 'dark').strength).toBe(5)
  })

  it('lets a named state override the theme branch', () => {
    // thinking.dark.base sets strength: 2 — it must win over themes.dark
    expect(merge({}, { dark: { strength: 5 } }, 'thinking', 'dark').strength).toBe(2)
  })

  it('keeps theme-branch keys the state does not set', () => {
    // thinking.dark.base sets duration + strength but never path
    expect(merge({}, { dark: { path: 'breathe' } }, 'thinking', 'dark').path).toBe('breathe')
  })

  it('applies the theme branch under hover overlays too', () => {
    const out = merge({}, { dark: { path: 'breathe' } }, 'thinking', 'dark', HOVER)
    expect(out.path).toBe('breathe')
    expect(out.strength).toBe(1.8) // thinking.dark.whileHover
  })

  it('applies the flat whileHover overlay only while hovered', () => {
    expect(merge({}, undefined, undefined, 'dark', NONE, { whileHover: { strength: 3 } }).strength).toBe(1)
    expect(merge({}, undefined, undefined, 'dark', HOVER, { whileHover: { strength: 3 } }).strength).toBe(3)
  })

  it('applies the flat whilePressed overlay only while pressed, over whileHover', () => {
    const overlays = { whileHover: { strength: 3 }, whilePressed: { strength: 4 } }
    expect(merge({}, undefined, undefined, 'dark', HOVER, overlays).strength).toBe(3)
    expect(merge({}, undefined, undefined, 'dark', PRESS, overlays).strength).toBe(4)
  })

  it('puts the flat overlays ABOVE the named state — they are explicit at the call site', () => {
    // thinking.dark.whileHover sets strength: 1.8; the prop overlay wins
    expect(merge({}, undefined, 'thinking', 'dark', HOVER, { whileHover: { strength: 9 } }).strength).toBe(9)
  })

  it("defaults `state` to 'idle' so states.idle auto-applies with no state prop", () => {
    const custom: Record<string, StateConfig<Cfg>> = { idle: { dark: { base: { strength: 7 } } } }
    const out = mergeConfig<Cfg>({
      defaults: DEFAULTS,
      props: {},
      builtIns,
      states: custom,
      theme: 'dark',
      interaction: NONE,
    })
    expect(out.strength).toBe(7)
  })

  it('suppresses state resolution entirely for state: null', () => {
    expect(merge({}, { dark: { strength: 5 } }, null, 'dark').strength).toBe(5)
  })
})

// The pipeline was copy-pasted into all three components once and drifted
// twice (a missing `state = 'idle'` default, an unread `transitionMs`). There
// is no DOM environment here to render them in, so assert the cheap invariant
// instead: each component delegates to mergeConfig and re-implements nothing.
describe('the components use the shared pipeline', () => {
  // read as text through Vite rather than node:fs — the package has no
  // @types/node and does not want one for a test
  const sources = import.meta.glob('../*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >

  // a glob that matches nothing would register no tests and pass in silence —
  // exactly the failure this whole suite exists to catch
  it('sees all three effect components', () => {
    expect(Object.keys(sources)).toHaveLength(3)
  })

  for (const [path, src] of Object.entries(sources)) {
    it(`${path} calls mergeConfig and hand-rolls no merge of its own`, () => {
      expect(src).toMatch(/mergeConfig<\w+>\(\{/)
      expect(src).not.toMatch(/resolveTheme\(/)
      expect(src).not.toMatch(/resolveState\(\w/)
    })

    it(`${path} normalizes and reads transitionMs rather than only accepting it`, () => {
      expect(src).toMatch(/finiteNumber\(transitionMs, 320, 0, 10_000\)/)
      expect(src).toMatch(/\$\{safeTransitionMs\}ms/)
    })
  }
})

describe('core subpath', () => {
  it('re-exports every primitive the GL package needs', async () => {
    const core = await import('./index')
    for (const name of [
      'subscribe', 'setTickRate', 'getTickRate',
      'useTheme', 'detectTheme', 'subscribeTheme',
      'getLUT', 'walkSmooth', 'walkRect', 'pathPx', 'quantAspect', 'rand',
      'mergeConfig', 'resolveState', 'resolveTheme', 'useInteraction',
      'THEME_VARIANTS', 'INTERACTION_VARIANTS', 'PATH_N', 'EASE',
    ]) {
      expect(core, `missing ${name}`).toHaveProperty(name)
    }
  })
})

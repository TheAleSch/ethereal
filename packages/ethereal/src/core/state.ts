// Named states, shared by all three effects. A state is a bag of partial
// config keyed by *variant*: two theme variants that are picked by the
// resolved theme, and interaction overlays that merge on top while the host
// is hovered or pressed.
//
// The merge order is fixed and one-way: theme variant, then hover, then
// press. Later wins, so `whilePressed` can always override `whileHover`.
import { useEffect, useState, type RefObject } from 'react'

import type { StateDeriver } from './derive'
import type { Theme } from './theme'
import { devWarn } from './util'

/** Theme branches. Exported so consumers iterate rather than redeclare. */
export const THEME_VARIANTS = ['light', 'dark'] as const
export type ThemeVariant = (typeof THEME_VARIANTS)[number]

/** Interaction slots inside a theme branch, in merge order. */
export const INTERACTION_VARIANTS = ['base', 'whileHover', 'whilePressed'] as const
export type InteractionSlot = (typeof INTERACTION_VARIANTS)[number]

/** One theme's treatment of a state: a base config plus interaction overlays
 *  merged on top while the host is hovered / pressed. */
export type InteractionVariant<C> = {
  /** the state's config for this theme */
  base?: Partial<C>
  /** merged on top while hovered (mouse only) */
  whileHover?: Partial<C>
  /** merged on top while pressed — pointer or keyboard */
  whilePressed?: Partial<C>
}

/** A named state. Theme owns interaction, so light and dark can carry
 *  different hover/press treatments. */
export type StateConfig<C = Record<string, unknown>> = {
  light?: InteractionVariant<C>
  dark?: InteractionVariant<C>
}

/** A base config's theme branches. Unlike `StateConfig` there are no
 *  interaction slots: hover and press treatments belong to a named state,
 *  or to the flat `whileHover` / `whilePressed` props. */
export type ThemeConfig<C = Record<string, unknown>> = Partial<Record<ThemeVariant, Partial<C>>>

export type Interaction = { hovered: boolean; pressed: boolean }

const NONE: Interaction = { hovered: false, pressed: false }

// one warning per component+state, so a re-rendering tree doesn't spam
const warned = new Set<string>()

/** Resolve a state name to a flat override set. Returns `{}` for an unknown
 *  state (warning once) or when no state is named. */
export function resolveState<C>(
  state: string | null | undefined,
  builtIns: Record<string, StateConfig<C>>,
  custom: Record<string, StateConfig<C>> | undefined,
  theme: Theme,
  interaction: Interaction = NONE,
  componentName = 'ethereal',
): Partial<C> {
  if (!state) return {}
  const builtIn = builtIns[state]
  const override = custom?.[state]
  if (!builtIn && !override) {
    const key = `${componentName}:${state}`
    if (!warned.has(key)) {
      warned.add(key)
      devWarn(
        `[@theale/${componentName}] unknown state "${state}" — pass it via the \`states\` prop or use one of: ${Object.keys(builtIns).join(', ')}`,
      )
    }
    return {}
  }
  const builtInBranch = builtIn?.[theme]
  const overrideBranch = override?.[theme]
  let merged: Partial<C> = { ...builtInBranch?.base, ...overrideBranch?.base }
  if (interaction.hovered)
    merged = {
      ...merged,
      ...builtInBranch?.whileHover,
      ...overrideBranch?.whileHover,
    }
  if (interaction.pressed)
    merged = {
      ...merged,
      ...builtInBranch?.whilePressed,
      ...overrideBranch?.whilePressed,
    }
  return merged
}

/** Resolve a base config's theme branch to a flat override set. Applied
 *  BELOW named states in the merge, so a state can always override the
 *  theme baseline — the inverse would let `themes.dark.duration` silently
 *  pin duration across every state. */
export function resolveTheme<C>(themes: ThemeConfig<C> | undefined, theme: Theme): Partial<C> {
  // copy, never hand back the caller's object: the result is spread into a
  // config that downstream code clamps and mutates
  return { ...themes?.[theme] }
}

/** Everything the merge needs. An options bag rather than ten positional
 *  arguments: every effect passes all of it, and a mis-ordered pair of
 *  `Partial<C>`s would type-check silently. */
export type MergeConfigInput<C> = {
  /** the effect's exported defaults */
  defaults: C
  /** the caller's flat config props */
  props: Partial<C>
  themes?: ThemeConfig<C>
  /** `null` suppresses state resolution entirely */
  state?: string | null
  builtIns: Record<string, StateConfig<C>>
  states?: Record<string, StateConfig<C>>
  /** the effect's rule for deriving a named state from the config the caller
   *  gave. Consulted BELOW `builtIns`/`states`, so an explicit entry always
   *  wins — derivation is the fallback, never an override. */
  derive?: StateDeriver<C>
  theme: Theme
  interaction: Interaction
  whileHover?: Partial<C>
  whilePressed?: Partial<C>
  componentName?: string
}

/** The one merge every effect performs. Lives here rather than in each
 *  component because it was copy-pasted three ways and drifted twice — a
 *  missing `state = 'idle'` default in two of them, and a `transitionMs` that
 *  only one of them read.
 *
 *  Order, lowest to highest: defaults → flat props → theme branch → DERIVED
 *  state variation → named state (its theme branch, then hover/press slots) →
 *  flat overlays. The flat overlays land LAST because they are explicit at the
 *  call site, so a state's `base` must not silently swallow them; the
 *  consequence is that for a given key you use the prop overlay OR the state's
 *  slot, never both.
 *
 *  The derived variation sits between the caller's config and the state tables
 *  on purpose. It READS the config below it — that is how `state="thinking"`
 *  stays recognisably the preset the caller configured rather than a different
 *  effect wearing the same component — and anything the built-in table (or a
 *  caller's `states` prop) says explicitly overwrites it. This is the ONLY
 *  place that precedence is expressed; no component may re-derive on its own.
 *
 *  `state: null` suppresses derivation along with state resolution, and a
 *  deriver returns `{}` for `'idle'`, so a config with no state and a config
 *  with `state="idle"` still merge identically. */
export function mergeConfig<C>({
  defaults,
  props,
  themes,
  state = 'idle',
  builtIns,
  states,
  derive,
  theme,
  interaction,
  whileHover,
  whilePressed,
  componentName,
}: MergeConfigInput<C>): C {
  // the config as the caller expressed it — everything below the state layer.
  // Derivation reads THIS, not the partially-stated result, so the variation
  // can never feed on itself.
  const configured = {
    ...defaults,
    ...props,
    ...resolveTheme(themes, theme),
  } as C
  return {
    ...configured,
    ...(state && derive ? derive(configured, state) : null),
    ...resolveState(state, builtIns, states, theme, interaction, componentName),
    ...(interaction.hovered ? whileHover : null),
    ...(interaction.pressed ? whilePressed : null),
  } as C
}

/** How long a press overlay is held even if the pointer is released sooner —
 *  without it, a fast click produces a one-frame flash nobody sees. */
const MIN_PULSE = 600

/** Track hover/press on the effect's *host* (the ref's parent element), for
 *  driving the `whileHover`/`whilePressed` overlays. */
export function useInteraction(ref: RefObject<HTMLElement | null>): Interaction {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    const host = ref.current?.parentElement
    if (!host) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let downAt = 0
    let holding = false
    // A window-level release can belong to another finger, pen, or mouse. Keep
    // the source that started this press so only its own release/cancel can end
    // it; blur is the one deliberate unconditional release.
    type PressSource = { kind: 'pointer'; id: number; pointerType: string } | { kind: 'keyboard'; key: 'Enter' | ' ' }
    let pressSource: PressSource | null = null

    // hover is mouse-only: a touch tap fires pointerenter but often never
    // fires pointerleave (the pointer ceases to exist rather than moving
    // away), which would latch the overlay on for the life of the page
    const enter = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') setHovered(true)
    }
    const leave = () => setHovered(false)

    const down = (source: PressSource) => {
      if (holding) return // keydown autorepeat
      holding = true
      pressSource = source
      if (timer) clearTimeout(timer)
      downAt = performance.now()
      setPressed(true)
    }
    const up = (source?: PressSource) => {
      if (!holding) return
      if (
        source &&
        (!pressSource ||
          source.kind !== pressSource.kind ||
          (source.kind === 'pointer' && pressSource.kind === 'pointer' && source.id !== pressSource.id) ||
          (source.kind === 'keyboard' && pressSource.kind === 'keyboard' && source.key !== pressSource.key))
      )
        return
      holding = false
      // a touch/pen release also ends "hover" — see enter(). A MOUSE release
      // must not: the cursor is still over the host and no pointerenter will
      // follow, so clearing here would latch the overlay off until the user
      // moved out and back in — i.e. clicking would kill your own hover.
      if (pressSource?.kind === 'pointer' && (pressSource.pointerType === 'touch' || pressSource.pointerType === 'pen'))
        setHovered(false)
      pressSource = null
      const left = MIN_PULSE - (performance.now() - downAt)
      if (left <= 0) setPressed(false)
      else timer = setTimeout(() => setPressed(false), left)
    }

    // keyboard activation must pulse too — Enter/Space on a focused button is
    // a press, and pointer events say nothing about it.
    // Bubbling keys from an editable descendant are NOT activation: in the
    // documented EtherealWrap-around-an-input pattern, typing a space is
    // writing, and pulsing whilePressed on every word made the effect strobe.
    // A wrapped non-editable control (a real button) still activates.
    const fromEditable = (event: KeyboardEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || target === host) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }
    const keyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && !fromEditable(event))
        down({ kind: 'keyboard', key: event.key })
    }
    const keyUp = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && !fromEditable(event))
        up({ kind: 'keyboard', key: event.key })
    }

    host.addEventListener('pointerenter', enter)
    host.addEventListener('pointerleave', leave)
    const pointerDown = (event: PointerEvent) => {
      // primary button only — a right-click opens a menu, it does not press
      // the control, and the matching pointerup often never reaches us.
      // (`> 0`, not `!== 0`: synthetic events without a button field are a
      // primary press, not a secondary one)
      if (event.button > 0) return
      down({
        kind: 'pointer',
        id: event.pointerId,
        pointerType: event.pointerType,
      })
    }
    const pointerUp = (event: PointerEvent) =>
      up({
        kind: 'pointer',
        id: event.pointerId,
        pointerType: event.pointerType,
      })
    const blur = () => up()
    host.addEventListener('pointerdown', pointerDown)
    host.addEventListener('keydown', keyDown)
    host.addEventListener('keyup', keyUp)
    // release listens on window — drags that end outside the host, and blur
    // mid-press, must still clear the overlay
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerUp)
    window.addEventListener('blur', blur)
    return () => {
      if (timer) clearTimeout(timer)
      host.removeEventListener('pointerenter', enter)
      host.removeEventListener('pointerleave', leave)
      host.removeEventListener('pointerdown', pointerDown)
      host.removeEventListener('keydown', keyDown)
      host.removeEventListener('keyup', keyUp)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerUp)
      window.removeEventListener('blur', blur)
    }
  }, [ref])

  return { hovered, pressed }
}

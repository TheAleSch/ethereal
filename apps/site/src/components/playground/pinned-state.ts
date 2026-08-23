// The interaction slot pinned into the preview, resolved to plain props.
//
// The playground lets you pin `whileHover` / `whilePressed` so a hover or
// press treatment stays visible while your pointer is over the control panel
// — the effect's real pointer state is `{hovered:false, pressed:false}` the
// whole time you are tuning it. The package offers no forcing API, so the
// playground resolves the cascade itself and hands the result over as flat
// config props.
//
// This is a MIRROR of `mergeConfig` (packages/ethereal/src/core/state.ts) for
// the layers the pin takes over. It lives in its own module, away from the
// component, because a mirror that silently falls out of step with the thing
// it mirrors is exactly the bug this file already shipped once: derivation
// arrived in mergeConfig and this cascade did not learn about it, so pinning a
// slot on `thinking` previewed the plain base config with none of the state's
// character. Out here it can be tested against the real merge.
import type {
  EtherealCfg,
  InteractionSlot,
  StateConfig,
  ThemeConfig,
} from "@theale/ethereal"

export type PinnedStateInput = {
  /** which slot is pinned; `base` means nothing is pinned */
  slot: InteractionSlot
  /** the active state name — `idle` has no variation of its own */
  stateName: string
  theme: "light" | "dark"
  /** the flat config the user is editing, below every state layer */
  cfg: Partial<EtherealCfg>
  /** the effect's package defaults. Required, because the deriver reads keys
   *  the user may never have touched — derive a tightened pulse from a config
   *  missing `pulseMin` and you get the fallback, not the default the effect
   *  actually renders. mergeConfig has the defaults underneath by
   *  construction; this mirror has to be handed them. */
  defaults: EtherealCfg
  themes?: ThemeConfig<EtherealCfg>
  /** the effect's built-in state table */
  builtIns: Record<string, StateConfig<EtherealCfg>>
  /** the user's own states, which beat the built-ins at every level */
  custom?: Record<string, StateConfig<EtherealCfg>>
  /** the effect's derived-state rule, or undefined for effects without one */
  derive?: (cfg: EtherealCfg, state: string) => Partial<EtherealCfg>
}

/**
 * Flat props that render `stateName`'s `slot` treatment on the preview.
 * Returns `{}` when nothing is pinned.
 *
 * `state: null` (not `undefined`, which mergeConfig reads as `'idle'`) is what
 * makes this safe: it stops `resolveState` inside the component from running
 * on the real pointer interaction and spreading its result AFTER these props,
 * which would reset every key the state's `base` slot carries back to the
 * unpinned value. `themes` is suppressed for the same reason and re-applied
 * here at the bottom, or the component's own `resolveTheme` would land on top
 * and invert the themes-vs-state precedence.
 */
export function pinnedStateOverride({
  slot,
  stateName,
  theme,
  cfg,
  defaults,
  themes,
  builtIns,
  custom,
  derive,
}: PinnedStateInput): Record<string, unknown> {
  if (slot === "base") return {}
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `Record<string, …>` indexing is typed as an always-hit, but `stateName` is user-chosen (?st= or the states editor) and need not have a built-in twin
  const builtInBranch = builtIns[stateName]?.[theme]
  const customBranch = custom?.[stateName]?.[theme]
  // fed the PRE-STATE config, exactly like mergeConfig does, so a derivation
  // can never compound with its own output
  const configured = { ...defaults, ...cfg, ...themes?.[theme] }
  return {
    state: null,
    states: undefined,
    themes: undefined,
    ...themes?.[theme],
    // between the theme branch and the state slots — mergeConfig's position.
    // Skipped for `idle`, which by contract renders as no state at all.
    ...(derive && stateName !== "idle" ? derive(configured, stateName) : null),
    ...builtInBranch?.base,
    ...customBranch?.base,
    // a real mouse press is {hovered:true, pressed:true}, so a pinned press
    // sits on top of the hover treatment, never directly on base
    ...(slot === "whilePressed" ? builtInBranch?.whileHover : undefined),
    ...(slot === "whilePressed" ? customBranch?.whileHover : undefined),
    ...builtInBranch?.[slot],
    ...customBranch?.[slot],
  }
}

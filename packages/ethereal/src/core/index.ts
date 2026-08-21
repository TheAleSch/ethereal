// Internal primitives, exposed as `@theale/ethereal/core` so the sibling
// renderer packages share one ticker, one theme observer and one merge
// implementation rather than each shipping their own. Not part of the root
// export: application code should never need these.
export { subscribe, setTickRate, getTickRate, setPaused, isPaused } from './ticker'
export { useTheme, useReducedMotion, detectTheme, subscribeTheme } from './theme'
export type { Theme } from './theme'
export { getLUT, walkSmooth, walkRect, pathPx, quantAspect, rand, PATH_N } from './path'
// travel easing curves — the GL renderer eases its own travel parameter and
// must use the SAME curves as the CSS renderer, not a second copy of them
export { EASE } from './util'
export type { TravelEase } from './util'
export { mergeConfig, resolveState, resolveTheme, useInteraction, THEME_VARIANTS, INTERACTION_VARIANTS } from './state'
// state derivation — the sibling renderers derive their own states from the
// same character constants and numeric shaping, so `thinking` means the same
// thing in every renderer
export { THINKING, AUDIO, scaleDuration, lift, damp, scale, tightenPulse } from './derive'
export type { StateDeriver } from './derive'
export type {
  StateConfig,
  ThemeConfig,
  Interaction,
  InteractionSlot,
  InteractionVariant,
  ThemeVariant,
  MergeConfigInput,
} from './state'

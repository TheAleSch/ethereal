export { Ethereal, EtherealWrap, ETHEREAL, ETHEREAL_STATES, deriveEtherealState } from './ethereal'
export type { EtherealCfg, EtherealProps, EtherealState, Theme } from './ethereal'
// the rule behind a named state — exported so a UI can PREVIEW the variation a
// state would produce for a config without mounting the component
export type { StateDeriver } from './core/derive'
export { THEME_VARIANTS, INTERACTION_VARIANTS, resolveState, resolveTheme, mergeConfig } from './core/state'
export type { StateConfig, ThemeConfig, InteractionVariant, ThemeVariant, InteractionSlot, Interaction, MergeConfigInput } from './core/state'
export { EventHorizon, EventHorizonWrap, EVENT_HORIZON, EVENT_HORIZON_PRESETS, EVENT_HORIZON_STATES, deriveEventHorizonState } from './event-horizon'
export type { EventHorizonCfg, EventHorizonProps } from './event-horizon'
export { EtherealDither, EtherealDitherWrap, ETHEREAL_DITHER, ETHEREAL_DITHER_STATES, deriveEtherealDitherState } from './ethereal-dither'
export type { EtherealDitherCfg, EtherealDitherProps } from './ethereal-dither'
export { setTickRate, getTickRate, setPaused, isPaused } from './core/ticker'
// part of the public config types (EtherealCfg.travelEase) — without this a
// consumer can hold a config but never NAME the union it contains
export type { TravelEase } from './core/util'
export { attachAudio, attachMicAudio } from './core/audio'
// AudioAttachment is what both attach calls resolve to, and AudioRanges is the
// shape of AttachAudioOptions.ranges — both appear in exported signatures, so
// both must be nameable by callers storing or building them
export type {
  AttachAudioOptions,
  AttachMicAudioOptions,
  AudioAttachment,
  AudioGlowSource,
  AudioRanges,
} from './core/audio'

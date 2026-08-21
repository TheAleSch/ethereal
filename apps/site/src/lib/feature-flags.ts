/** Strict, disabled-by-default build flags for unfinished public surfaces. */
export function featureEnabled(value: unknown): boolean {
  return value === "true"
}

/**
 * The microphone preview is still experimental. The underlying package API
 * remains available, but the site must not request permission or advertise
 * the control unless a build explicitly opts in.
 */
export const MIC_REACTIVITY_ENABLED = featureEnabled(
  import.meta.env.VITE_ENABLE_MIC_REACTIVITY
)

/**
 * The whole audio-reactivity surface (demo source, audio state preset, the
 * attach-time drive knobs) is not polished enough to ship yet. Same contract
 * as the mic flag: hidden by default, package API untouched.
 */
export const AUDIO_REACTIVITY_ENABLED = featureEnabled(
  import.meta.env.VITE_ENABLE_AUDIO_REACTIVITY
)

// Audio-reactive drive for the glow.
//
// The design rule here is: SOUND MODULATES THE EFFECT YOU TUNED. It never
// replaces it. Every variable below RESTS AT EXACTLY 1.0 in a silent room, so
// an un-driven or silent host renders byte-identically to one that was never
// attached. Sound then pushes those values around 1 — the needles you already
// configured rise and fall like a waveform, the hotspots you already placed
// swell, and the whole glow lifts a little. Nothing new is drawn.
//
//   --aud     whole-effect loudness lift        (1 → ~1.5 at full drive)
//   --ahot    hotspot swell                     (1 → ~1.9 at full drive)
//   --fb0..7  per-band needle scale, low→high   (1 → 0.3‥2.4 across the bands)
//
// By default sound only ever pushes those values UP — rest is the floor. Pass
// `dip` to spend part of the swing downwards instead, so the lulls inside a
// sound fall below the tuned look and the effect covers a wider range. Silence
// still rests at exactly 1 either way; see the option's own note.
//
// Everything here is opt-in and external to the components: no mic permission
// is ever requested unless attachMicAudio() is called.
import { subscribe } from './ticker'
import { devWarn } from './util'

/** Anything that can feed the analyser: a live MediaStream (mic, WebRTC
 * remote track), a playing <audio>/<video> element (TTS/assistant playback),
 * or any Web Audio node you already have (e.g. the output GainNode of a
 * streaming-TTS graph). */
export type AudioGlowSource = MediaStream | HTMLMediaElement | AudioNode

/** Per-target depth. `sensitivity` is per-MICROPHONE gain — how loud the room
 *  has to be to count as loud. These are per-DESIGN taste: how far each
 *  variable travels once the sound has been measured. Wild needles over a calm
 *  glow is `{ bands: 2, glow: 0.4 }`. Every value defaults to 1, and 0 pins
 *  that target at its resting value while the others keep moving. */
export type AudioRanges = {
  /** whole-effect loudness lift, `--aud` */
  glow?: number
  /** hotspot swell, `--ahot` */
  hotspot?: number
  /** per-band needle scale, `--fb0..7` */
  bands?: number
}

export type AttachAudioOptions = {
  /** how far sound pushes the glow from its resting look. 1 is the tuned
   * default; 0 freezes the effect at rest, 2 roughly doubles the excursion.
   * This is a MULTIPLIER ON THE DEVIATION, not on the output — sensitivity
   * has no effect in silence, by construction. */
  sensitivity?: number
  /** How far the quiet moments *inside* a sound pull the effect BELOW its
   * resting look, 0‥1. The default 0 only ever lifts: rest is the floor, and
   * loudness is the only direction. Raising it makes the same sound cover a
   * wider range — a lull between words dims and shrinks the effect as much as
   * a peak swells it, so it breathes rather than pumps.
   *
   * It costs nothing in silence. The dip is scaled by a slow "is anything
   * playing at all" envelope, so a host with no sound on it still rests at
   * exactly 1 and renders identically to one that was never attached. */
  dip?: number
  /** per-target depth on top of `sensitivity` — see AudioRanges */
  ranges?: AudioRanges
  /** reuse an existing AudioContext instead of creating one — recommended
   * for HTMLMediaElement sources so playback routing stays under your
   * control (see caveats on detach below) */
  context?: AudioContext
}

/**
 * What an attach hands back. It IS the detach function — `const stop = await
 * attachAudio(...); stop()` is the whole API for most callers — with an
 * `update` on the side for tuning UIs that need to change depth on a live
 * source. Adding a method to the function rather than returning an object
 * keeps the common case a one-liner.
 */
export type AudioAttachment = (() => void) & {
  /** Retune `sensitivity` / `dip` / `ranges` on the running drive. Omitted keys
   *  keep their current value. No audio graph is touched, so the AudioContext,
   *  the microphone permission and the loudness envelope all survive. */
  update: (next: Pick<AttachAudioOptions, 'sensitivity' | 'dip' | 'ranges'>) => void
}

export type AttachMicAudioOptions = AttachAudioOptions & {
  /** reuse an existing stream (e.g. one you already hold for a call) — it
   * will NOT be stopped on detach; streams we open ourselves are */
  stream?: MediaStream
}

// roughly log-spaced bin edges over the voice/music range (fftSize 512)
const EDGES = [0, 3, 6, 11, 19, 33, 57, 97, 160] as const
const BANDS = 8

// Voice and music both fall off with frequency, so raw bin energy makes the
// top bands permanently dead and the waveform lopsided — every needle on the
// right of the row would sit flat while the left ones did all the moving.
// Tilting the bands back up costs nothing and is what makes the row read as
// a spectrum instead of a ramp.
const BAND_TILT = [0.7, 0.85, 1, 1.15, 1.4, 1.7, 2.1, 2.5] as const

// Envelope time constants, in SECONDS — not per-frame factors. The old code
// used fixed per-frame lerp rates, which meant the effect literally responded
// twice as fast on a 120Hz display as on a 60Hz one.
const LEVEL_ATTACK = 0.045
const LEVEL_RELEASE = 0.3
// "is there sound on this host at all", as opposed to how loud it is right
// now. Deliberately far slower to fall than LEVEL_RELEASE: that gap IS the
// dip. Between two words `level` has already dropped and `presence` has not,
// so the effect reads the lull as quiet-within-sound and sags; once the source
// actually stops, presence follows it down and the dip goes with it.
const PRESENCE_ATTACK = 0.12
const PRESENCE_RELEASE = 1.4
const BAND_ATTACK = 0.05
const BAND_RELEASE = 0.19
// how long a loud moment keeps setting the reference level. Long enough that
// a pause between words doesn't re-scale the room, short enough that walking
// away from the mic doesn't leave the effect permanently deaf.
const PEAK_FALL = 5
// ...and how fast it RISES. Instant tracking made the reference "the loudest
// single frame so far", so a chair scrape or a plosive set the scale for the
// next PEAK_FALL seconds and everything after it read as quiet.
const PEAK_ATTACK = 0.1

// below this RMS we call it silence and drive nothing — otherwise room tone
// gets auto-gained up into a constant shimmer
const NOISE_FLOOR = 0.012
// Where the reference level STARTS: roughly the RMS of ordinary speech at a
// normal distance from a laptop mic. Seeding it at the noise floor instead
// (the old behaviour) made the very first sound the loudest thing the
// envelope had ever heard — by definition — so every attach opened pinned at
// full drive and then went quiet as the true peak caught up. Starting from a
// plausible voice means the first syllable reads as a first syllable.
const REST_PEAK = 0.09
// the smallest span between "silence" and "as loud as you get". Without a
// floor, a very quiet room gives a hair-thin headroom in which every faint
// sound maps to full drive. Kept just under the RMS of quiet-but-real speech
// (~0.05) so a quiet MIC still reaches full drive — the auto-gain promise —
// while a room with nothing in it cannot.
const MIN_HEADROOM = 0.035
// The LOW reference, and the other half of the auto-gain. A fixed noise floor
// answers "is this sound at all"; it cannot answer "is this loud FOR THIS
// SOURCE". Music mastered to a constant loudness sits permanently far above
// any fixed floor, so the normalized drive lived in the top of its range and
// several bands stayed pinned at their ceiling — the effect had a reference
// for its maximum and none for its minimum, which reads as an effect that
// barely moves.
//
// `trough` tracks the recent QUIET: it drops to a lull almost at once and
// creeps back up slowly, so the gap between beats — not silence — becomes the
// bottom of the range.
const TROUGH_FALL = 0.15
const TROUGH_RISE = 2.5
// ...but never closer than this to the peak. A sustained tone has no lulls to
// find, and a trough free to climb all the way would squeeze the range shut
// and fade the effect out mid-note.
const TROUGH_CEIL = 0.7
// Perceptual curve on the normalized drive. Loudness is not linear in RMS:
// conversational speech sits around a fifth of your own shouting peak, which
// on a straight ratio moved --aud by 0.1 out of 0.5 — technically correct and
// visibly dead. The exponent lifts the middle without touching either end
// (0 stays 0, 1 stays 1).
const DRIVE_CURVE = 0.6

// excursion at full drive, before `sensitivity`
const AUD_RANGE = 0.5
const HOT_RANGE = 0.9
const BAND_RANGE = 2.4
// Where a full `dip` puts the neutral point on the 0‥1 loudness scale: at 0.5
// the effect rests at its tuned look during a MIDDLING moment, and travels in
// both directions from there. The loud end is renormalized against it (see
// `swing`) so raising the dip widens the range downwards instead of trading
// the top of it away.
const DIP_PIVOT = 0.5
// how far a full dip can travel below rest, as a fraction of the upward range.
// Below rest there is much less room than above it — a glow at 0 is off, and
// off does not read as "quiet", it reads as broken — so the downward half of
// the swing is deliberately the shorter one.
const DIP_RANGE = 0.7
// nothing this module writes may reach 0: these variables are multipliers on
// radii and alphas, and a 0 (or a negative, which a big `sensitivity` times a
// full dip would otherwise produce) collapses the effect rather than dimming it
const DRIVEN_FLOOR = 0.2
// bands below this normalized level pull their needles DOWN rather than up;
// at 0.45 a flat-spectrum sound leaves the row roughly where it was and only
// real spectral shape moves it
const BAND_PIVOT = 0.45

const clamp = (value: number, low: number, high: number) => (value < low ? low : value > high ? high : value)

// frame-rate-independent one-pole smoothing: `tau` is the time to cover ~63%
// of the remaining distance, in seconds
const approach = (current: number, target: number, tau: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-dt / Math.max(1e-4, tau)))

/** Mutable envelope state for one attached source. Split out from driveHost
 *  so the mapping from raw analyser numbers to CSS values can be tested
 *  without a Web Audio implementation.
 *  @internal — not part of the published API; not re-exported by ./core. */
export type AudioEnvelope = {
  level: number
  /** slow-release twin of `level` — see PRESENCE_RELEASE */
  presence: number
  peak: number
  /** the recent QUIET, and the low end of the auto-gain — see TROUGH_FALL */
  trough: number
  bandLevels: Float32Array
  bandPeaks: Float32Array
  bandTroughs: Float32Array
}

/** @internal */
export const newAudioEnvelope = (): AudioEnvelope => ({
  level: 0,
  presence: 0,
  peak: REST_PEAK,
  trough: 0,
  bandLevels: new Float32Array(BANDS),
  bandPeaks: new Float32Array(BANDS).fill(REST_PEAK),
  bandTroughs: new Float32Array(BANDS),
})

/** Track the recent quiet: snap down to a lull, creep back up, and never climb
 *  within `1 - TROUGH_CEIL` of the peak. Shared by the overall level and by
 *  every band, because "quiet for this source" is the same question at both
 *  scales. */
const trackTrough = (current: number, value: number, peak: number, dt: number) =>
  Math.min(approach(current, value, value < current ? TROUGH_FALL : TROUGH_RISE, dt), peak * TROUGH_CEIL)

/**
 * Advances `env` by `dt` seconds and returns the CSS values for this frame.
 * Pure apart from mutating `env`.
 * @internal
 */
export function audioFrame(
  env: AudioEnvelope,
  rms: number,
  bandEnergy: ArrayLike<number>,
  sensitivity: number,
  dt: number,
  ranges: Required<AudioRanges> = { glow: 1, hotspot: 1, bands: 1 },
  dip = 0,
): { aud: number; ahot: number; bands: number[] } {
  // Auto-gain. Without it the same code is unusable on two different mics:
  // one sits at 5% and never lights anything, the other clips and pins every
  // variable to its ceiling. Referencing a slowly-decaying peak means "as
  // loud as you have recently been" maps to full drive on any input, and the
  // caller never has to hand-tune `sensitivity` per device.
  // rise is smoothed, fall is the slow decay: a transient lifts the reference
  // gradually, silence lets it sag back toward REST_PEAK over PEAK_FALL
  const decayed = Math.max(env.peak - (env.peak * dt) / PEAK_FALL, REST_PEAK * 0.35)
  env.peak = rms > decayed ? approach(decayed, rms, PEAK_ATTACK, dt) : decayed
  env.trough = trackTrough(env.trough, rms, env.peak, dt)
  // the higher of the two references: the fixed floor still decides what
  // counts as silence at all, the trough decides what counts as quiet for THIS
  // source once it is playing
  const low = Math.max(NOISE_FLOOR, env.trough)
  // MIN_HEADROOM is an ABSOLUTE span, and it only makes sense against the
  // absolute floor. Once the trough is the reference the span is already
  // relative — TROUGH_CEIL guarantees at least 30% of the peak — and imposing
  // an absolute minimum on top of it would flatten exactly the quiet sources
  // the auto-gain exists for: a mic peaking at 0.05 has a legitimate 0.015 of
  // headroom, and forcing 0.035 there caps it at two-thirds drive forever.
  const headroom = env.trough > NOISE_FLOOR ? env.peak - low : Math.max(env.peak - NOISE_FLOOR, MIN_HEADROOM)
  const drive = clamp((rms - low) / headroom, 0, 1) ** DRIVE_CURVE
  env.level = approach(env.level, drive, drive > env.level ? LEVEL_ATTACK : LEVEL_RELEASE, dt)
  env.presence = approach(env.presence, drive, drive > env.presence ? PRESENCE_ATTACK : PRESENCE_RELEASE, dt)
  const { level } = env
  // The swing every target rides, in units of "one full upward excursion".
  //
  // `pivot` is the loudness that now counts as neutral. At dip 0 it is 0 and
  // `swing` is exactly `level` — the old behaviour to the bit. Above 0 the
  // neutral point moves up into the sound, so an average moment renders as
  // tuned, a peak still reaches a full +1 (the upper half is renormalized
  // against the pivot, so widening the bottom never costs you the top), and a
  // lull goes NEGATIVE and pulls the effect below its resting look.
  //
  // Both halves are scaled by `presence` — "is anything playing at all" — so a
  // silent host has a pivot of 0 and rests at exactly 1, dip or no dip.
  //
  // The downward branch divides by the CONSTANT and not by `pivot`: dividing
  // by the pivot would normalize `presence` straight back out, and since
  // `level` falls (0.3s) far faster than `presence` (1.4s), the ratio would
  // sit at a full dip forever after the sound stopped — an effect that never
  // came back up.
  const pivot = dip * env.presence * DIP_PIVOT
  const swing = level >= pivot ? (level - pivot) / (1 - pivot) : ((level - pivot) / DIP_PIVOT) * DIP_RANGE

  const bands: number[] = []
  for (let band = 0; band < BANDS; band++) {
    const raw = (bandEnergy[band] ?? 0) * BAND_TILT[band]!
    env.bandPeaks[band] = Math.max(raw, env.bandPeaks[band]! - (env.bandPeaks[band]! * dt) / PEAK_FALL, NOISE_FLOOR)
    // same two-ended reference as the overall level. Without the trough a band
    // that is simply BUSY — a kick drum's bin, or any band the tilt lifts —
    // divides by its own peak to a ratio that never comes down, and its needle
    // stands at the clamp for the whole track.
    env.bandTroughs[band] = trackTrough(env.bandTroughs[band]!, raw, env.bandPeaks[band]!, dt)
    const bandLow = env.bandTroughs[band]!
    const normalized = clamp((raw - bandLow) / Math.max(env.bandPeaks[band]! - bandLow, NOISE_FLOOR), 0, 1)
    env.bandLevels[band] = approach(
      env.bandLevels[band]!,
      normalized,
      normalized > env.bandLevels[band]! ? BAND_ATTACK : BAND_RELEASE,
      dt,
    )
    // Gating the band excursion on the OVERALL level is what keeps silence
    // flat: with no sound there is no `level`, so every band lands on exactly
    // 1 and the needles hold the shape you designed, however noisy the
    // individual bins happen to be.
    //
    // `level`, not `swing` — the needles already travel both ways, around
    // BAND_PIVOT. Gating them on a swing that goes negative would not lower
    // the row, it would turn it inside out: every needle above the pivot
    // dropping while every needle below it rose.
    bands.push(
      clamp(1 + sensitivity * ranges.bands * level * (env.bandLevels[band]! - BAND_PIVOT) * BAND_RANGE, 0.25, 2.6),
    )
  }
  return {
    aud: Math.max(DRIVEN_FLOOR, 1 + sensitivity * ranges.glow * swing * AUD_RANGE),
    ahot: Math.max(DRIVEN_FLOOR, 1 + sensitivity * ranges.hotspot * swing * HOT_RANGE),
    bands,
  }
}

// createMediaElementSource is once-per-element for life (spec) — cache the
// node so attach → detach → attach on the same element works. The OWNING
// context is cached with it: nodes can only connect within their own context,
// so a re-attach that made a fresh AudioContext would throw InvalidAccessError
// on the very first connect.
const mediaSources = new WeakMap<HTMLMediaElement, { node: MediaElementAudioSourceNode; ctx: AudioContext }>()

// every variable this module owns, so detach can reset the host completely
const DRIVEN_VARS = ['--aud', '--ahot', ...Array.from({ length: BANDS }, (_, band) => `--fb${band}`)]

/** The live drive settings. Held in one mutable object that `driveHost` reads
 *  EVERY FRAME rather than closing over the numbers, so `detach.update(...)`
 *  can retune depth without tearing the graph down — a re-attach would
 *  re-prompt for the microphone and re-seed the loudness envelope, which is
 *  precisely the moment a tuning UI is trying to hear the difference. */
type DriveSettings = {
  sensitivity: number
  dip: number
  ranges: Required<AudioRanges>
}

// Public options often originate in sliders or persisted JSON. Math.max() and
// clamp() alone propagate NaN, and Infinity times a silent (zero) envelope is
// also NaN; once written as a custom property that invalidates every CSS calc
// which consumes it. Invalid updates keep the live value, while invalid values
// at attach time fall back to the documented defaults.
const finiteAtLeast = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
const finiteBetween = (value: unknown, low: number, high: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, low, high) : fallback

// ride the shared ticker so audio updates stay in lockstep with the frames
// that consume them (and pause with the tab, like everything else)
function driveHost(host: HTMLElement, analyser: AnalyserNode, settings: DriveSettings) {
  const samples = new Uint8Array(analyser.fftSize)
  const spectrum = new Uint8Array(analyser.frequencyBinCount)
  const bandEnergy = new Float32Array(BANDS)
  const env = newAudioEnvelope()
  // priority 1: run after the effects' tick so these writes win the frame
  const unsub = subscribe((_now, dt) => {
    // dt is 0 while the ticker is paused — hold every value where it is so
    // the frozen frame the user is inspecting doesn't drift
    if (dt <= 0) return
    analyser.getByteTimeDomainData(samples)
    let sumOfSquares = 0
    for (let index = 0; index < samples.length; index++) {
      const sample = (samples[index]! - 128) / 128
      sumOfSquares += sample * sample
    }
    // time-domain RMS tracks voice far better than averaging frequency bins
    const rms = Math.sqrt(sumOfSquares / samples.length)

    analyser.getByteFrequencyData(spectrum)
    for (let band = 0; band < BANDS; band++) {
      let binSum = 0
      for (let bin = EDGES[band]!; bin < EDGES[band + 1]!; bin++) binSum += spectrum[bin]!
      bandEnergy[band] = binSum / ((EDGES[band + 1]! - EDGES[band]!) * 255)
    }

    const frame = audioFrame(env, rms, bandEnergy, settings.sensitivity, dt, settings.ranges, settings.dip)
    host.style.setProperty('--aud', frame.aud.toFixed(3))
    host.style.setProperty('--ahot', frame.ahot.toFixed(3))
    for (let band = 0; band < BANDS; band++) host.style.setProperty(`--fb${band}`, frame.bands[band]!.toFixed(3))
  }, 1)
  return () => {
    unsub()
    for (const name of DRIVEN_VARS) host.style.removeProperty(name)
  }
}

/**
 * Drives `--aud` / `--ahot` / `--fb0..7` on a host element from any audio
 * source — assistant/TTS playback included:
 *
 *   // <audio> element streaming a reply
 *   const stop = await attachAudio(hostEl, audioEl)
 *   // Web Audio node (e.g. streaming TTS output gain)
 *   const stop = await attachAudio(hostEl, ttsGain)
 *   // raw MediaStream (WebRTC remote track, display capture …)
 *   const stop = await attachAudio(hostEl, remoteStream)
 *
 * Resolves to a detach function that unhooks the drive and resets the CSS
 * variables. Ownership rules on detach:
 * - MediaStream sources: tracks are never stopped (they're yours).
 * - AudioNode sources: only the node→analyser connection is removed; the
 *   node's own context is untouched.
 * - HTMLMediaElement sources: the element stays routed through the
 *   AudioContext (createMediaElementSource is irreversible per spec), so the
 *   context is left open and playback keeps working — pass your own
 *   `context` if you want to manage its lifecycle. Note an element can only
 *   ever be attached to ONE AudioContext for its lifetime.
 */
export async function attachAudio(
  host: HTMLElement,
  source: AudioGlowSource,
  { sensitivity = 1, dip = 0, ranges, context }: AttachAudioOptions = {},
): Promise<AudioAttachment> {
  const isNode = typeof AudioNode !== 'undefined' && source instanceof AudioNode
  const isMedia = typeof HTMLMediaElement !== 'undefined' && source instanceof HTMLMediaElement
  // an element already routed through a context is stuck with it for life —
  // reuse it (and warn if the caller asked for a different one) instead of
  // connecting its source node across contexts
  const cachedMedia = isMedia ? mediaSources.get(source) : undefined
  if (cachedMedia && context && context !== cachedMedia.ctx)
    devWarn(
      '[@theale/ethereal] this media element is already routed through another AudioContext — reusing that one, since createMediaElementSource is once-per-element for life',
    )
  const ctx = isNode ? (source.context as AudioContext) : (cachedMedia?.ctx ?? context ?? new AudioContext())
  const ownCtx = !isNode && !context && !cachedMedia
  // autoplay policy: contexts start suspended without a user gesture —
  // resume is a no-op when already running, and safe to fire-and-forget
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  // the analyser's own smoothing sits UNDER ours: a little here removes the
  // per-frame bin chatter that no envelope can fix, but pushing it higher
  // would fight the attack/release times above
  analyser.smoothingTimeConstant = 0.6
  let src: AudioNode
  // the node whose analyser hookup succeeded, so the failure path below knows
  // what to unhook — `src` itself may not have gotten that far
  let connectedSource: AudioNode | null = null
  try {
    if (isNode) {
      src = source
      src.connect(analyser)
      connectedSource = src
    } else if (isMedia) {
      const mediaSource = cachedMedia?.node ?? ctx.createMediaElementSource(source)
      if (!cachedMedia) mediaSources.set(source, { node: mediaSource, ctx })
      src = mediaSource
      src.connect(analyser)
      connectedSource = src
      // element audio now routes through the context — reconnect the speakers
      // or the page goes silent
      src.connect(ctx.destination)
    } else {
      src = ctx.createMediaStreamSource(source as MediaStream)
      src.connect(analyser)
      connectedSource = src
    }
  } catch (error) {
    // Graph construction is transactional. A rejected attach hands the caller
    // nothing to detach with, so it must leave nothing behind: unhook the
    // half-built graph and close the context if this call opened it. The one
    // exception is a media element that DID get bound above — that binding is
    // for life (see mediaSources), so its context has to survive the failure
    // for the element to ever play through it.
    try {
      connectedSource?.disconnect(analyser)
    } catch {
      /* the connect itself is what threw */
    }
    const mediaBound = isMedia && mediaSources.get(source)?.ctx === ctx
    if (ownCtx && !mediaBound) void ctx.close().catch(() => {})
    throw error
  }
  // negative depth would invert the effect's response to sound rather than
  // deepen it, which no caller means
  const settings: DriveSettings = {
    sensitivity: finiteAtLeast(sensitivity, 1),
    // above 1 the dip would rest the effect further below its tuned look than
    // the loudest moment lifts it above — sound would read as an interruption
    // of darkness rather than as light
    dip: finiteBetween(dip, 0, 1, 0),
    ranges: {
      glow: finiteAtLeast(ranges?.glow, 1),
      hotspot: finiteAtLeast(ranges?.hotspot, 1),
      bands: finiteAtLeast(ranges?.bands, 1),
    },
  }
  const stopDrive = driveHost(host, analyser, settings)
  let detached = false
  const detach = (() => {
    if (detached) return
    detached = true
    stopDrive()
    try {
      src.disconnect(analyser)
    } catch {
      /* already disconnected */
    }
    // media elements must keep their context (and destination hookup) alive;
    // closing it would mute the element forever
    if (ownCtx && !isMedia) void ctx.close().catch(() => {})
  }) as AudioAttachment
  detach.update = ({ sensitivity: nextSensitivity, dip: nextDip, ranges: nextRanges }) => {
    if (nextSensitivity !== undefined) settings.sensitivity = finiteAtLeast(nextSensitivity, settings.sensitivity)
    if (nextDip !== undefined) settings.dip = finiteBetween(nextDip, 0, 1, settings.dip)
    if (nextRanges) {
      const { ranges: current } = settings
      settings.ranges = {
        glow: finiteAtLeast(nextRanges.glow, current.glow),
        hotspot: finiteAtLeast(nextRanges.hotspot, current.hotspot),
        bands: finiteAtLeast(nextRanges.bands, current.bands),
      }
    }
  }
  return detach
}

/**
 * Convenience wrapper: microphone → attachAudio. Asks for permission only
 * when called; rejects if denied.
 *
 *   const stop = await attachMicAudio(hostEl, { sensitivity: 1 })
 *
 * Echo cancellation and noise suppression are requested because the common
 * case is a voice UI with speakers on: without them the effect reacts to its
 * own app's playback and feeds back into a permanent shimmer.
 */
export async function attachMicAudio(
  host: HTMLElement,
  { stream, ...opts }: AttachMicAudioOptions = {},
): Promise<AudioAttachment> {
  const own = !stream
  const micStream =
    stream ??
    (await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    }))
  // The attach itself can reject — a closed context handed down in `opts`, an
  // environment that refuses to build the graph. By then the stream is already
  // live, and without this guard nothing could ever stop it: the cleanup
  // wrapper below only exists on success, so the caller would see a rejection
  // while the mic indicator stayed lit. Stop what we opened, then re-throw.
  let inner: AudioAttachment
  try {
    inner = await attachAudio(host, micStream, opts)
  } catch (error) {
    if (own) micStream.getTracks().forEach((track) => track.stop())
    throw error
  }
  const detach = (() => {
    inner()
    if (own) micStream.getTracks().forEach((track) => track.stop())
  }) as AudioAttachment
  // depth retuning belongs to the drive, not to the stream — forward it
  detach.update = inner.update
  return detach
}

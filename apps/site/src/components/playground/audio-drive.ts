// Live audio for the playground.
//
// The package does the driving. `attachAudio` / `attachMicAudio` return an
// `AudioAttachment` — the detach function, plus `.update({ sensitivity,
// ranges })` which retunes a RUNNING drive without touching the audio graph.
// So the four AUDIO sliders talk straight to the real fx host: no probe
// element, no second rAF loop, and the drive rides the package's shared ticker
// (priority 1) instead of the display's native refresh rate.
//
// What is left here is the one thing the package deliberately does not do: the
// SOURCE outlives the attachment. The package writes to the element it was
// handed, and switching the preview shape (button / chat / card / pill) swaps
// that element out, so the playground has to detach and re-attach. Holding the
// microphone stream and the AudioContext in the session is what makes that
// re-attach free — no second permission prompt, no second AudioContext.
import { attachAudio, attachMicAudio } from "@theale/ethereal"

import type { AudioOptions } from "./presets"

/** The package doesn't export this name, but it is exactly what an attach
 *  resolves to: the detach function with `.update()` on the side. */
type AudioAttachment = Awaited<ReturnType<typeof attachAudio>>

/** what the package takes: one gain, then a per-target depth for each of the
 *  three things sound moves. The playground keeps its four sliders flat
 *  because they read as one group on screen. */
type DriveSettings = {
  sensitivity: number
  dip: number
  ranges: { glow: number; hotspot: number; bands: number }
}

const driveSettings = (options: AudioOptions): DriveSettings => ({
  sensitivity: options.sensitivity,
  dip: options.dip,
  ranges: { glow: options.glow, hotspot: options.hotspot, bands: options.bands },
})

/** How the session gets its live source onto a host element. Injected rather
 *  than branched on inside the session so both sources — and the tests — share
 *  one lifecycle. */
type AttachToHost = (host: HTMLElement, settings: DriveSettings) => Promise<AudioAttachment>

/** One running audio source, attachable to whichever element is currently on
 *  screen. Created already open: the microphone prompt (or the demo graph)
 *  happens in the `open…` call, not in `attachTo`. */
export type AudioSession = {
  /** Point the drive at `host`. Detaching the previous attachment is what
   *  clears our variables off the element we are leaving — the package resets
   *  the host it was given. Never rejects: a failed attach means the source
   *  itself is broken, so the session stops and releases it instead — callers
   *  fire-and-forget host switches, and a rejection would go unhandled.
   *  Resolves `false` exactly when the session is no longer running (it was
   *  already stopped, or this attach failed and stopped it) — the caller's
   *  cue to stop SHOWING the source as live. A stale attach that lost to a
   *  newer one resolves `true`: the winner owns the outcome. */
  attachTo: (host: HTMLElement) => Promise<boolean>
  /** Retune depth on the live drive. No re-attach, so the loudness envelope
   *  and the microphone permission both survive a slider drag. */
  retune: (options: AudioOptions) => void
  /** Detach and release the source (mic tracks, oscillators, AudioContext). */
  stop: () => void
}

export function createAudioSession(
  attach: AttachToHost,
  release: () => void,
  initialOptions: AudioOptions
): AudioSession {
  let attachment: AudioAttachment | null = null
  let settings = driveSettings(initialOptions)
  let stopped = false
  // an attach that resolves after a newer one started (or after stop) must
  // undo itself instead of leaving a second drive writing to the host
  let generation = 0
  const stop = () => {
    stopped = true
    generation++
    attachment?.()
    attachment = null
    release()
  }
  return {
    async attachTo(host) {
      if (stopped) return false
      const mine = ++generation
      attachment?.()
      attachment = null
      let next: AudioAttachment
      try {
        next = await attach(host, settings)
      } catch {
        // The attach failed, so nothing is driving `host` — and if this is
        // still the CURRENT attach, nothing ever will be: the source itself is
        // broken, and keeping it (a lit mic indicator over a dead drive) helps
        // nobody, so stop the whole session. A STALE rejection — a newer
        // attach or stop() won the race while we awaited — belongs to whoever
        // won, and stopping here would tear down their live attachment.
        //
        // Swallowed rather than re-thrown: host switches fire-and-forget this
        // promise, and the stop above is the whole remedy anyway.
        if (mine === generation) {
          stop()
          return false
        }
        return true
      }
      // `stop()` bumps the generation too, so this one check covers both
      // "a newer host won" and "the session was closed while we awaited"
      if (mine !== generation) {
        next()
        return !stopped
      }
      attachment = next
      return true
    },
    retune(options) {
      settings = driveSettings(options)
      attachment?.update(settings)
    },
    stop,
  }
}

/** The demo track: a 34-second excerpt of Beethoven's Symphony No. 1 played by
 *  the United States Marine Band — public domain as a composition AND as a
 *  recording (a US federal work), so it can ship with the site with no licence
 *  to honour. See public/audio/README.md.
 *
 *  It replaced a synthesized sawtooth-with-LFOs "assistant speaking" tone. The
 *  synth was silent and predictable, which made it useless for the thing this
 *  button exists to show: real music has a spectrum that moves between the
 *  bands and a dynamic range that makes the effect surge and fall back. The
 *  excerpt was picked for exactly that — it runs loud, drops to near silence,
 *  then hits a fortissimo. */
export const DEMO_AUDIO_SRC = "/audio/beethoven-symphony-1-mvt1.mp3"

/** Music through the speakers, and through the analyser. Unlike the mic this
 *  needs no permission, but it does need a user gesture: browsers reject
 *  `play()` otherwise, and the AudioContext starts suspended. Both are
 *  satisfied by the click that calls this. */
export async function openDemoAudio(options: AudioOptions): Promise<AudioSession> {
  const context = new AudioContext()
  const element = new Audio(DEMO_AUDIO_SRC)
  // a 34-second clip and an indefinite demo: loop rather than leave the user
  // wondering why the effect went still
  element.loop = true
  try {
    await element.play()
  } catch (error) {
    void context.close().catch(() => {})
    throw error
  }
  return createAudioSession(
    // our own context, because `createMediaElementSource` binds an element to
    // ONE context for life — the element has to outlive every attach, and so
    // therefore does its context
    (host, settings) => attachAudio(host, element, { ...settings, context }),
    () => {
      element.pause()
      // drop the source so the decoder releases the buffer; the element is
      // never reused (a re-opened demo builds a fresh one, since its old
      // context is closed below and an element cannot change context)
      element.removeAttribute("src")
      element.load()
      void context.close().catch(() => {})
    },
    options
  )
}

/** Microphone. The prompt happens here, once per session — `attachTo` reuses
 *  the stream, so re-attaching on a preview-shape switch never re-prompts. */
export async function openMicAudio(options: AudioOptions): Promise<AudioSession> {
  const context = new AudioContext()
  const stream = await navigator.mediaDevices
    .getUserMedia({
      // same constraints the package asks for: with speakers on, a voice UI
      // without echo cancellation reacts to its own playback
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    })
    .catch((error: unknown) => {
      void context.close().catch(() => {})
      throw error
    })
  return createAudioSession(
    (host, settings) => attachMicAudio(host, { ...settings, stream, context }),
    () => {
      stream.getTracks().forEach((track) => track.stop())
      void context.close().catch(() => {})
    },
    options
  )
}

// @vitest-environment jsdom
//
// These tests drive the REAL package. The playground no longer owns any of the
// audio arithmetic — `attachAudio` writes the variables itself and retunes a
// live drive through `attachment.update(...)` — so a test that restated that
// formula here would only prove the copy still matches the copy. What is
// genuinely the playground's is the SESSION lifecycle in audio-drive.ts, and
// the three behaviours below are the ones that would silently break it:
//
//   - a silent source must rest at exactly 1.0 at EVERY depth, or a page where
//     nobody is speaking lights up permanently
//   - switching the preview shape must keep driving the NEW host and leave the
//     old one clean, because the package writes to the element it was handed
//   - a slider must retune the running drive rather than re-attach, or every
//     tick of a drag re-prompts for the microphone
//
// The audio graph is faked (jsdom has no Web Audio) but only at the analyser
// boundary: everything above it — envelope, clamps, CSS writes, detach reset —
// is the package's own code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachAudio } from "@theale/ethereal"

import { createAudioSession } from "./audio-drive"
import { AUDIO_DEFAULTS } from "./presets"
import type { AudioOptions } from "./presets"

/** every variable the package's audio drive owns */
const DRIVEN_VARS = ["--aud", "--ahot", ...Array.from({ length: 8 }, (_unused, band) => `--fb${band}`)]

/** 128 is the zero crossing of the byte time-domain format, so a buffer of
 *  128s is literal silence; anything else is a signal at that amplitude. */
let sampleValue = 128
/** byte spectrum level fed to every bin */
let binLevel = 0

class FakeAnalyser {
  fftSize = 2048
  smoothingTimeConstant = 0
  get frequencyBinCount() {
    return this.fftSize / 2
  }
  getByteTimeDomainData(target: Uint8Array) {
    target.fill(sampleValue)
  }
  getByteFrequencyData(target: Uint8Array) {
    target.fill(binLevel)
  }
  connect() {}
  disconnect() {}
}

class FakeSourceNode {
  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  state = "running"
  destination = new FakeSourceNode()
  createAnalyser() {
    return new FakeAnalyser()
  }
  createMediaStreamSource() {
    return new FakeSourceNode()
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    return Promise.resolve()
  }
}

/** a MediaStream stand-in — the package only hands it to createMediaStreamSource */
const fakeStream = {} as MediaStream

function openSession(options: AudioOptions, context = new FakeAudioContext()) {
  return createAudioSession(
    (host, settings) => attachAudio(host, fakeStream, { ...settings, context: context as unknown as AudioContext }),
    () => {},
    options
  )
}

const readVar = (host: HTMLElement, name: string) => host.style.getPropertyValue(name)

/** The drive rides the package's shared ticker, which needs a couple of real
 *  frames before `dt` is non-zero. Poll rather than count frames so the wait
 *  is bounded by the condition, not by a guessed frame budget. */
async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`timed out waiting for ${label}`)
}

const LOUD = { sampleValue: 200, binLevel: 200 }

beforeEach(() => {
  sampleValue = 128
  binLevel = 0
  vi.stubGlobal("AudioContext", FakeAudioContext)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("the playground's audio session", () => {
  it("leaves a silent source resting at exactly 1, at every depth", async () => {
    for (const depth of [0, 0.5, 1, 3]) {
      const host = document.createElement("div")
      // dip included: a drive that spends half its swing downwards must STILL
      // rest at 1 on a silent source — that is the whole promise
      const session = openSession({
        sensitivity: depth,
        dip: Math.min(1, depth),
        glow: depth,
        hotspot: depth,
        bands: depth,
      })
      await session.attachTo(host)
      await waitFor(() => readVar(host, "--aud") !== "", "the drive to write its first frame")
      for (const name of DRIVEN_VARS) expect(readVar(host, name), `${name} at depth ${depth}`).toBe("1.000")
      session.stop()
    }
  })

  it("removes all ten variables on stop", async () => {
    const host = document.createElement("div")
    sampleValue = LOUD.sampleValue
    binLevel = LOUD.binLevel
    const session = openSession(AUDIO_DEFAULTS)
    await session.attachTo(host)
    await waitFor(() => Number(readVar(host, "--aud")) > 1, "the drive to react to sound")
    expect(DRIVEN_VARS.filter((name) => readVar(host, name) !== "")).toHaveLength(10)

    session.stop()
    for (const name of DRIVEN_VARS) expect(readVar(host, name), name).toBe("")
  })

  it("follows a preview-shape switch onto the new host and clears the old one", async () => {
    const firstHost = document.createElement("div")
    const secondHost = document.createElement("div")
    sampleValue = LOUD.sampleValue
    binLevel = LOUD.binLevel
    const session = openSession(AUDIO_DEFAULTS)

    await session.attachTo(firstHost)
    await waitFor(() => Number(readVar(firstHost, "--aud")) > 1, "the first host to be driven")

    await session.attachTo(secondHost)
    for (const name of DRIVEN_VARS) expect(readVar(firstHost, name), `${name} on the old host`).toBe("")
    await waitFor(() => Number(readVar(secondHost, "--aud")) > 1, "the second host to be driven")
    expect(DRIVEN_VARS.filter((name) => readVar(secondHost, name) !== "")).toHaveLength(10)

    session.stop()
  })

  it("retunes the running drive when a slider moves, without re-attaching", async () => {
    const host = document.createElement("div")
    sampleValue = LOUD.sampleValue
    binLevel = LOUD.binLevel
    let attaches = 0
    const context = new FakeAudioContext()
    const session = createAudioSession(
      (target, settings) => {
        attaches++
        return attachAudio(target, fakeStream, { ...settings, context: context as unknown as AudioContext })
      },
      () => {},
      AUDIO_DEFAULTS
    )

    await session.attachTo(host)
    await waitFor(() => Number(readVar(host, "--aud")) > 1, "the glow to react to sound")
    expect(Number(readVar(host, "--ahot"))).toBeGreaterThan(1)

    // pinning ONE target at rest while the others keep moving is the clearest
    // observable proof that the new depth reached the live drive
    session.retune({ ...AUDIO_DEFAULTS, glow: 0 })
    await waitFor(() => readVar(host, "--aud") === "1.000", "the glow to fall back to rest")
    expect(Number(readVar(host, "--ahot"))).toBeGreaterThan(1)
    expect(attaches).toBe(1)

    session.stop()
  })
})

/** what an attach resolves to — the detach function with `.update()` on the
 *  side — as a pair of inspectable mocks */
type Attachment = Awaited<ReturnType<typeof attachAudio>>
const fakeAttachment = () => Object.assign(vi.fn(), { update: vi.fn() })

/** an attach whose outcome the test decides later, for interleaving races */
function deferredAttach() {
  let resolveAttach!: (attachment: Attachment) => void
  let rejectAttach!: (reason: unknown) => void
  const promise = new Promise<Attachment>((resolve, reject) => {
    resolveAttach = resolve
    rejectAttach = reject
  })
  return { promise, resolveAttach, rejectAttach }
}

// A rejected attach resolves to nothing the session could later detach, so the
// session must not sit there half-open: the source (mic tracks, context) would
// stay live with no drive behind it and no way left to release it. And because
// host switches fire-and-forget `attachTo`, the rejection must be handled HERE
// — an unhandled rejection in a shape switch helps nobody.
describe("a rejected attach", () => {
  it("stops the session and releases the source instead of rejecting", async () => {
    const attach = vi.fn(() => Promise.reject(new Error("no source")))
    const release = vi.fn()
    const session = createAudioSession(attach, release, AUDIO_DEFAULTS)
    // resolves false — the caller's cue that nothing is driving the host
    await expect(session.attachTo(document.createElement("div"))).resolves.toBe(false)
    expect(release).toHaveBeenCalledTimes(1)
    // the session is stopped: a later switch must not resurrect the source
    await session.attachTo(document.createElement("div"))
    expect(attach).toHaveBeenCalledTimes(1)
  })

  it("tears the old attachment down when the host-switch re-attach fails", async () => {
    const firstAttachment = fakeAttachment()
    let attachCalls = 0
    const attach = vi.fn(() =>
      ++attachCalls === 1 ? Promise.resolve(firstAttachment as unknown as Attachment) : Promise.reject(new Error("mic died"))
    )
    const release = vi.fn()
    const session = createAudioSession(attach, release, AUDIO_DEFAULTS)
    await session.attachTo(document.createElement("div"))
    expect(release).not.toHaveBeenCalled()

    // the switch: the old attachment detaches up front, the new attach fails
    await session.attachTo(document.createElement("div"))
    expect(firstAttachment).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("ignores a stale rejection once a newer attach has won", async () => {
    const first = deferredAttach()
    const second = deferredAttach()
    const outcomes = [first, second]
    const attach = vi.fn(() => outcomes.shift()!.promise)
    const release = vi.fn()
    const session = createAudioSession(attach, release, AUDIO_DEFAULTS)

    // both attaches in flight; the newer one lands first and takes over
    const firstCall = session.attachTo(document.createElement("div"))
    const secondCall = session.attachTo(document.createElement("div"))
    const winner = fakeAttachment()
    second.resolveAttach(winner)
    await secondCall

    // ...then the superseded attach finally fails. That failure is the OLD
    // generation's — it must not stop the session or touch the live drive.
    first.rejectAttach(new Error("slow source finally failed"))
    await firstCall
    expect(release).not.toHaveBeenCalled()
    expect(winner).not.toHaveBeenCalled()

    session.stop()
    expect(winner).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("does not release twice when the rejection lands after stop()", async () => {
    const pending = deferredAttach()
    const attach = vi.fn(() => pending.promise)
    const release = vi.fn()
    const session = createAudioSession(attach, release, AUDIO_DEFAULTS)
    const call = session.attachTo(document.createElement("div"))
    session.stop()
    expect(release).toHaveBeenCalledTimes(1)
    pending.rejectAttach(new Error("late failure"))
    await call
    expect(release).toHaveBeenCalledTimes(1)
  })
})

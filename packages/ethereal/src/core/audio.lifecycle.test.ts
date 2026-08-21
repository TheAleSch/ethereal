// @vitest-environment jsdom
//
// The attach/drive/detach lifecycle, as opposed to the pure mapping in
// audio.test.ts. Two things here are worth a fake Web Audio graph: the paused
// hold (a frozen frame must not keep writing --aud), and media-element reuse —
// createMediaElementSource is once-per-element FOR LIFE, so a re-attach that
// built a second AudioContext connected a node across contexts and threw
// InvalidAccessError in the caller's face.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AudioModule = typeof import('./audio')
type Ticker = typeof import('./ticker')

class FakeNode {
  context: FakeAudioContext
  connections = new Set<FakeNode>()
  constructor(context: FakeAudioContext) {
    this.context = context
  }
  connect(target: FakeNode) {
    // the real rule, and the one the bug tripped over
    if (target.context !== this.context) throw new Error('InvalidAccessError: nodes are from different contexts')
    this.connections.add(target)
  }
  disconnect(target?: FakeNode) {
    if (target) this.connections.delete(target)
    else this.connections.clear()
  }
}

/** loud-ish steady tone, so one frame moves every variable off 1 */
class FakeAnalyser extends FakeNode {
  fftSize = 512
  smoothingTimeConstant = 0
  get frequencyBinCount() {
    return this.fftSize / 2
  }
  getByteTimeDomainData(target: Uint8Array) {
    for (let index = 0; index < target.length; index++) target[index] = 128 + Math.round(100 * Math.sin(index / 4))
  }
  getByteFrequencyData(target: Uint8Array) {
    target.fill(200)
  }
}

const claimedElements = new WeakSet<HTMLMediaElement>()

class FakeAudioContext {
  state = 'running'
  closed = false
  destination = new FakeNode(this)
  createAnalyser() {
    return new FakeAnalyser(this)
  }
  mediaSource: FakeNode | null = null
  createMediaElementSource(element: HTMLMediaElement) {
    // spec: an element belongs to exactly one context, forever
    if (claimedElements.has(element)) throw new Error('InvalidStateError: element already has a source node')
    claimedElements.add(element)
    this.mediaSource = new FakeNode(this)
    return this.mediaSource
  }
  createMediaStreamSource() {
    return new FakeNode(this)
  }
  async resume() {}
  async close() {
    this.closed = true
  }
}

const DRIVEN = ['--aud', '--ahot', ...Array.from({ length: 8 }, (_, band) => `--fb${band}`)]

let audio: AudioModule
let ticker: Ticker
let frame: (now: number) => void
let contexts: FakeAudioContext[]

beforeEach(async () => {
  vi.resetModules()
  contexts = []
  let pending: ((now: number) => void) | null = null
  const globals = globalThis as Record<string, unknown>
  globals.requestAnimationFrame = (callback: (now: number) => void) => {
    pending = callback
    return 1
  }
  globals.cancelAnimationFrame = () => {
    pending = null
  }
  frame = (now: number) => {
    const callback = pending
    pending = null
    callback?.(now)
  }
  globals.AudioNode = FakeNode
  globals.AudioContext = class extends FakeAudioContext {
    constructor() {
      super()
      contexts.push(this)
    }
  }
  // audio.ts and this test must see the SAME ticker module instance
  ticker = await import('./ticker')
  audio = await import('./audio')
})

const host = () => document.createElement('div')
// nothing here is a real MediaStream: attachAudio only forwards it to
// createMediaStreamSource, which is ours
const fakeStream = () => ({}) as MediaStream

const silentContext = () => {
  const silent = new FakeAudioContext()
  vi.spyOn(silent, 'createAnalyser').mockImplementation(() => {
    const analyser = new FakeAnalyser(silent)
    analyser.getByteTimeDomainData = (target: Uint8Array) => target.fill(128)
    analyser.getByteFrequencyData = (target: Uint8Array) => target.fill(0)
    return analyser
  })
  return silent
}

describe('attachAudio + driveHost', () => {
  it('drives every variable it owns from a live analyser', async () => {
    const element = host()
    const detach = await audio.attachAudio(element, fakeStream())
    frame(100)
    frame(1100)
    for (const name of DRIVEN) expect(element.style.getPropertyValue(name)).not.toBe('')
    expect(Number(element.style.getPropertyValue('--aud'))).toBeGreaterThan(1)
    detach()
  })

  it('holds every value still while the ticker is paused', async () => {
    const element = host()
    const detach = await audio.attachAudio(element, fakeStream())
    frame(100)
    frame(1100)
    const held = DRIVEN.map((name) => element.style.getPropertyValue(name))
    ticker.setPaused(true)
    frame(2100)
    frame(3100)
    expect(DRIVEN.map((name) => element.style.getPropertyValue(name))).toEqual(held)
    ticker.setPaused(false)
    detach()
  })

  it('rests at 1 in silence, so an attached host renders as configured', async () => {
    const element = host()
    const silent = silentContext()
    const detach = await audio.attachAudio(element, fakeStream(), {
      context: silent as unknown as AudioContext,
    })
    frame(100)
    frame(1100)
    expect(element.style.getPropertyValue('--aud')).toBe('1.000')
    for (let band = 0; band < 8; band++) expect(element.style.getPropertyValue(`--fb${band}`)).toBe('1.000')
    detach()
  })

  it('falls back from non-finite initial depths instead of writing NaN CSS variables', async () => {
    const element = host()
    const detach = await audio.attachAudio(element, fakeStream(), {
      sensitivity: Infinity,
      dip: Number.NaN,
      ranges: {
        glow: Number.NaN,
        hotspot: Infinity,
        bands: Number.NEGATIVE_INFINITY,
      },
      context: silentContext() as unknown as AudioContext,
    })
    frame(100)
    frame(1100)
    for (const name of DRIVEN) expect(element.style.getPropertyValue(name), name).toBe('1.000')
    detach()
  })

  it('keeps valid live depths when an update contains NaN or Infinity', async () => {
    const element = host()
    const detach = await audio.attachAudio(element, fakeStream(), {
      context: silentContext() as unknown as AudioContext,
    })
    frame(100)
    frame(1100)
    detach.update({
      sensitivity: Number.NaN,
      dip: Infinity,
      ranges: {
        glow: Infinity,
        hotspot: Number.NaN,
        bands: Number.NEGATIVE_INFINITY,
      },
    })
    frame(2100)
    for (const name of DRIVEN) expect(element.style.getPropertyValue(name), name).toBe('1.000')
    detach()
  })

  it('removes every variable on detach and stops driving', async () => {
    const element = host()
    const detach = await audio.attachAudio(element, fakeStream())
    frame(100)
    frame(1100)
    detach()
    for (const name of DRIVEN) expect(element.style.getPropertyValue(name)).toBe('')
    frame(2100)
    for (const name of DRIVEN) expect(element.style.getPropertyValue(name)).toBe('')
  })

  it('is idempotent — a second detach is a no-op', async () => {
    const detach = await audio.attachAudio(host(), fakeStream())
    detach()
    expect(() => detach()).not.toThrow()
  })

  it('leaves an AudioNode source its own context on detach', async () => {
    const owned = new FakeAudioContext()
    const source = new FakeNode(owned)
    const detach = await audio.attachAudio(host(), source as unknown as AudioNode)
    detach()
    expect(owned.closed).toBe(false)
    expect(contexts).toHaveLength(0) // never made one of its own
  })
})

describe('media element sources', () => {
  it('survives attach → detach → attach on the same element', async () => {
    const element = host()
    const media = document.createElement('audio')
    const detach = await audio.attachAudio(element, media)
    detach()
    // used to throw InvalidAccessError: the cached source node belonged to the
    // first context, the analyser to a freshly-created second one
    const again = await audio.attachAudio(element, media)
    frame(100)
    frame(1100)
    expect(element.style.getPropertyValue('--aud')).not.toBe('')
    // one context for the element's whole life, and it stays open so the
    // element keeps playing through it
    expect(contexts).toHaveLength(1)
    expect(contexts[0]!.closed).toBe(false)
    again()
  })

  it('keeps the element routed to the speakers on every attach', async () => {
    const media = document.createElement('audio')
    const detach = await audio.attachAudio(host(), media)
    const context = contexts[0]!
    expect(context.mediaSource!.connections.has(context.destination)).toBe(true)
    detach()
    // detach drops the analyser only — cutting the destination would mute the
    // element for good
    expect(context.mediaSource!.connections.has(context.destination)).toBe(true)
    const again = await audio.attachAudio(host(), media)
    expect(context.mediaSource!.connections.has(context.destination)).toBe(true)
    again()
  })

  it('warns and reuses the original context when handed a different one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const media = document.createElement('audio')
    const detach = await audio.attachAudio(host(), media)
    detach()
    const other = new FakeAudioContext()
    const again = await audio.attachAudio(host(), media, {
      context: other as unknown as AudioContext,
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(other.destination.connections.size).toBe(0)
    again()
    warn.mockRestore()
  })
})

// A rejected attach resolves to NOBODY: the detach function the caller would
// have used to release everything never exists. So the attach itself must put
// back whatever it acquired before re-throwing — most visibly the microphone,
// whose recording indicator stays lit as long as a track is live.
describe('rejected attaches leak nothing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** a stream whose tracks record whether they were stopped */
  const streamWithTracks = () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
    return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks }
  }

  const stubGetUserMedia = (stream: MediaStream) => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
  }

  const failGraphConstruction = () =>
    vi.spyOn(FakeAudioContext.prototype, 'createMediaStreamSource').mockImplementation(() => {
      throw new Error('graph construction failed')
    })

  it('closes the context it created when graph construction throws', async () => {
    failGraphConstruction()
    await expect(audio.attachAudio(host(), fakeStream())).rejects.toThrow('graph construction failed')
    expect(contexts).toHaveLength(1)
    expect(contexts[0]!.closed).toBe(true)
  })

  it('leaves a caller-provided context open when graph construction throws', async () => {
    failGraphConstruction()
    const provided = new FakeAudioContext()
    await expect(
      audio.attachAudio(host(), fakeStream(), { context: provided as unknown as AudioContext }),
    ).rejects.toThrow('graph construction failed')
    expect(provided.closed).toBe(false)
  })

  it('closes its own context when the media element cannot be wired at all', async () => {
    vi.spyOn(FakeAudioContext.prototype, 'createMediaElementSource').mockImplementation(() => {
      throw new Error('no media source for this element')
    })
    await expect(audio.attachAudio(host(), document.createElement('audio'))).rejects.toThrow(
      'no media source for this element',
    )
    // the element never got bound, so the context is only ours — close it
    expect(contexts).toHaveLength(1)
    expect(contexts[0]!.closed).toBe(true)
  })

  it('unhooks a half-built media graph but keeps the now-bound context open', async () => {
    // the source node binds (once, for life) and reaches the analyser, then
    // the speaker hookup fails — the worst point to die at
    vi.spyOn(FakeAudioContext.prototype, 'createMediaElementSource').mockImplementation(function (
      this: FakeAudioContext,
      element: HTMLMediaElement,
    ) {
      claimedElements.add(element)
      const node = new FakeNode(this)
      const realConnect = node.connect.bind(node)
      node.connect = (target: FakeNode) => {
        if (target === this.destination) throw new Error('destination refused the connection')
        realConnect(target)
      }
      this.mediaSource = node
      return node
    })
    await expect(audio.attachAudio(host(), document.createElement('audio'))).rejects.toThrow(
      'destination refused the connection',
    )
    expect(contexts).toHaveLength(1)
    // the analyser hookup was rolled back...
    expect(contexts[0]!.mediaSource!.connections.size).toBe(0)
    // ...but the element is bound to this context for life, so it stays open
    expect(contexts[0]!.closed).toBe(false)
  })

  it('stops the mic tracks it opened when the graph attach rejects', async () => {
    const { stream, tracks } = streamWithTracks()
    stubGetUserMedia(stream)
    failGraphConstruction()
    await expect(audio.attachMicAudio(host())).rejects.toThrow('graph construction failed')
    for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1)
    // the context the inner attach created goes with them
    expect(contexts).toHaveLength(1)
    expect(contexts[0]!.closed).toBe(true)
  })

  it('leaves a caller-provided stream running when the attach rejects', async () => {
    const { stream, tracks } = streamWithTracks()
    failGraphConstruction()
    await expect(audio.attachMicAudio(host(), { stream })).rejects.toThrow('graph construction failed')
    for (const track of tracks) expect(track.stop).not.toHaveBeenCalled()
  })
})

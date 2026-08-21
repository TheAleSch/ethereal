// The shared loop's contracts are invisible in a screenshot and load-bearing
// everywhere: priority ordering is the only reason a late subscriber's writes
// survive the effects' own writes in the same frame, and pause-by-dt-0 is the
// only reason a frozen frame resumes without teleporting. Each test imports a
// FRESH ticker module, because the subscriber list and rAF handle are module
// state.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Ticker = typeof import('./ticker')

/** A controllable rAF: `frame(ms)` runs exactly one loop iteration at that
 *  timestamp, so tests drive the clock instead of waiting for one. */
function fakeRaf() {
  let pending: ((now: number) => void) | null = null
  let cancelled = 0
  const globals = globalThis as Record<string, unknown>
  globals.requestAnimationFrame = (callback: (now: number) => void) => {
    pending = callback
    return 1
  }
  globals.cancelAnimationFrame = () => {
    pending = null
    cancelled++
  }
  return {
    frame(now: number) {
      const callback = pending
      pending = null
      callback?.(now)
    },
    get scheduled() {
      return pending !== null
    },
    get cancels() {
      return cancelled
    },
  }
}

let raf: ReturnType<typeof fakeRaf>
let ticker: Ticker

beforeEach(async () => {
  vi.resetModules()
  raf = fakeRaf()
  ticker = await import('./ticker')
})

describe('subscribe', () => {
  it('runs low priorities first, whatever the subscription order', () => {
    const order: string[] = []
    ticker.subscribe(() => order.push('overwriter'), 1)
    ticker.subscribe(() => order.push('effect'), 0)
    ticker.subscribe(() => order.push('late-effect'), 0)
    raf.frame(100)
    // the higher priority runs LAST: its writes must overwrite the effect's own
    // oscillators inside the same frame, not the other way round
    expect(order).toEqual(['effect', 'late-effect', 'overwriter'])
  })

  it('keeps insertion order within one priority', () => {
    const order: number[] = []
    for (const index of [0, 1, 2]) ticker.subscribe(() => order.push(index), 0)
    raf.frame(100)
    expect(order).toEqual([0, 1, 2])
  })

  it('starts the loop with the first subscriber and cancels it with the last', () => {
    expect(raf.scheduled).toBe(false)
    const stopFirst = ticker.subscribe(() => {})
    const stopSecond = ticker.subscribe(() => {})
    raf.frame(100)
    expect(raf.scheduled).toBe(true)
    stopFirst()
    expect(raf.cancels).toBe(0)
    stopSecond()
    expect(raf.cancels).toBe(1)
  })

  it('stops calling a subscriber after it unsubscribes', () => {
    const tick = vi.fn()
    const keepAlive = ticker.subscribe(() => {})
    const stop = ticker.subscribe(tick)
    raf.frame(100)
    raf.frame(1100)
    expect(tick).toHaveBeenCalledTimes(2)
    stop()
    raf.frame(2100)
    expect(tick).toHaveBeenCalledTimes(2)
    keepAlive()
  })

  it('still ticks the next subscriber when one unsubscribes itself mid-frame', () => {
    // splicing the live array during iteration shifted the next entry onto
    // the visited index and skipped it for that frame
    const after = vi.fn()
    let stopSelf: () => void = () => {}
    stopSelf = ticker.subscribe(() => stopSelf())
    const stopAfter = ticker.subscribe(after)
    raf.frame(100)
    expect(after).toHaveBeenCalledTimes(1)
    stopAfter()
  })
})

describe('dt', () => {
  it('is 0 on the first frame and wall-clock seconds after it', () => {
    const seen: number[] = []
    ticker.subscribe((_now, dt) => seen.push(dt))
    raf.frame(100)
    raf.frame(1100)
    raf.frame(1116)
    expect(seen[0]).toBe(0)
    expect(seen[1]).toBe(0.1) // a 1s gap, clamped
    expect(seen[2]).toBeCloseTo(0.016, 5)
  })

  it('clamps a huge gap so a backgrounded tab does not teleport every clock', () => {
    const seen: number[] = []
    ticker.subscribe((_now, dt) => seen.push(dt))
    raf.frame(100)
    raf.frame(30_000) // 30s in a background tab
    expect(seen[1]).toBe(0.1)
  })

  it('passes `now` in seconds', () => {
    const seen: number[] = []
    ticker.subscribe((now) => seen.push(now))
    raf.frame(100)
    raf.frame(2600)
    expect(seen).toEqual([0.1, 2.6])
  })
})

describe('setPaused', () => {
  it('keeps ticking with dt 0 — every clock holds, `now` keeps advancing', () => {
    const frames: [number, number][] = []
    ticker.subscribe((now, dt) => frames.push([now, dt]))
    raf.frame(100)
    raf.frame(1100)
    ticker.setPaused(true)
    raf.frame(2100)
    raf.frame(3100)
    expect(ticker.isPaused()).toBe(true)
    expect(frames.slice(2)).toEqual([
      [2.1, 0],
      [3.1, 0],
    ])
    ticker.setPaused(false)
  })

  it('resumes without a jump for the paused duration', () => {
    const seen: number[] = []
    ticker.subscribe((_now, dt) => seen.push(dt))
    raf.frame(100)
    ticker.setPaused(true)
    raf.frame(5100)
    ticker.setPaused(false)
    raf.frame(5116)
    // 16ms since the last frame, not the 5s the pause lasted
    expect(seen[seen.length - 1]).toBeCloseTo(0.016, 5)
    ticker.setPaused(false)
  })
})

describe('setTickRate', () => {
  it('drops frames that arrive faster than the target rate', () => {
    const tick = vi.fn()
    ticker.setTickRate(30)
    ticker.subscribe(tick)
    raf.frame(100)
    raf.frame(116) // too early for 30fps
    raf.frame(134)
    expect(tick).toHaveBeenCalledTimes(2)
    ticker.setTickRate(60)
  })

  it('ticks on every rAF frame at rate 0', () => {
    const tick = vi.fn()
    ticker.setTickRate(0)
    ticker.subscribe(tick)
    raf.frame(1)
    raf.frame(2)
    raf.frame(3)
    expect(tick).toHaveBeenCalledTimes(3)
    expect(ticker.getTickRate()).toBe(0)
    ticker.setTickRate(60)
  })
})

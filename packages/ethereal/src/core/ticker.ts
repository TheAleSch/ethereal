// One module-level ~60fps rAF loop drives every mounted instance of every
// effect. Subscribers get (now, dt); the loop starts with the first
// subscriber and stops with the last — zero cost when nothing is mounted.
type TickFn = (nowSec: number, dt: number) => void

// Frame budget: the gate in loop() drops rAF callbacks that arrive early, so
// a 120Hz display still ticks at the target rate instead of double. The 2ms
// slack absorbs rAF jitter — without it a 16.67ms frame misses a 16.67ms
// deadline by rounding and every other frame gets dropped.
//
// Cost scales with painted area, not instance count: every tick writes CSS
// custom props, and the browser then repaints layered radial-gradients under
// blurred masks. A hero-size effect can be smoother at a rock-solid 30 than
// at a 60 it cannot hold — hence setTickRate.
const SLACK = 2
let minInterval = 1000 / 60 - SLACK

let rate = 60

/** Set the shared loop's target frame rate (default 60). Pass 0 to tick on
 *  every rAF frame, i.e. at the display's native refresh rate. Takes effect
 *  on the next frame; animation speed is unaffected either way, since every
 *  effect integrates against the wall-clock `dt` rather than counting
 *  frames.
 *
 *  This is a single process-wide setting, not per-instance: every mounted
 *  effect shares one loop, so the last caller wins. Pair with getTickRate if
 *  a component needs to restore the previous value on unmount. */
export function setTickRate(fps: number): void {
  rate = fps > 0 ? fps : 0
  minInterval = fps > 0 ? Math.max(0, 1000 / fps - SLACK) : 0
}

/** The current target frame rate; 0 means "every rAF frame". */
export function getTickRate(): number {
  return rate
}

// priority orders execution per frame (ascending). Effects tick at 0; the
// audio drive subscribes at 1 so its --aud/--fb writes always land AFTER the
// effect's idle oscillators — insertion order alone breaks when the effect
// re-subscribes (last unmount → remount) while audio stays attached.
const subs: { fn: TickFn; pri: number }[] = []
let paused = false
let raf = 0
let last = 0
let prevNow = 0

function loop(now: number) {
  raf = requestAnimationFrame(loop)
  if (now - last < minInterval) return
  // Paused holds every clock still rather than stopping the loop: subscribers
  // integrate against dt, so simply not calling them would freeze the frame
  // AND make the next unpaused frame jump by the whole paused duration. Ticking
  // with dt = 0 keeps `now` advancing while no clock moves, so resuming is
  // seamless. Cheap enough that gating the rAF too would not pay for itself.
  if (paused) {
    prevNow = now
    last = now
    // iterate a snapshot — a subscriber unsubscribing (itself or a peer)
    // mid-frame splices the live array and would shift the next entry onto
    // the index just visited, skipping it for this frame
    for (const sub of [...subs]) sub.fn(now / 1000, 0)
    return
  }
  // dt clamped: after a background-tab pause rAF resumes with a huge gap —
  // an unclamped dt would teleport every animation clock forward
  const dt = prevNow ? Math.min(0.1, (now - prevNow) / 1000) : 0
  prevNow = now
  last = now
  // snapshot for the same reason as the paused branch above
  for (const sub of [...subs]) sub.fn(now / 1000, dt)
}

/** Hold every animation clock still without unmounting anything. Intended for
 *  tools that let you inspect or tune a configuration frozen mid-flight; it is
 *  process-wide, like `setTickRate`, because the loop is. */
export function setPaused(next: boolean): void {
  paused = next
}

export function isPaused(): boolean {
  return paused
}

export function subscribe(fn: TickFn, priority = 0): () => void {
  const entry = { fn, pri: priority }
  const at = subs.findIndex((sub) => sub.pri > priority)
  if (at === -1) subs.push(entry)
  else subs.splice(at, 0, entry)
  if (subs.length === 1) {
    prevNow = 0
    last = 0
    raf = requestAnimationFrame(loop)
  }
  return () => {
    const index = subs.indexOf(entry)
    if (index !== -1) subs.splice(index, 1)
    if (!subs.length && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
}

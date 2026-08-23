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

// priority orders execution per frame (ascending). Effects tick at 0; a
// subscriber that must overwrite what they wrote takes a higher priority so
// its writes always land AFTER the effect's own oscillators — insertion order
// alone breaks when the effect re-subscribes (last unmount → remount) while
// the other subscriber stays put.
const subs: { fn: TickFn; pri: number }[] = []
let paused = false
let raf = 0
let last = 0
let prevNow = 0
let lastRafNow = 0

function loop(now: number) {
  raf = requestAnimationFrame(loop)
  const frameGap = lastRafNow ? now - lastRafNow : 0
  lastRafNow = now
  if (now - last < minInterval) return
  // Paused holds every clock still without asking renderers to recompute and
  // rewrite the same frame. Advancing both timestamps prevents a resume jump.
  if (paused) {
    prevNow = now
    last = now
    return
  }
  // Deliberately gated frames must deliver the full accumulated elapsed time,
  // including target rates below 10fps. A genuine rAF suspension is detected
  // independently from the target interval and remains capped on resume.
  const suspendThreshold = Math.max(250, (rate > 0 ? 1000 / rate : 1000 / 60) * 2.5)
  const elapsed = prevNow ? (now - prevNow) / 1000 : 0
  const dt = frameGap > suspendThreshold ? Math.min(0.1, elapsed) : elapsed
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
    lastRafNow = 0
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

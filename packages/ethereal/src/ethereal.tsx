// Ethereal — travelling-light effect. Put <Ethereal/> inside an element that
// has position:relative + isolation:isolate (no overflow-hidden needed — the
// effect wrapper manages its own clipping). One shared ~60fps rAF drives all
// mounted instances of every effect in this package.
'use client'
import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { THINKING, lift, scaleDuration, tightenPulse } from './core/derive'
import { getLUT, pathPx, quantAspect, rand, randEdgePos, walkRect, walkSmooth, type LUT } from './core/path'
import { boundedPalette, finiteNumber, runtimeConfigSignature } from './core/normalize'
import { mergeConfig, useInteraction, type StateConfig, type ThemeConfig } from './core/state'
import { subscribe } from './core/ticker'
import { useReducedMotion, useTheme, type Theme } from './core/theme'
import {
  EASE,
  HEADS,
  Head,
  TravelEase,
  checkHost,
  claimHost,
  holePath,
  nextPhase,
  p3t,
  pos,
  radiusPx,
  rotHDir,
  rotWDir,
  smoothstep,
  trap,
  trip,
} from './core/util'

export type { Theme }

export type EtherealCfg = {
  colors: string[]
  path: 'bottom' | 'around' | 'breathe' | 'static'
  heads: 1 | 2
  spin: 'same' | 'counter'
  place: 'internal' | 'external' | 'ext-border' | 'both'
  // 'boost-speed' combines both hover reactions in one mode
  hover: 'none' | 'boost' | 'speed' | 'boost-speed' | 'reveal'
  hoverAmount: number
  hoverEase: number
  duration: number
  repeatDelay: number
  spotShape: 'adaptive' | 'round'
  // round only: circles composing an elongated spot (0 = auto from W/H ratio)
  spotSamples: number
  spotW: number
  spotH: number
  /** comet-tail length multiplier (round/adaptive chain spacing) */
  trail: number
  /** leading trail — chain extends AHEAD of the head too (0 = none, 1 =
   * as long as the tail) */
  lead: number
  /** how strongly trail circles shrink and dim, 0..1 */
  trailFade: number
  strokeWidth: number
  blendSoftness: number
  spotBlur: number
  spotOffset: number
  hotspots: number
  hotSpread: number
  reveal: number
  travelEase: TravelEase
  breatheAmp: number
  /** the glow's off-border height breathes between these multipliers of its
   *  spotH-scaled paint height (travel paths; 'breathe' keeps breatheAmp) */
  heightMin: number
  heightMax: number
  flicker: number
  wander: number
  pulseMin: number
  pulseMax: number
  needles: number
  needleHeight: number
  needleJitter: boolean
  glowBlur: number
  strokeOpacity: number
  innerOpacity: number
  bloomOpacity: number
  strength: number
  saturation: number
  brightness: number
  hueRange: number
  gamut: 'srgb' | 'p3'
}

export const ETHEREAL: EtherealCfg = {
  colors: [
    'rgb(255,50,100)',
    'rgb(40,180,220)',
    'rgb(50,200,80)',
    'rgb(180,40,240)',
    'rgb(255,160,30)',
    'rgb(100,70,255)',
    'rgb(40,140,255)',
    'rgb(240,50,180)',
    'rgb(30,185,170)',
  ],
  path: 'bottom',
  heads: 1,
  spin: 'same',
  place: 'internal',
  hover: 'none',
  hoverAmount: 1,
  hoverEase: 8,
  duration: 3.1,
  repeatDelay: 0,
  spotShape: 'round',
  spotSamples: 0,
  spotW: 78,
  spotH: 60,
  trail: 1,
  lead: 0,
  trailFade: 0.45,
  strokeWidth: 1,
  blendSoftness: 0.5,
  spotBlur: 0,
  spotOffset: 0,
  hotspots: 1,
  hotSpread: 22,
  reveal: 1,
  travelEase: 'linear',
  breatheAmp: 0.25,
  heightMin: 0.8,
  heightMax: 1.3,
  flicker: 0,
  wander: 0,
  pulseMin: 0.8,
  pulseMax: 1.4,
  needles: 7,
  needleHeight: 1,
  needleJitter: false,
  glowBlur: 8,
  strokeOpacity: 1.14,
  innerOpacity: 0.7,
  bloomOpacity: 0.8,
  strength: 1,
  saturation: 1,
  brightness: 1,
  hueRange: 13,
  gamut: 'srgb',
}

/** Visibility envelope for a bottom sweep. The head still crosses the path at
 * the configured duration; only the hidden wraparound interval is shortened. */
export const bottomSweepEnvelope = (travel: number) =>
  trap(travel, 0.0625, 0.2625, 0.7375, 0.9375)

/* states -------------------------------------------------------------------
   The registry of state NAMES, plus anything the derivation rule below cannot
   work out on its own. Both entries are empty today: `thinking` is derived
   from whatever config you gave, so it varies your look instead of replacing
   it. The keys still have to exist — they are what `resolveState` recognises,
   and an unlisted name warns.

   An entry here (or in a caller's `states` prop) OVERRIDES the derived
   variation key by key, which is the escape hatch for a preset the rule reads
   wrongly. Each state can also carry per-theme `whileHover` / `whilePressed`
   overlays. Shape and merge order live in ./core/state. */
export const ETHEREAL_STATES: Record<'idle' | 'thinking', StateConfig<EtherealCfg>> = {
  idle: {},
  thinking: {},
}

/** Derive `thinking` from the caller's own config.
 *
 *  What it deliberately does NOT touch: `colors`, `path`, `place`, `heads`,
 *  `spin`, the spot geometry. Those are the identity of a preset — a config
 *  with `path: 'around'` and a red palette must still come back as a red comet
 *  going around, or the state has swapped the effect out rather than varied
 *  it. Everything it does touch is read off the incoming value first. */
export function deriveEtherealState(cfg: EtherealCfg, state: string): Partial<EtherealCfg> {
  if (state === 'thinking')
    return {
      // quicker, more restless: the component is working
      duration: scaleDuration(cfg.duration, THINKING.durationScale),
      wander: lift(cfg.wander, THINKING.restlessness),
      flicker: lift(cfg.flicker, THINKING.restlessness * 0.7),
      // only bites on the `breathe` path, where it scatters the needles around
      // all four edges — harmless and inert everywhere else
      needleJitter: true,
      // tighter swing: quick and jittery reads as busy, quick and heaving
      // reads as agitated
      ...tightenPulse(cfg, THINKING.pulseTighten),
      // busy, not interactive — and a `reveal` preset must be VISIBLE while it
      // is thinking, which only happens once reveal is off
      hover: 'none',
    }
  return {}
}

export type EtherealState = keyof typeof ETHEREAL_STATES | (string & {})

export type EtherealProps = Partial<EtherealCfg> & {
  /** named state to apply (built-in ETHEREAL_STATES or a key of `states`).
   *  `null` suppresses state resolution entirely (used by the playground to
   *  pin a resolved interaction slot into the preview without `resolveState`
   *  re-deriving it from the real, possibly-irrelevant pointer state). */
  state?: EtherealState | null
  /** custom/overriding state configs with light/dark variants */
  states?: Record<string, StateConfig<EtherealCfg>>
  /** per-theme base config — merged over your flat props, under any named
   *  state. The only way to give light and dark different values. */
  themes?: ThemeConfig<EtherealCfg>
  /** merged while the host is hovered (mouse only), with or without a named
   *  state — the state's own whileHover still wins when one is active */
  whileHover?: Partial<EtherealCfg>
  /** merged while the host is pressed — pointer or keyboard, held ~600ms so
   *  a quick click still reads as a pulse */
  whilePressed?: Partial<EtherealCfg>
  /** fade-in duration for rebuilt layers when config/state changes; 0 disables */
  transitionMs?: number
  /** explicit theme: 'light' | 'dark'. if omitted, auto-detects from DOM */
  theme?: Theme
  /** custom theme detector function. receives host element, returns theme */
  themeDetector?: (host: HTMLElement | null) => Theme
}

/* shared driver ------------------------------------------------------------ */
type HostRec = {
  el: HTMLElement
  cfg: EtherealCfg
  phase: number
  hovT: number
  hovC: number
  clk: number
  // layout metrics cached by ResizeObserver — the per-frame loop never
  // touches offsetWidth/offsetHeight
  aspect: number
  hPx: number
  // IntersectionObserver flag: off-screen hosts skip all per-frame work
  visible: boolean
  lut: LUT
  needleLayers?: { el: HTMLElement; inset: number }[]
  needleCyc?: number
  needleBG?: (inset: number, seed?: number) => string
}
type DriverState = Pick<HostRec, 'phase' | 'hovT' | 'hovC' | 'clk'>
const hostsSet = new Set<HostRec>()
let unsub: (() => void) | null = null

// shared spot-chain layout (round shape): sample count + px offsets — used
// by both the layer builder and the per-frame driver so they always agree
const spotChainOf = (cfg: EtherealCfg) => {
  const longDim = Math.max(cfg.spotW, cfg.spotH),
    shortDim = Math.min(cfg.spotW, cfg.spotH) || 1
  // both shapes use a DENSE chain: heavily overlapping circles read as one
  // smooth capsule that bends through corners — an axis-aligned ellipse (or
  // a sparse chain of visible dots) can't do that. Circles TRAIL BEHIND the
  // head (comet tail), never fan symmetrically — symmetric offsets read as
  // detached blobs around the head instead of a trail
  const trailMul = Number.isFinite(cfg.trail) ? Math.min(4, Math.max(0.2, cfg.trail)) : 1
  const leadMul = Number.isFinite(cfg.lead) ? Math.min(2, Math.max(0, cfg.lead)) : 0
  // Math.round FIRST, then decide explicit-vs-auto: a fractional value like
  // spotSamples 0.1 is truthy but rounds to zero, and an explicit branch
  // taken on the raw value would build an EMPTY chain — no spotlight at all
  const explicitSamples = Math.round(cfg.spotSamples)
  const tailCount =
    explicitSamples > 0
      ? explicitSamples
      : Math.min(9, Math.max(1, Math.round((2 * longDim * trailMul) / shortDim) - 1))
  const step = tailCount > 1 ? ((longDim - shortDim) * trailMul) / (tailCount - 1) : 0
  const offs = Array.from({ length: tailCount }, (_, rank) => -rank * step)
  // leading circles mirror the tail spacing ahead of the head
  const leadCount = Math.min(4, Math.round((tailCount - 1) * leadMul))
  for (let rank = 1; rank <= leadCount; rank++) offs.push(rank * step)
  // sorted by |offset| so rank-based size/opacity decay applies to BOTH
  // directions (head first, farthest circles last)
  offs.sort((a, b) => Math.abs(a) - Math.abs(b))
  return { count: offs.length, offs }
}

function tickAll(nowSec: number, dt: number) {
  hostsSet.forEach((rec) => {
    if (!rec.visible) return
    const { el, cfg, phase } = rec
    const duration = Math.max(0.1, cfg.duration)
    const repeatDelay = Math.max(0, cfg.repeatDelay)
    // smoothed hover; speed mode warps a per-instance clock (no time jump)
    rec.hovC += (rec.hovT - rec.hovC) * Math.min(1, dt * cfg.hoverEase)
    const hovSpeed = cfg.hover === 'speed' || cfg.hover === 'boost-speed'
    const hovBoost = cfg.hover === 'boost' || cfg.hover === 'boost-speed'
    rec.clk = (rec.clk || nowSec) + dt * (hovSpeed ? 1 + 1.5 * cfg.hoverAmount * rec.hovC : 1)
    // golden-ratio stagger per instance — buttons never run in sync
    const time = rec.clk + phase * duration
    const cycleTime = duration + repeatDelay
    const cycleT = time % cycleTime
    const active = cycleT < duration
    let progress = active ? cycleT / duration : 1
    // wander: a slow sine warps the head's progress — hesitates and hurries.
    // Only while active: during the repeatDelay gap the head is parked at the
    // endpoint and must not keep moving.
    if (cfg.wander && active)
      progress = (((progress + 0.1 * cfg.wander * Math.sin((2 * Math.PI * time) / (duration * 2.6))) % 1) + 1) % 1
    // repeatDelay is a documented DEAD interval: the whole effect rests dark
    // between cycles. Short smoothstep shoulders on both ends of the gap keep
    // the exit/return from popping.
    let gapRamp = 1
    if (repeatDelay > 0 && !active) {
      const gapT = cycleT - duration
      const shoulder = Math.min(0.35, repeatDelay / 2)
      gapRamp =
        gapT < shoulder
          ? 1 - smoothstep(gapT / shoulder)
          : gapT > repeatDelay - shoulder
            ? smoothstep((gapT - (repeatDelay - shoulder)) / shoulder)
            : 0
    }
    const travel = (EASE[cfg.travelEase] || EASE.linear)(progress)
    let head1, head2, beamW, edgeRamp
    // outward path normals, computed from the CANONICAL orientation before
    // any motion reversal — reversing a head's travel (bottom's second
    // sweep, counter spin) must never flip which side of the border its
    // spotlight sits on. Default: bottom edge, outward is straight down.
    let normal1 = { x: 0, y: 1 }
    let normal2 = { x: 0, y: 1 }
    if (cfg.path === 'bottom') {
      // full-width sweep — 0.02..0.98 so the lit bar reaches both corners
      head1 = { x: 0.02 + 0.96 * travel, y: 1, dx: 1, dy: 0 }
      head2 = { x: 0.98 - 0.96 * travel, y: 1, dx: -1, dy: 0 }
      beamW = 0.5 + Math.sin(Math.PI * travel)
      // Keep the head's travel calm while shortening only the invisible gap
      // between sweeps. The old 0.125 margins hid a quarter of every cycle;
      // 0.0625 margins halve that dead interval for every bottom-path preset.
      edgeRamp = bottomSweepEnvelope(travel)
    } else if (cfg.path === 'around') {
      const aspect = rec.aspect
      head1 = walkSmooth(travel, 0.3, aspect, rec.lut)
      head2 =
        cfg.spin === 'counter'
          ? walkSmooth(1 - travel, 0.3, aspect, rec.lut)
          : walkSmooth(travel + 0.5, 0.3, aspect, rec.lut)
      // (-dy, dx) of the walk's own tangent is outward; grab it before the
      // counter-spin reversal below flips the tangent
      normal1 = { x: -head1.dy, y: head1.dx }
      normal2 = { x: -head2.dy, y: head2.dx }
      if (cfg.spin === 'counter') head2 = { ...head2, dx: -head2.dx, dy: -head2.dy }
      beamW = 1.15 + 0.35 * Math.sin(2 * Math.PI * ((time / (duration * 0.9)) % 1))
      edgeRamp = 1
      // per-blob path positions: the cluster follows the border around
      // corners as a chain instead of hanging straight off the tangent.
      // pathPx (aspect-true) keeps px offsets physically even on every edge.
      const perimeterPx = pathPx(0.3, aspect, Math.max(1, rec.hPx), rec.lut)
      const blobCount = Math.min(cfg.colors.length + 4, 9)
      for (let i = 1; i < blobCount; i++) {
        const off = Math.ceil(i / 2) * 18 * (i % 2 ? 1 : -1)
        const blob1 = walkSmooth(travel + off / perimeterPx, 0.3, aspect, rec.lut)
        el.style.setProperty(`--p1x${i}`, blob1.x.toFixed(4))
        el.style.setProperty(`--p1y${i}`, blob1.y.toFixed(4))
        if (cfg.heads === 2) {
          const blob2 = walkSmooth(
            cfg.spin === 'counter' ? 1 - travel - off / perimeterPx : travel + 0.5 + off / perimeterPx,
            0.3,
            aspect,
            rec.lut
          )
          el.style.setProperty(`--p2x${i}`, blob2.x.toFixed(4))
          el.style.setProperty(`--p2y${i}`, blob2.y.toFixed(4))
        }
      }
      // spot chain (round AND adaptive on 'around'): each circle walks the
      // path at its own arc offset PLUS an individual sway oscillator —
      // samples drift independently instead of translating as one welded
      // item, so the spot bends through corners instead of deforming
      {
        const { offs } = spotChainOf(cfg)
        if (offs.length > 1)
          offs.forEach((offsetPx, circle) => {
            const sway = 6 * Math.sin((2 * Math.PI * time) / (duration * (0.8 + 0.17 * circle)) + circle * 2.1)
            const lag = (offsetPx + sway) / perimeterPx
            const circle1 = walkSmooth(travel + lag, 0.3, aspect, rec.lut)
            el.style.setProperty(`--sc1x${circle}`, circle1.x.toFixed(4))
            el.style.setProperty(`--sc1y${circle}`, circle1.y.toFixed(4))
            if (cfg.heads === 2) {
              const circle2 = walkSmooth(
                cfg.spin === 'counter' ? 1 - travel - lag : travel + 0.5 + lag,
                0.3,
                aspect,
                rec.lut
              )
              el.style.setProperty(`--sc2x${circle}`, circle2.x.toFixed(4))
              el.style.setProperty(`--sc2y${circle}`, circle2.y.toFixed(4))
            }
          })
      }
      // fanned hotspot cores: each walks the path at its own lag + sway —
      // a procession through corners, not a rigid multi-dot object
      const coreCount = Math.max(1, Math.round(cfg.hotspots))
      if (coreCount > 1)
        for (let core = 0; core < coreCount; core++) {
          const off = cfg.hotSpread * (core - (coreCount - 1) / 2)
          if (!off) continue
          const sway =
            (4 + 36 * cfg.wander) * Math.sin((2 * Math.PI * time) / (duration * (0.7 + 0.19 * core)) + core * 1.7)
          const lag = (off + sway) / perimeterPx
          const core1 = walkSmooth(travel + lag, 0.3, aspect, rec.lut)
          el.style.setProperty(`--hp1x${core}`, core1.x.toFixed(4))
          el.style.setProperty(`--hp1y${core}`, core1.y.toFixed(4))
          if (cfg.heads === 2) {
            const core2 = walkSmooth(
              cfg.spin === 'counter' ? 1 - travel - lag : travel + 0.5 + lag,
              0.3,
              aspect,
              rec.lut
            )
            el.style.setProperty(`--hp2x${core}`, core2.x.toFixed(4))
            el.style.setProperty(`--hp2y${core}`, core2.y.toFixed(4))
          }
        }
    } else if (cfg.path === 'static') {
      // static: fixed bottom band, needles = waveform. Each band gets its own
      // gentle desynced sway (`--fb0..7`), so the row reads as a living
      // waveform rather than a fixed row of bars.
      head1 = { x: 0.5, y: 1, dx: 1, dy: 0 }
      head2 = head1
      beamW = 1
      edgeRamp = 1
      for (let band = 0; band < 8; band++)
        el.style.setProperty(
          `--fb${band}`,
          (0.55 + 0.45 * Math.sin((2 * Math.PI * time) / (duration * (0.9 + 0.13 * band)) + band * 1.9)).toFixed(3)
        )
    } else {
      // breathe: no travel — blobs drift, groups cross-fade, all pulses
      head1 = { x: 0.5, y: 0.5, dx: 1, dy: 0 }
      head2 = head1
      // Keep breathing spatial, but never let the spotlight collapse to a
      // pinprick at the trough. A living perimeter contracts; it does not
      // disappear into the host's centre.
      beamW = 1.1 + 0.6 * cfg.breatheAmp * Math.sin(2 * Math.PI * progress)
      edgeRamp = 0.78 + 0.22 * Math.sin(2 * Math.PI * progress - Math.PI / 2)
      const swell = Math.max(0.12, cfg.breatheAmp)
      const drift = 14 + 40 * cfg.breatheAmp
      const widthPeriods = [0.9, 1.1, 0.98],
        heightPeriods = [1.26, 0.81, 1.4]
      for (let quadrant = 0; quadrant < 4; quadrant++)
        el.style.setProperty(
          '--q' + quadrant,
          (
            0.45 +
            0.55 * (0.5 + 0.5 * Math.sin((2 * Math.PI * time) / (duration * (1.1 + 0.35 * quadrant)) + quadrant * 1.7))
          ).toFixed(3)
        )
      for (let group = 1; group <= 3; group++) {
        el.style.setProperty(
          `--w${group}`,
          (1 + swell * Math.sin((2 * Math.PI * time) / (duration * widthPeriods[group - 1]!) + group * 2.0)).toFixed(3)
        )
        el.style.setProperty(
          `--h${group}`,
          (
            1 -
            swell * 0.9 * Math.sin((2 * Math.PI * time) / (duration * heightPeriods[group - 1]!) + group * 2.0)
          ).toFixed(3)
        )
        el.style.setProperty(
          `--r${group}x`,
          (drift * Math.sin((2 * Math.PI * time) / (duration * (1.5 + 0.4 * group)) + group * 2.1)).toFixed(1) + 'px'
        )
        el.style.setProperty(
          `--r${group}y`,
          (drift * 0.6 * Math.sin((2 * Math.PI * time) / (duration * (1.8 + 0.3 * group)) + group * 1.3 + 1)).toFixed(
            1
          ) + 'px'
        )
      }
      if (cfg.needleJitter) {
        // small continuous wobble ("move slightly") — 3 shared oscillator groups
        for (let group = 1; group <= 3; group++) {
          el.style.setProperty(
            `--nj${group}x`,
            (6 * Math.sin((2 * Math.PI * time) / (duration * (0.7 + 0.2 * group)) + group * 3.3)).toFixed(1) + 'px'
          )
          el.style.setProperty(
            `--nj${group}y`,
            (6 * Math.cos((2 * Math.PI * time) / (duration * (0.9 + 0.15 * group)) + group * 2.1)).toFixed(1) + 'px'
          )
        }
        // Dim across the reshuffle instant (progress wrapping 1→0) so random
        // positions do not visibly pop, but retain a low luminous floor
        // instead of blinking the entire thinking field off.
        const distToEdge = Math.min(progress, 1 - progress)
        const fadeWindow = 0.12
        el.style.setProperty(
          '--njFade',
          (distToEdge >= fadeWindow ? 1 : 0.55 + 0.45 * smoothstep(distToEdge / fadeWindow)).toFixed(3)
        )
        // once per breath cycle, reshuffle onto new random perimeter spots
        const cycle = Math.floor(time / duration)
        if (rec.needleCyc !== cycle) {
          rec.needleCyc = cycle
          if (rec.needleBG)
            (rec.needleLayers || []).forEach(({ el: layerEl, inset }) => {
              layerEl.style.background = rec.needleBG!(inset, cycle)
            })
        }
      }
    }
    // pulse oscillators swing between the user's pulseMin/pulseMax; --bnK is
    // the mirror INSIDE that range (the old `2 − var()` only mirrors around 1)
    const pLo = Math.min(cfg.pulseMin, cfg.pulseMax),
      pHi = Math.max(cfg.pulseMin, cfg.pulseMax)
    const pMid = (pLo + pHi) / 2,
      pAmp = (pHi - pLo) / 2,
      pSum = pLo + pHi
    const bs1 = pMid + pAmp * Math.sin(2 * Math.PI * (time / (duration * 1.33)))
    const bs2 = pMid + pAmp * Math.sin(2 * Math.PI * (time / (duration * 1.7)) + Math.PI)
    const bs3 = pMid + pAmp * Math.sin(2 * Math.PI * (time / (duration * 1.51)) + 0.9)
    const bs4 = pMid + pAmp * Math.sin(2 * Math.PI * (time / (duration * 1.21)) + 2.2)
    // flicker: irregular candle-like intensity jitter (full on bloom, gentler
    // on stroke/wash so the border doesn't strobe)
    const flicker =
      1 +
      cfg.flicker *
        (0.32 * Math.sin(time * 9.7 + phase * 2.4) * Math.sin(time * 5.3 + phase) +
          0.14 * Math.sin(time * 23.1 + phase * 1.7))
    // per-hotspot life: every core flickers on its OWN clock (--hf0..7) —
    // clusters shimmer independently instead of blinking as one unit
    {
      const coreCount = Math.max(1, Math.round(cfg.hotspots))
      if (coreCount > 1) {
        const amp = cfg.flicker > 0 ? cfg.flicker : 0.35
        for (let core = 0; core < Math.min(8, coreCount); core++) {
          const coreFlicker =
            1 +
            amp *
              (0.3 *
                Math.sin(time * (8.3 + 1.1 * core) + core * 5.1) *
                Math.sin(time * (4.7 + 0.6 * core) + core * 2.3) +
                0.12 * Math.sin(time * (19 + 2.7 * core) + core * 3.7))
          el.style.setProperty(`--hf${core}`, coreFlicker.toFixed(3))
        }
      }
    }
    // adx/ady normalized so |dx|+|dy| = 1: the ellipse blend w·adx + h·ady is
    // a true interpolation — unnormalized diagonals sum to ~1.41 and the glow
    // balloons rounding every corner
    const tangent1 = Math.abs(head1.dx) + Math.abs(head1.dy) || 1
    const tangent2 = Math.abs(head2.dx) + Math.abs(head2.dy) || 1
    const vals: Record<string, string> = {
      '--bx': head1.x.toFixed(4),
      '--by': head1.y.toFixed(4),
      '--dx': head1.dx.toFixed(2),
      '--dy': head1.dy.toFixed(2),
      '--adx': (Math.abs(head1.dx) / tangent1).toFixed(3),
      '--ady': (Math.abs(head1.dy) / tangent1).toFixed(3),
      '--bx2': head2.x.toFixed(4),
      '--by2': head2.y.toFixed(4),
      '--dx2': head2.dx.toFixed(2),
      '--dy2': head2.dy.toFixed(2),
      '--adx2': (Math.abs(head2.dx) / tangent2).toFixed(3),
      '--ady2': (Math.abs(head2.dy) / tangent2).toFixed(3),
      '--nx': normal1.x.toFixed(2),
      '--ny': normal1.y.toFixed(2),
      '--nx2': normal2.x.toFixed(2),
      '--ny2': normal2.y.toFixed(2),
      // boost hover: brightness (--hovB feeds the layer filters) + size swell,
      // because opacity alone clamps at 1 and reads weak near the head
      '--hovB': (hovBoost ? 1 + 0.4 * cfg.hoverAmount * rec.hovC : 1).toFixed(3),
      '--bw': (beamW * (hovBoost ? 1 + 0.22 * cfg.hoverAmount * rec.hovC : 1)).toFixed(3),
      // travel paths breathe the glow height between heightMin/heightMax;
      // 'breathe' keeps its original breatheAmp-driven swing around 1.05
      '--bh': (
        (cfg.path === 'breathe'
          ? 1.05 + cfg.breatheAmp * Math.sin(4 * Math.PI * ((time / (duration * 1.3)) % 1))
          : (Math.min(cfg.heightMin, cfg.heightMax) + Math.max(cfg.heightMin, cfg.heightMax)) / 2 +
            (Math.abs(cfg.heightMax - cfg.heightMin) / 2) *
              Math.sin(4 * Math.PI * ((time / (duration * 1.3)) % 1))) *
        (hovBoost ? 1 + 0.22 * cfg.hoverAmount * rec.hovC : 1)
      ).toFixed(3),
      '--bs1': bs1.toFixed(3),
      '--bs2': bs2.toFixed(3),
      '--bs3': bs3.toFixed(3),
      '--bs4': bs4.toFixed(3),
      '--bn1': (pSum - bs1).toFixed(3),
      '--bn2': (pSum - bs2).toFixed(3),
      '--bn3': (pSum - bs3).toFixed(3),
      '--bn4': (pSum - bs4).toFixed(3),
      '--flk': flicker.toFixed(3),
      '--flk2': (1 + (flicker - 1) * 0.45).toFixed(3),
      '--bedge': (edgeRamp * gapRamp).toFixed(3),
      // breathe: continuous full-circle hue rotation (original pulse look)
      '--bhue':
        (cfg.hueRange === 0
          ? 0
          : cfg.path === 'breathe'
            ? ((time / 16) % 1) * 360
            : cfg.hueRange * Math.sin(2 * Math.PI * (time / 12))
        ).toFixed(1) + 'deg',
      '--bhue2':
        (cfg.hueRange === 0
          ? 0
          : cfg.path === 'breathe'
            ? ((time / 14) % 1) * 360
            : (cfg.hueRange + 10) * Math.sin(2 * Math.PI * (time / 8))
        ).toFixed(1) + 'deg',
      '--hov': (cfg.hover === 'reveal' ? rec.hovC : hovBoost ? 1 + 0.8 * cfg.hoverAmount * rec.hovC : 1).toFixed(3),
    }
    for (const [prop, value] of Object.entries(vals)) el.style.setProperty(prop, value)
  })
}

function addHost(rec: HostRec) {
  hostsSet.add(rec)
  if (!unsub) unsub = subscribe(tickAll)
}
function removeHost(rec: HostRec) {
  hostsSet.delete(rec)
  if (!hostsSet.size && unsub) {
    unsub()
    unsub = null
  }
}

export function Ethereal({
  state,
  states,
  themes,
  whileHover,
  whilePressed,
  transitionMs = 320,
  theme: explicitTheme,
  themeDetector,
  ...over
}: EtherealProps = {}) {
  const ref = useRef<HTMLSpanElement>(null)
  const theme = useTheme(ref, explicitTheme, themeDetector)
  const reducedMotion = useReducedMotion()
  const interaction = useInteraction(ref)
  const driverRef = useRef<DriverState | null>(null)
  const activeRecRef = useRef<HostRec | null>(null)
  if (!driverRef.current) driverRef.current = { phase: nextPhase(), hovT: 0, hovC: 0, clk: 0 }
  driverRef.current.hovT = interaction.hovered ? 1 : 0
  const safeTransitionMs = finiteNumber(transitionMs, 320, 0, 10_000)

  useEffect(() => {
    if (activeRecRef.current) activeRecRef.current.hovT = interaction.hovered ? 1 : 0
  }, [interaction.hovered])

  const cfg = mergeConfig<EtherealCfg>({
    defaults: ETHEREAL,
    props: over,
    themes,
    state,
    builtIns: ETHEREAL_STATES,
    states,
    derive: deriveEtherealState,
    theme,
    interaction,
    whileHover,
    whilePressed,
    componentName: 'ethereal',
  })
  const cfgSignature = runtimeConfigSignature(cfg, boundedPalette(cfg.colors, ETHEREAL.colors))

  useEffect(() => {
    const fx = ref.current,
      host = fx?.parentElement as HTMLElement | null
    if (!fx || !host) return
    // degenerate-input guards: empty palette would crash the gradient
    // builders; zero/negative spot dims emit invalid gradients whose dropped
    // MASK floods the element with unmasked paint. num() also caps the
    // loop-driving counts — configs can arrive from untrusted places
    // (URL-shared playground links) where needles:1e8 would OOM the tab
    // building gradient strings, and any NaN poisons the animation clocks.
    const clamped: EtherealCfg = {
      ...cfg,
      colors: boundedPalette(cfg.colors, ETHEREAL.colors),
      hoverAmount: finiteNumber(cfg.hoverAmount, ETHEREAL.hoverAmount, 0, 10),
      hoverEase: finiteNumber(cfg.hoverEase, ETHEREAL.hoverEase, 0.1, 100),
      duration: finiteNumber(cfg.duration, ETHEREAL.duration, 0.1, 600),
      repeatDelay: finiteNumber(cfg.repeatDelay, ETHEREAL.repeatDelay, 0, 600),
      spotSamples: finiteNumber(cfg.spotSamples, ETHEREAL.spotSamples, 0, 16),
      spotW: finiteNumber(cfg.spotW, ETHEREAL.spotW, 1, 4000),
      spotH: finiteNumber(cfg.spotH, ETHEREAL.spotH, 1, 4000),
      trail: finiteNumber(cfg.trail, ETHEREAL.trail, 0.2, 4),
      lead: finiteNumber(cfg.lead, ETHEREAL.lead, 0, 2),
      trailFade: finiteNumber(cfg.trailFade, ETHEREAL.trailFade, 0, 1),
      strokeWidth: finiteNumber(cfg.strokeWidth, ETHEREAL.strokeWidth, 0, 100),
      blendSoftness: finiteNumber(cfg.blendSoftness, ETHEREAL.blendSoftness, 0, 1),
      spotBlur: finiteNumber(cfg.spotBlur, ETHEREAL.spotBlur, 0, 120),
      spotOffset: finiteNumber(cfg.spotOffset, ETHEREAL.spotOffset, -400, 400),
      hotspots: finiteNumber(cfg.hotspots, ETHEREAL.hotspots, 1, 16),
      hotSpread: finiteNumber(cfg.hotSpread, ETHEREAL.hotSpread, 0, 1000),
      reveal: finiteNumber(cfg.reveal, ETHEREAL.reveal, 0, 4),
      heightMin: finiteNumber(cfg.heightMin, ETHEREAL.heightMin, 0.1, 4),
      heightMax: finiteNumber(cfg.heightMax, ETHEREAL.heightMax, 0.1, 4),
      // beamW = 1.1 + 0.6·amp·sin(...) — amp past ~1.8 swings --bw/--bh
      // negative mid-cycle, which invalidates every gradient radius built
      // from them and blanks the glow for that half of the breath
      breatheAmp: finiteNumber(cfg.breatheAmp, ETHEREAL.breatheAmp, 0, 1.5),
      flicker: finiteNumber(cfg.flicker, ETHEREAL.flicker, 0, 2),
      wander: finiteNumber(cfg.wander, ETHEREAL.wander, 0, 2),
      pulseMin: finiteNumber(cfg.pulseMin, ETHEREAL.pulseMin, 0.2, 3),
      pulseMax: finiteNumber(cfg.pulseMax, ETHEREAL.pulseMax, 0.2, 3),
      needles: finiteNumber(cfg.needles, ETHEREAL.needles, 0, 64),
      needleHeight: finiteNumber(cfg.needleHeight, ETHEREAL.needleHeight, 0, 10),
      glowBlur: finiteNumber(cfg.glowBlur, ETHEREAL.glowBlur, 0, 120),
      strokeOpacity: finiteNumber(cfg.strokeOpacity, ETHEREAL.strokeOpacity, 0, 4),
      innerOpacity: finiteNumber(cfg.innerOpacity, ETHEREAL.innerOpacity, 0, 4),
      bloomOpacity: finiteNumber(cfg.bloomOpacity, ETHEREAL.bloomOpacity, 0, 4),
      strength: finiteNumber(cfg.strength, ETHEREAL.strength, 0, 4),
      saturation: finiteNumber(cfg.saturation, ETHEREAL.saturation, 0, 3),
      brightness: finiteNumber(cfg.brightness, ETHEREAL.brightness, 0.2, 3),
      hueRange: finiteNumber(cfg.hueRange, ETHEREAL.hueRange, 0, 360),
    }
    // spotH is the real height of the LIGHT, not just the reveal window: the
    // wash blobs, needles and edge-relight bands all scale with it, so a big
    // host can carry a beam instead of a border-hugging strip
    const hScale = Math.min(6, Math.max(0.2, clamped.spotH / ETHEREAL.spotH))
    checkHost(host, 'Ethereal')
    const unclaim = claimHost(host, 'Ethereal')
    // spotShape 'round': fixed circle (average of both dims), never morphs
    // with the travel direction — smoother reading around corners.
    // round: BOTH dims share the same live scalar (--bw) — different
    // width/height oscillators would stretch the "circle" into an ellipse
    const rotW = (width: number, height: number, head: Head, scaleVar = 'var(--bw,1)') =>
      clamped.spotShape === 'round'
        ? `calc(${((width + height) / 2).toFixed(1)}px * var(--bw,1))`
        : rotWDir(width, height, head, scaleVar)
    const rotH = (width: number, height: number, head: Head, scaleVar = 'var(--bh,1)') =>
      clamped.spotShape === 'round'
        ? `calc(${((width + height) / 2).toFixed(1)}px * var(--bw,1))`
        : rotHDir(width, height, head, scaleVar)
    const heads: readonly Head[] = clamped.heads === 2 ? HEADS : [HEADS[0]]
    const colAt = (index: number) => clamped.colors[index % clamped.colors.length]!
    const soft = clamped.blendSoftness
    // gamut-aware color emitters
    const color = (col: string, alpha: number | string) =>
      clamped.gamut === 'p3' ? `color(display-p3 ${p3t(col)} / ${alpha})` : `rgba(${trip(col)},${alpha})`
    // quadrant-faded alpha: the breathe path cross-fades four --q groups
    const quadColor = (col: string, quadrant: number, alpha: number | string) =>
      clamped.gamut === 'p3'
        ? `color(display-p3 ${p3t(col)} / calc(${alpha} * var(--q${quadrant},1)))`
        : `rgba(${trip(col)}, calc(${alpha} * var(--q${quadrant},1)))`
    // HEADS[1] carries the second head's vars, every one suffixed '2'
    const headIndex = (head: Head) => (head.x.includes('2') ? 2 : 1)
    // pushes an anchor point outward, past the border, along the head's
    // OUTWARD path normal (--nx/--ny). Never derived from the motion tangent
    // here: a reversed head (bottom's second sweep, counter spin) flips its
    // tangent, and (-dy, dx) of that would push the spotlight inward.
    const pushOut = (ax: string, ay: string, head: Head) =>
      clamped.spotOffset
        ? {
            ax: `calc(${ax} + (${head.nx}) * ${clamped.spotOffset}px)`,
            ay: `calc(${ay} + (${head.ny}) * ${clamped.spotOffset}px)`,
          }
        : { ax, ay }
    // 'breathe' has no consistent edge to push against, so spotOffset is
    // skipped there
    const spotCenter = (inset: number, head: Head) =>
      clamped.path === 'breathe'
        ? { ax: pos(inset, head.x), ay: pos(inset, head.y) }
        : pushOut(pos(inset, head.x), pos(inset, head.y), head)
    // THE SPOT: the soft window that reveals the wash, the ring and the bloom
    // around the travelling head. One shape, three call sites — a lone spot, a
    // chain circle riding the path, a chain circle on a straight run — which
    // differ only in size and centre.
    const spotWindow = (width: string, height: string, cx: string, cy: string, mid: number) => {
      const innerStop = Math.round(mid * (1 - 0.35 * soft))
      const outerStop = Math.round(mid + (100 - mid) * (0.45 + 0.15 * soft))
      return `radial-gradient(ellipse ${width} ${height} at ${cx} ${cy}, #fff 0%, rgba(255,255,255,${(0.55 + 0.15 * soft).toFixed(2)}) ${innerStop}%, rgba(255,255,255,${(0.12 + 0.14 * soft).toFixed(2)}) ${outerStop}%, transparent 100%)`
    }
    const spot = (inset: number, width: number, height: number, mid: number, head: Head) => {
      const { ax, ay } = spotCenter(inset, head)
      return spotWindow(rotW(width, height, head), rotH(width, height, head), ax, ay, mid)
    }
    // round + elongated spot: NEVER a stretched ellipse — a chain of equal
    // circles (Ø = short dim). On 'around' each circle walks the path at
    // its own arc offset (--scNxK, set per-frame in the driver) so the
    // chain bends and flows instead of translating as one item.
    const spots = (inset: number, width: number, height: number, mid: number, head: Head): string[] => {
      // chains apply to round everywhere and to adaptive on 'around' (an
      // axis-aligned ellipse deforms through corners — the chain bends);
      // adaptive on straight paths keeps its classic stretched ellipse
      const chained = clamped.spotShape === 'round' || clamped.path === 'around'
      if (!chained || clamped.path === 'breathe') return [spot(inset, width, height, mid, head)]
      const { count, offs } = spotChainOf(clamped)
      if (count === 1) return [spot(inset, width, height, mid, head)]
      const { ax, ay } = spotCenter(inset, head)
      const headNum = headIndex(head)
      return offs.map((offsetPx, rank) => {
        // comet decay: head circle full size, trailing ones shrink with a
        // per-circle random factor + their own pulse oscillator — the tail
        // shimmers instead of translating as a rigid welded shape
        const fade = Math.min(1, Math.max(0, clamped.trailFade))
        const shrink = (1 - (0.66 * fade * rank) / Math.max(1, count - 1)) * (0.85 + 0.3 * rand(rank, 1.7))
        // circle Ø: the short dim while dims are close (classic chain), but a
        // strongly TALLER spot must grow the window too or spotH silently
        // stops mattering to the reveal and the light stays a border strip.
        // Capped at the height so WIDE spots (spotW ≫ spotH) keep their
        // classic small-circle chain — elongation there comes from the chain
        const windowPx = Math.max(Math.min(width, height), Math.min(height, 0.85 * ((width + height) / 2)))
        const diameter = `calc(${(windowPx * shrink).toFixed(0)}px * var(--bw,1) * var(--bs${(rank % 4) + 1},1))`
        if (clamped.path === 'around') {
          const center = pushOut(
            pos(inset, `var(--sc${headNum}x${rank},${head.x})`),
            pos(inset, `var(--sc${headNum}y${rank},${head.y})`),
            head
          )
          return spotWindow(diameter, diameter, center.ax, center.ay, mid)
        }
        return spotWindow(
          diameter,
          diameter,
          `calc(${ax} + ${offsetPx.toFixed(1)}px * ${head.dx})`,
          `calc(${ay} + ${offsetPx.toFixed(1)}px * ${head.dy})`,
          mid
        )
      })
    }
    const clusterCount =
      clamped.path === 'static'
        ? Math.min(24, Math.max(12, Math.round(clamped.needles)))
        : Math.min(clamped.colors.length + 4, 9)
    const cluster = (alpha: number, shrink: number, head: Head) =>
      Array.from({ length: clusterCount }, (_, blobIndex) => {
        const off = Math.ceil(blobIndex / 2) * 18 * (blobIndex % 2 ? 1 : -1)
        const blobW = ((23 + 13 * rand(blobIndex, 1.3)) * shrink).toFixed(0)
        // travel-path blob height follows the configured light height; breathe
        // and static have their own height systems below and ignore this
        const travelScale = clamped.path === 'bottom' || clamped.path === 'around' ? hScale : 1
        const blobH = ((22 + 14 * rand(blobIndex, 2.1)) * travelScale).toFixed(0)
        const alpha0 = alpha < 1 ? alpha : 1
        const blobColor = color(colAt(blobIndex), alpha0)
        const midStop = Math.round(35 + 25 * soft)
        if (clamped.path === 'breathe') {
          // asymmetric perimeter geometry from the original pulse variants —
          // stacked spots mix colors; region oscillators (--w/h/r 1..3) squish
          // and drift; quadrants (--q0..3) cross-fade
          const breatheSpots: [number, number, number, number][] = [
            [0.33, -0.07, 70, 40],
            [0.12, -0.05, 60, 35],
            [0.02, 0.68, 40, 70],
            [0.02, 0.68, 20, 35],
            [0.74, 1, 180, 32],
            [0.55, 1, 85, 26],
            [0.94, 0, 74, 32],
            [1, 0.27, 26, 42],
            [1, 0.27, 52, 48],
          ]
          const quadrants = [0, 0, 2, 2, 3, 3, 1, 1, 1]
          const spec = breatheSpots[blobIndex % breatheSpots.length]!,
            quadrant = quadrants[blobIndex % quadrants.length]!,
            group = (blobIndex % 3) + 1
          const scale = 0.7 * shrink
          const ax = pos(0, spec[0].toFixed(2), `var(--r${group}x, 0px)`)
          const ay = pos(0, spec[1].toFixed(2), `var(--r${group}y, 0px)`)
          return `radial-gradient(ellipse calc(${(spec[2] * scale).toFixed(0)}px * var(--w${group},1)) calc(${(spec[3] * scale).toFixed(0)}px * var(--h${group},1) * var(--bh,1)) at ${ax} ${ay}, ${quadColor(colAt(blobIndex), quadrant, alpha0)} 0%, ${quadColor(colAt(blobIndex), quadrant, +(alpha0 * 0.4).toFixed(2))} ${Math.min(midStop + 15, 70)}%, transparent 100%)`
        }
        if (clamped.path === 'static') {
          // Waveform: neighboring cells overlap into one continuous color
          // field. The old nine opaque centers were farther apart than their
          // radii on wide composers, exposing a row of bright beads. Cell
          // count follows the configured waveform density, while radius
          // follows host spacing and stays large enough on compact controls.
          const progress = blobIndex / Math.max(1, clusterCount - 1)
          const xFrac = 0.04 + 0.92 * progress
          const band = Math.min(7, Math.floor(progress * 7.999))
          const paletteIndex = Math.min(clamped.colors.length - 1, Math.floor(progress * clamped.colors.length))
          const staticColor = colAt(paletteIndex)
          const spacingPx = (Math.max(120, host.offsetWidth) * 0.92) / Math.max(1, clusterCount - 1)
          const radius = Math.max(30, Math.min(88, spacingPx * 1.15)) * shrink
          const coreAlpha = +(alpha0 * 0.62).toFixed(2)
          const shoulderAlpha = +(alpha0 * 0.28).toFixed(2)
          return `radial-gradient(ellipse calc(${radius.toFixed(0)}px * var(--bs${(blobIndex % 4) + 1},1)) calc(${(+blobH * 1.15).toFixed(0)}px * var(--fb${band},1)) at ${pos(0, xFrac.toFixed(3))} 100%, ${color(staticColor, coreAlpha)} 0%, ${color(staticColor, shoulderAlpha)} ${Math.min(72, midStop + 14)}%, transparent 100%)`
        }
        // around: each blob walks the path at its own arc offset (--pNxI,
        // set per-frame in the driver) so the comet bends through corners;
        // bottom keeps the straight tangent offset (the path IS a line)
        const headNum = headIndex(head)
        const onPath = clamped.path === 'around' && off !== 0
        const ax = onPath
          ? pos(0, `var(--p${headNum}x${blobIndex},${head.x})`)
          : pos(0, head.x, `${off}px * ${head.dx}`)
        const ay = onPath
          ? pos(0, `var(--p${headNum}y${blobIndex},${head.y})`)
          : pos(0, head.y, `${off}px * ${head.dy}`)
        // side edges get fattened blobs (only the ady term grows) — the fixed
        // 18px spacing otherwise reads as separate dots on vertical runs
        return `radial-gradient(ellipse ${rotW(+blobW, +blobH * 1.35, head, `var(--bw,1) * var(--bs${(blobIndex % 4) + 1},1)`)} ${rotH(+blobW * 1.5, +blobH, head)} at ${ax} ${ay}, ${blobColor} 0%, ${color(colAt(blobIndex), +(alpha0 * 0.4).toFixed(2))} ${midStop}%, transparent 100%)`
      }).join(', ')
    const needleBG = (layerInset: number, seed = 0) => {
      const parts: string[] = []
      const jitter = clamped.needleJitter && clamped.path === 'breathe'
      for (let needleIndex = 0; needleIndex < clamped.needles; needleIndex++) {
        let xFrac = 0.5,
          yFrac = 1,
          edge = 'bottom'
        if (jitter) {
          const placement = randEdgePos(needleIndex * 11.7 + seed * 4.13)
          xFrac = placement.x
          yFrac = placement.y
          edge = placement.edge
        } else if (clamped.path === 'bottom' || clamped.path === 'static') {
          xFrac = clamped.needles === 1 ? 0.5 : 0.08 + 0.84 * (needleIndex / (clamped.needles - 1))
        } else {
          const placement = walkRect((needleIndex + 0.5) / clamped.needles)
          xFrac = placement.x
          yFrac = placement.y
          edge = placement.edge
        }
        const side = edge === 'left' || edge === 'right'
        const thin = needleIndex % 2 === 0
        // A static spectrum is a field, not a row of pins: give every needle
        // enough lateral body to overlap its blurred neighbors. Moving paths
        // retain alternating filaments; softness comes from falloff/blur, not
        // from making every needle so wide that they fuse into a thick ring.
        const needleW =
          clamped.path === 'static'
            ? (9 + 7 * rand(needleIndex, 1.7)).toFixed(1)
            : thin
              ? ((0.8 + 1.4 * rand(needleIndex, 1.7)) * (1 + 0.7 * soft)).toFixed(1)
              : ((7 + 7 * rand(needleIndex, 1.7)) * (0.9 + 0.15 * soft)).toFixed(1)
        const needleH = (
          (thin ? 58 + 34 * rand(needleIndex, 2.6) : 28 + 17 * rand(needleIndex, 2.6)) *
          clamped.needleHeight *
          (clamped.path === 'bottom' || clamped.path === 'around' ? hScale : 1)
        ).toFixed(0)
        // 8 mult patterns over 4 oscillators + their range-aware mirrors --bnK
        const mult = [
          'var(--bs1,1)',
          'var(--bn2,1)',
          'var(--bs3,1)',
          'var(--bn4,1)',
          'var(--bs2,1)',
          'var(--bn1,1)',
          'var(--bs4,1)',
          'var(--bn3,1)',
        ][needleIndex % 8]!
        const inset = layerInset + 2 + Math.round(2 * rand(needleIndex, 3.3))
        let ax =
          edge === 'left'
            ? `${inset}px`
            : edge === 'right'
              ? `calc(100% - ${inset}px)`
              : pos(layerInset, xFrac.toFixed(3))
        let ay =
          edge === 'top'
            ? `${inset}px`
            : edge === 'bottom'
              ? `calc(100% - ${inset}px)`
              : pos(layerInset, yFrac.toFixed(3))
        // slight continuous drift — 3 shared oscillator groups, tick()-driven
        if (jitter) {
          const group = (needleIndex % 3) + 1
          ax = `calc(${ax} + var(--nj${group}x,0px))`
          ay = `calc(${ay} + var(--nj${group}y,0px))`
        }
        // Needle HEIGHT follows its band (--fb0..7), on EVERY path — the same
        // needles you configured take the band's shape rather than a separate
        // waveform widget being swapped in. Only `static` drives the bands, and
        // they fall back to 1 elsewhere, so this multiplies by nothing on the
        // other paths. `static` reads the band alone because there it IS the
        // waveform: the row's whole shape is the bands, not bands riding a
        // breathing pulse.
        const bandVar = `var(--fb${Math.min(7, Math.floor((needleIndex / Math.max(1, clamped.needles - 1)) * 7.999))},1)`
        // Travelling/breathing needles should emerge spatially from the edge,
        // not merely appear when the moving mask reaches them. Their existing
        // desynchronised pulse now scales length as well as width; static keeps
        // height reserved for the bands.
        const heightVar = clamped.path === 'static' ? bandVar : `calc(var(--bh,1) * ${bandVar} * ${mult})`
        const dims = side
          ? `calc(${needleH}px * ${heightVar}) calc(${needleW}px * ${mult})`
          : `calc(${needleW}px * ${mult}) calc(${needleH}px * ${heightVar})`
        const spreadPalette = clamped.path === 'static' || (clamped.path === 'around' && soft >= 1.25)
        const needlePaletteIndex = spreadPalette
          ? Math.min(
              clamped.colors.length - 1,
              Math.floor((needleIndex / Math.max(1, clamped.needles - 1)) * clamped.colors.length)
            )
          : needleIndex
        const needleColor = (alpha: number) =>
          clamped.path === 'breathe'
            ? quadColor(colAt(needlePaletteIndex), needleIndex % 4, alpha)
            : color(colAt(needlePaletteIndex), alpha)
        // Blur alone leaves a saturated line at each needle's centre. High
        // softness trades that peak for a broader luminous body so adjacent
        // growth blends as light rather than reading as separate columns.
        const softPeak = soft > 1 ? Math.max(0.5, 1 - 0.75 * (soft - 1)) : 1
        parts.push(
          clamped.path === 'static'
            ? `radial-gradient(ellipse ${dims} at ${ax} ${ay}, ${needleColor(0.68)} 0%, ${needleColor(0.36)} ${Math.round(34 + 16 * soft)}%, ${needleColor(0.12)} ${Math.round(68 + 12 * soft)}%, transparent 100%)`
            : `radial-gradient(ellipse ${dims} at ${ax} ${ay}, ${needleColor(+softPeak.toFixed(2))} 0%, ${needleColor(+(softPeak * 0.58).toFixed(2))} ${Math.round(28 + 16 * soft)}%, ${needleColor(+(softPeak * 0.22).toFixed(2))} ${Math.round(58 + 14 * soft)}%, transparent ${Math.round(90 + 8 * soft)}%)`
        )
      }
      // breathe/static have no travelling head — no core at all.
      if (clamped.path === 'breathe' || clamped.path === 'static') return parts.join(', ')
      // layerInset distinguishes the layer: 0 = clipped internal (round dot
      // core), >0 = extended external (wide flat streak under the button edge).
      // The "spot" can be a CLUSTER of hotspots: extras fan out along the
      // travel tangent, shrinking away from center, each on its own oscillator
      const ext = layerInset > 0
      const coreCount = Math.max(1, Math.round(clamped.hotspots))
      // cores stack additively — damp each one's alpha as the cluster grows
      const alphaDamp = 1 / Math.sqrt(coreCount)
      for (const head of heads) {
        const headNum = headIndex(head)
        for (let core = 0; core < coreCount; core++) {
          // per-core alpha rides its own flicker oscillator (--hfK)
          const white = (alpha: number) =>
            coreCount > 1
              ? `rgba(255,255,255,calc(${(alpha * alphaDamp).toFixed(2)} * var(--hf${Math.min(7, core)},1)))`
              : `rgba(255,255,255,${(alpha * alphaDamp).toFixed(2)})`
          const off = clamped.hotSpread * (core - (coreCount - 1) / 2)
          const scale = 1 - (0.45 * Math.abs(core - (coreCount - 1) / 2)) / Math.max(1, (coreCount - 1) / 2 || 1)
          // around: fanned cores walk the path individually (--hpNxK, set
          // per-frame in the driver) — never a rigid multi-dot object
          const onPath = clamped.path === 'around' && off !== 0
          const hx = onPath
            ? pos(layerInset, `var(--hp${headNum}x${core},${head.x})`)
            : pos(layerInset, head.x, off ? `${off.toFixed(0)}px * ${head.dx}` : undefined)
          const hy = onPath
            ? pos(layerInset, `var(--hp${headNum}y${core},${head.y})`)
            : pos(layerInset, head.y, off ? `${off.toFixed(0)}px * ${head.dy}` : undefined)
          const pulse = `var(--bs${(core % 4) + 1},1)`,
            pulseMirror = `var(--bn${(core % 4) + 1},1)`
          // one core = a tight blob riding its own pulse oscillators plus a
          // wider, dimmer halo on the shared ones. All three placements below
          // are the same pair; only the dimensions and stops change.
          const coreSpot = (width: number, height: number, stops: string, scaleW?: string, scaleH?: string) =>
            `radial-gradient(ellipse ${rotW(width * scale, height * scale, head, scaleW ?? 'var(--bw,1)')} ${rotH(width * scale, height * scale, head, scaleH ?? 'var(--bh,1)')} at ${hx} ${hy}, ${stops})`
          if (ext && clamped.spotShape !== 'round') {
            parts.push(
              coreSpot(56, 9, `${white(0.8)} 0%, ${white(0.35)} 45%, transparent 100%`, pulse, pulseMirror),
              coreSpot(95, 24, `${white(0.38)} 0%, ${white(0.14)} 35%, transparent 80%`)
            )
          } else if (ext) {
            // round + external: soft diffuse core — the internal-style
            // full-alpha dot reads as a hard defined point over the bloom
            parts.push(
              coreSpot(26, 20, `${white(0.6)} 0%, ${white(0.28)} 35%, transparent 80%`, pulse, pulseMirror),
              coreSpot(50, 46, `${white(0.2)} 0%, ${white(0.08)} 30%, transparent 75%`)
            )
          } else {
            parts.push(
              coreSpot(
                21,
                15,
                `${white(1)} 0%, ${white(0.9)} 20%, ${white(0.5)} 50%, transparent 100%`,
                pulse,
                pulseMirror
              ),
              coreSpot(42, 40, `${white(0.3)} 0%, ${white(0.12)} 25%, ${white(0.03)} 55%, transparent 80%`)
            )
          }
        }
      }
      return parts.join(', ')
    }

    fx.replaceChildren()
    // mode-scoped per-frame vars persist on the HOST across rebuilds — a
    // stale --njFade (~0 near a breathe-jitter cycle wrap) would freeze the
    // next config's bloom dimmed or invisible
    host.style.removeProperty('--njFade')
    // STATE TRANSITIONS: when cfg changes (a different `state`, or any prop)
    // the rebuilt layers fade in over `transitionMs` (e.g. idle → sending →
    // thinking on a chat composer)
    if (safeTransitionMs > 0 && !reducedMotion) {
      fx.style.opacity = '0'
      fx.style.transition = `opacity ${safeTransitionMs}ms ease`
      // force a style flush so the 0 is actually committed — a single rAF
      // fires before style recalc and the transition would never run
      void fx.offsetWidth
      fx.style.opacity = '1'
    } else {
      fx.style.opacity = '1'
      fx.style.transition = ''
    }
    fx.style.overflow = clamped.place === 'internal' ? 'hidden' : 'visible'
    // anchor to the BORDER box, not the padding box, so the lit ring lands ON
    // the host's real border instead of 1px inside it (double-border
    // artifact) — per side, borders aren't always uniform
    const hostStyle = getComputedStyle(host)
    fx.style.inset = ''
    fx.style.top = `-${parseFloat(hostStyle.borderTopWidth) || 0}px`
    fx.style.right = `-${parseFloat(hostStyle.borderRightWidth) || 0}px`
    fx.style.bottom = `-${parseFloat(hostStyle.borderBottomWidth) || 0}px`
    fx.style.left = `-${parseFloat(hostStyle.borderLeftWidth) || 0}px`
    const radius = hostStyle.borderTopLeftRadius
    const clip = `inset(0 round ${radius})`
    const mk = (zIndex: string, parent?: HTMLElement) => {
      const layer = document.createElement('span')
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;border-radius:inherit'
      layer.style.zIndex = zIndex
      ;(parent ?? fx).appendChild(layer)
      return layer
    }
    // a gradient with matching inset stops at BOTH ends of one axis: `ends`
    // outside the inset, `mid` through the middle
    const band = (to: string, ends: string, mid: string, inset: string) =>
      `linear-gradient(${to ? `${to}, ` : ''}${ends}, ${mid} ${inset}, ${mid} calc(100% - ${inset}), ${ends})`
    // wash edge-relight: opaque at the ends, transparent in between, so the
    // `add` composite keeps the host's own rim lit outside the spot
    // the short host dimension bounds every INTERNAL edge band: two opposing
    // bands meet in the middle at half of it, and past that point the "edge
    // relight" is just a full interior wash. 0 = unmeasured (jsdom, display:
    // none) — fall back to a size where the caps don't bite.
    const responsiveBands = () => {
      const hostShort = Math.min(host.offsetWidth, host.offsetHeight) || 320
      const edgePx = Math.min(Math.round(28 * hScale), Math.max(8, Math.floor(hostShort * 0.4)))
      const bloomBand = Math.max(
        8,
        Math.min(Math.round(18 + 64 * Math.max(0, hScale - 1)), Math.round(hostShort * 0.28)),
      )
      return {
        edgeY: band('', '#fff', 'transparent', `${edgePx}px`),
        edgeX: band('to right', '#fff', 'transparent', `${edgePx}px`),
        bloomEdgeY: band('', '#fff', 'transparent', `${bloomBand}px`),
        bloomEdgeX: band('to right', '#fff', 'transparent', `${bloomBand}px`),
      }
    }
    let { edgeY, edgeX, bloomEdgeY, bloomEdgeX } = responsiveBands()
    // every painted layer wears the same filter chain — hue drift, saturation,
    // and a brightness that boost-hover scales through --hovB. Saturation is
    // baked in rather than read from a custom property: it is fixed for the
    // life of a build, and nothing per-frame touches it.
    const glowFilter = (lead: string, hueVar: string) =>
      `${lead}hue-rotate(var(${hueVar}, 0deg)) saturate(${clamped.saturation.toFixed(3)}) brightness(calc(${clamped.brightness} * var(--hovB,1)))`
    // shared visibility envelope: edge ramp × hover × flicker. Only the
    // flicker terms and the final scalar differ.
    const envelope = (flicker: string, amount: string | number) =>
      `calc(var(--bedge,0) * var(--hov,1) * ${flicker} * ${amount})`
    // Safari still needs the -webkit- spelling and its composite keywords
    // differ — declare the mask layer list once, emit both spellings
    const masked = (layers: string, composites?: [webkit: string, standard: string]) =>
      composites
        ? {
            webkitMask: layers,
            webkitMaskComposite: composites[0],
            mask: layers,
            maskComposite: composites[1],
          }
        : { webkitMask: layers, mask: layers }
    const responsiveInnerMasks: { el: HTMLElement; spotMask: string }[] = []
    const responsiveBloomMasks: HTMLElement[] = []
    const updateResponsiveMasks = () => {
      ;({ edgeY, edgeX, bloomEdgeY, bloomEdgeX } = responsiveBands())
      for (const { el, spotMask } of responsiveInnerMasks)
        Object.assign(el.style, masked(`${spotMask}, ${edgeY}, ${edgeX}`, ['source-in, source-over', 'intersect, add']))
      for (const el of responsiveBloomMasks)
        Object.assign(el.style, masked(`${bloomEdgeY}, ${bloomEdgeX}`, ['source-over', 'add']))
    }
    const spotScale = clamped.path === 'breathe' ? 3 : 1 // breathe: spotlight covers the whole element
    // static path: fixed band hugging the bottom edge instead of a moving spot
    const staticSpot = `linear-gradient(to top, #fff, rgba(255,255,255,0.55) ${Math.round(26 + 18 * soft)}%, transparent ${Math.round(58 + 20 * soft)}%)`
    // blurs the spot's masked-in content itself — softens the hard cutoff at
    // the mask edge, beyond what blendSoftness's extra gradient stops do
    const spotBlurF = clamped.spotBlur ? `blur(${clamped.spotBlur}px) ` : ''
    for (const head of heads) {
      // round + wide spot → chain of circle windows: one inner/stroke layer
      // per circle (mask lists can't union-then-intersect), opacity damped
      // 1/√n so circle overlaps don't blow out
      const spotList =
        clamped.path === 'static'
          ? [staticSpot]
          : spots(0, clamped.spotW * spotScale, clamped.spotH * spotScale, 45, head)
      const baseDamp = spotList.length > 1 ? 1 / Math.sqrt(spotList.length) : 1
      for (const [spotIndex, spotMask] of spotList.entries()) {
        // tail circles dim progressively — comet, not sausage
        const damp =
          baseDamp * (1 - (Math.min(1, Math.max(0, clamped.trailFade)) * spotIndex) / Math.max(1, spotList.length - 1))
        // interior wash only for the modes that own the inside
        if (clamped.place === 'internal' || clamped.place === 'both') {
          const inner = mk('1')
          Object.assign(inner.style, {
            background: cluster(0.45, 0.85, head),
            ...masked(`${spotMask}, ${edgeY}, ${edgeX}`, ['source-in, source-over', 'intersect, add']),
            clipPath: clip,
            opacity: envelope('var(--flk2,1)', (clamped.innerOpacity * clamped.strength * damp).toFixed(3)),
            filter: glowFilter(spotBlurF, '--bhue'),
          })
          responsiveInnerMasks.push({ el: inner, spotMask })
        }
        const whiteHead = `radial-gradient(ellipse ${rotW(24, 28, head)} ${rotH(24, 28, head)} at ${pos(0, head.x)} ${pos(0, head.y)}, rgba(255,255,255,.38) 0%, rgba(255,255,255,.12) 30%, transparent 65%)`
        const stroke = mk('2')
        Object.assign(stroke.style, {
          // ring thickness = the padding (content-box xor leaves only the rim)
          padding: `${clamped.strokeWidth}px`,
          // breathe/static: no travelling head → no white highlight
          background:
            clamped.path === 'breathe' || clamped.path === 'static'
              ? cluster(1, 1, head)
              : `${whiteHead}, ${cluster(1, 1, head)}`,
          ...masked(`${spotMask}, linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`, [
            'source-in, xor',
            'intersect, exclude',
          ]),
          clipPath: clip,
          opacity: envelope('var(--flk2,1)', (clamped.strokeOpacity * clamped.strength * damp).toFixed(3)),
          filter: glowFilter(spotBlurF, '--bhue'),
        })
      }
    }
    // needle bloom layer(s) — internal: confined to a narrow border band so a
    // large blurred head cannot turn the middle of a compact button into a
    // second hotspot; external: un-clipped halo. 'both' builds one of each.
    // Keep this narrower than the wash's 28px edge relight: the wash is low
    // contrast, while the bloom contains the white cores and is what reads as
    // a centre spill on a 40–60px-tall host.
    // scales past 18px only when the light is configured taller than default —
    // needles ARE the vertical beams, so their band must grow with the height
    // or they stay decapitated at the compact-button guard width.
    // The host-size arm is NOT scaled by hScale: it is the centre guard, and
    // multiplying it by the beam height let a tall preset (spotH 120,
    // place "both") push both bands past the middle of a chat composer —
    // white beams straight through the interior, the exact spill the
    // post-blur band exists to prevent. Tall EXTERNAL reach is unaffected:
    // the external bloom sizes its own box from typReach below.
    let holeRO: ResizeObserver | undefined
    const makeBloom = (external: boolean) => {
      // A round bloom is a circle on either side of the border. It must keep
      // the same diameter for `place="both"`; otherwise one moving light has
      // an oversized inner half and a pinched outer half. Adaptive stays
      // flattened externally because that ellipse deliberately hugs the edge.
      const roundBloom = clamped.spotShape === 'round'
      const bloomHAdd = roundBloom ? 50 : external ? 14 : 50
      const bloomScale = (roundBloom ? 1 : external ? 0.55 : 1) * clamped.reveal
      // typical outward reach of the spot mask past the border — the layer
      // box should hold it (plus blur tail) or the glow fades early
      const typReach =
        (clamped.spotShape === 'round'
          ? Math.min(clamped.spotW + 6, clamped.spotH + bloomHAdd)
          : clamped.spotH + bloomHAdd) * bloomScale
      // edge guard: NOTHING may be hard-cut at the layer box — chain circles
      // overshoot sideways (long trails), pulse peaks swell the mask past the
      // box, big blurs smear beyond it. Fading the outer band to transparent
      // turns every one of those cuts into a smooth fade. The fade must
      // outrun the blur smear (~2σ) or the smear re-creates the hard edge.
      const guardPx = Math.max(12, Math.ceil(clamped.glowBlur * 2.2))
      const bloomInset = external
        ? Math.max(Math.round(26 + clamped.glowBlur * 1.6), Math.round(typReach + clamped.glowBlur * 1.2), guardPx + 20)
        : 0
      let box: HTMLElement | undefined
      if (external) {
        // guard wrapper owns the padded layer box + the edge fade; the bloom
        // insets 0 inside it so the fade applies AFTER its blur (a mask on
        // the blurred layer itself would be smeared by the filter)
        const wrap = mk('3')
        wrap.style.inset = `-${bloomInset}px`
        const guardX = band('to right', 'transparent', '#fff', `${guardPx}px`)
        const guardY = band('', 'transparent', '#fff', `${guardPx}px`)
        Object.assign(wrap.style, masked(`${guardX}, ${guardY}`, ['source-in', 'intersect']))
        box = wrap
      } else {
        // Apply the edge band AFTER the bloom's blur by masking a wrapper,
        // rather than adding it to the bloom mask before the filter. The
        // latter still smears white core light into the host centre.
        const wrap = mk('3')
        Object.assign(wrap.style, masked(`${bloomEdgeY}, ${bloomEdgeX}`, ['source-over', 'add']))
        responsiveBloomMasks.push(wrap)
        box = wrap
      }
      const bloom = mk('3', box)
      const spotsBG =
        clamped.path === 'static'
          ? staticSpot
          : heads
              .flatMap((head) =>
                spots(
                  bloomInset,
                  (clamped.spotW + 6) * spotScale * bloomScale,
                  (clamped.spotH + bloomHAdd) * spotScale * bloomScale,
                  35,
                  head
                )
              )
              .join(', ')
      Object.assign(bloom.style, {
        background: needleBG(bloomInset),
        // --njFade (breathe-jitter only) softens the reshuffle without ever
        // extinguishing the whole field, so a thinking state remains legible.
        opacity: envelope('var(--flk,1) * var(--njFade,1)', clamped.bloomOpacity * clamped.strength),
        filter: glowFilter(`blur(${clamped.glowBlur}px) `, '--bhue2'),
        ...masked(spotsBG),
      })
      if (!external) bloom.style.clipPath = clip
      else if (clamped.place === 'ext-border') {
        // rounded-hole clip (absolute px — recut when the host resizes).
        // radiusPx resolves '50%' against the CURRENT host box, so it must
        // re-run inside the observer: a 40×40 50% pill resized to 200×80
        // needs a 40px hole radius, not the mount-time 20px
        const setHole = () => {
          bloom.style.clipPath = holePath(
            host.offsetWidth,
            host.offsetHeight,
            bloomInset,
            radiusPx(radius, host)
          )
        }
        setHole()
        bloom.style.borderRadius = '0'
        holeRO = new ResizeObserver(setHole)
        holeRO.observe(host)
      }
      return { el: bloom, inset: bloomInset }
    }
    const needleLayers: { el: HTMLElement; inset: number }[] = []
    if (clamped.place === 'internal' || clamped.place === 'both') needleLayers.push(makeBloom(false))
    if (clamped.place !== 'internal') needleLayers.push(makeBloom(true))
    updateResponsiveMasks()

    // reveal starts hidden; other modes at full
    host.style.setProperty('--hov', clamped.hover === 'reveal' ? '0' : '1')

    const cleanupStatic = () => {
      unclaim()
      holeRO?.disconnect()
    }
    if (reducedMotion) {
      // no ticker → --bedge would stay at its 0 default and every layer
      // (opacity × var(--bedge,0)) would be invisible; render one static frame
      host.style.setProperty('--bedge', '1')
      // reveal initializes --hov to 0 expecting pointer events + ticker to
      // raise it — neither runs here, so force it visible too
      host.style.setProperty('--hov', '1')
      const metricsRO = new ResizeObserver(updateResponsiveMasks)
      metricsRO.observe(host)
      return () => {
        metricsRO.disconnect()
        cleanupStatic()
      }
    }
    const initialAspect = quantAspect(host.offsetWidth, host.offsetHeight)
    const rec: HostRec = {
      el: host,
      cfg: clamped,
      phase: driverRef.current!.phase,
      hovT: driverRef.current!.hovT,
      hovC: driverRef.current!.hovC,
      clk: driverRef.current!.clk,
      aspect: initialAspect,
      lut: getLUT(0.3, initialAspect),
      hPx: Math.max(1, host.offsetHeight),
      visible: true,
      needleLayers,
      needleBG,
    }
    // layout metrics refresh only on real size changes — the animation loop
    // itself never reads offsetWidth/offsetHeight
    const metricsRO = new ResizeObserver(() => {
      rec.aspect = quantAspect(host.offsetWidth, host.offsetHeight)
      rec.lut = getLUT(0.3, rec.aspect)
      rec.hPx = Math.max(1, host.offsetHeight)
      updateResponsiveMasks()
    })
    metricsRO.observe(host)
    // off-screen hosts pause entirely (generous margin — the glow overflows)
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) rec.visible = entry.isIntersecting
      },
      { rootMargin: '160px' }
    )
    io.observe(host)
    activeRecRef.current = rec
    addHost(rec)
    return () => {
      driverRef.current!.clk = rec.clk
      driverRef.current!.hovC = rec.hovC
      if (activeRecRef.current === rec) activeRecRef.current = null
      cleanupStatic()
      metricsRO.disconnect()
      io.disconnect()
      removeHost(rec)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgSignature, safeTransitionMs, reducedMotion])
  // inline styles, no Tailwind dependency — the library must not assume the
  // consumer's CSS stack
  return (
    <span
      ref={ref}
      aria-hidden
      style={{
        zIndex: 0,
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderRadius: 'inherit',
      }}
    />
  )
}

/* Wrapper variant — when you can't (or don't want to) edit the child:
   <EtherealWrap {...over}><MyButton/></EtherealWrap>
   The wrapper span becomes the effect host, so the glow follows ITS border
   radius (pass borderRadius to match the child, or let it inherit via
   rounded-[inherit] children). Inputs/textareas MUST use this form —
   replaced elements can't contain the effect span. */
export function EtherealWrap({
  children,
  style,
  className,
  ...over
}: EtherealProps & {
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <span
      className={className}
      style={{
        ...style,
        position: 'relative',
        isolation: 'isolate',
        display: 'inline-block',
      }}
    >
      <span style={{ position: 'relative', zIndex: 10, display: 'block' }}>{children}</span>
      <Ethereal {...over} />
    </span>
  )
}

// Event Horizon — black-hole accretion glow. A white-hot head orbits the
// element trailing a doppler-tinted plasma stream (a dense chain of micro-
// spots that each walk the border path at their own lag), wrapped in a
// graduated gravitational lens, a living photon rim and a lensed halo.
// Shares the package-wide ~60fps rAF ticker with <Ethereal/>.
'use client'
import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { THINKING, lift, scale, scaleDuration } from './core/derive'
import { pathPx, quantAspect, walkSmooth } from './core/path'
import { mergeConfig, useInteraction, type StateConfig, type ThemeConfig } from './core/state'
import { subscribe } from './core/ticker'
import { useReducedMotion, useTheme, type Theme } from './core/theme'
import { HEADS, checkHost, claimHost, nextPhase, pos, radiusPx, trip } from './core/util'

export type EventHorizonCfg = {
  colors: string[]
  duration: number
  repeatDelay: number
  // accretion ring thickness (px)
  ring: number
  // tail length multiplier
  tail: number
  // tail micro-spot pairs (stream density)
  nodes: number
  // node size multiplier
  node: number
  // how much the tail surges/pulses
  shimmer: number
  // halo gaussian blur (px)
  blur: number
  // halo opacity
  halo: number
  // halo distance from the border (px)
  dist: number
  // 'round' collapses oriented ellipses to fixed circles — the silhouette
  // never swells or squashes through corners
  shape: 'adaptive' | 'round'
  // superellipse corner exponent (lower = squarer path)
  corner: number
  // center vignette depth
  shadow: number
  // gravitational-lens backdrop blur strength (0 = off)
  lens: number
  dir: 1 | -1
  hover: 'none' | 'boost' | 'speed' | 'reveal'
  hoverAmount: number
  hoverEase: number
}

export const EVENT_HORIZON: EventHorizonCfg = {
  colors: ['#ffb46b', '#ff8a3d', '#b58cff'],
  duration: 6,
  repeatDelay: 0,
  ring: 2,
  tail: 1.2,
  nodes: 9,
  node: 1,
  shimmer: 0.45,
  blur: 14,
  halo: 0.9,
  dist: 0,
  shape: 'adaptive',
  corner: 0.3,
  shadow: 0.35,
  lens: 4,
  dir: 1,
  hover: 'boost',
  hoverAmount: 1.2,
  hoverEase: 8,
}

/** The registry of state NAMES. Empty entries: `thinking` is derived from the
 *  caller's config by `deriveEventHorizonState` below, and an explicit entry
 *  here (or in a caller's `states` prop) would override that — which is the
 *  escape hatch, not the default. */
export const EVENT_HORIZON_STATES: Record<'idle' | 'thinking', StateConfig<EventHorizonCfg>> = {
  idle: {},
  thinking: {},
}

/** how much of the caller's tail survives a `thinking` orbit */
const THINKING_TAIL = 0.9

/** Derive `thinking` from the caller's own config.
 *
 *  Untouched, because they are the identity of a disk: `colors`, `ring`,
 *  `nodes`, `shape`, `corner`, `lens`, `shadow`, `dir`. What varies is how
 *  fast it orbits and how agitated the stream is. */
export function deriveEventHorizonState(cfg: EventHorizonCfg, state: string): Partial<EventHorizonCfg> {
  if (state === 'thinking')
    return {
      duration: scaleDuration(cfg.duration, THINKING.durationScale),
      // shimmer IS this effect's restlessness: it drives the four desynced
      // oscillators that surge the tail and pulse the nodes
      shimmer: lift(cfg.shimmer, THINKING.restlessness),
      // a shorter stream at a quicker orbit reads as urgency; keeping the
      // caller's tail length at speed just smears
      tail: scale(cfg.tail, THINKING_TAIL),
      hover: 'none',
    }
  return {}
}

export const EVENT_HORIZON_PRESETS: Record<string, EventHorizonCfg> = {
  // Presets are ambient treatments. Their resting laps are intentionally
  // slower than the raw component default; derived states can still add
  // urgency without making every idle surface feel mechanically busy.
  Gargantua: { ...EVENT_HORIZON, duration: 10.5 },
  'Blue giant': {
    ...EVENT_HORIZON,
    colors: ['#7ab8ff', '#a5d8ff', '#5c7cff'],
    duration: 7.9,
    ring: 2.5,
    tail: 1.5,
    nodes: 11,
    blur: 16,
    halo: 1.1,
    shadow: 0.25,
    lens: 5,
  },
  'Ember disk': {
    ...EVENT_HORIZON,
    colors: ['#ff5e35', '#ffb347', '#ff7a4d'],
    duration: 14,
    ring: 1.5,
    tail: 2,
    nodes: 13,
    node: 0.9,
    shimmer: 0.7,
    blur: 12,
    halo: 0.8,
    shadow: 0.5,
    lens: 3,
    dir: -1,
  },
  'Violet quasar': {
    ...EVENT_HORIZON,
    colors: ['#b58cff', '#ff6ad5', '#7ab8ff'],
    duration: 5.3,
    ring: 3,
    tail: 0.9,
    nodes: 7,
    node: 1.35,
    blur: 18,
    halo: 1.3,
    shadow: 0.3,
    lens: 6,
  },
  Neutron: {
    ...EVENT_HORIZON,
    colors: ['#dff2ff', '#9ad9ff', '#ffffff'],
    duration: 3.2,
    ring: 1.5,
    tail: 1.6,
    nodes: 12,
    node: 0.8,
    shimmer: 0.85,
    blur: 9,
    halo: 1.15,
    shadow: 0.2,
    lens: 7,
  },
}

/* shared driver ------------------------------------------------------------ */
type HostRec = {
  el: HTMLElement
  cfg: EventHorizonCfg
  phase: number
  hovT: number
  hovC: number
  clk: number
  aspect: number
  hPx: number
  visible: boolean
}
const hostsSet = new Set<HostRec>()
let unsub: (() => void) | null = null

function tickAll(nowSec: number, dt: number) {
  hostsSet.forEach((rec) => {
    if (!rec.visible) return
    const { el, cfg } = rec
    const duration = Math.max(0.5, cfg.duration)
    const repeatDelay = Math.max(0, cfg.repeatDelay)
    rec.hovC += (rec.hovT - rec.hovC) * Math.min(1, dt * cfg.hoverEase)
    const hovC = rec.hovC
    rec.clk = (rec.clk || nowSec) + dt * (cfg.hover === 'speed' ? 1 + 1.5 * cfg.hoverAmount * hovC : 1)
    const time = rec.clk + rec.phase * duration
    const cycleTime = duration + repeatDelay
    const cycleT = time % cycleTime
    const ttr = cycleT < duration ? cycleT / duration : 1
    const corner = cfg.corner
    const aspect = rec.aspect
    const uHead = cfg.dir === -1 ? 1 - ttr : ttr
    let head = walkSmooth(uHead, corner, aspect)
    if (cfg.dir === -1) head = { ...head, dx: -head.dx, dy: -head.dy }
    const style = el.style
    const tangentSum = Math.abs(head.dx) + Math.abs(head.dy) || 1
    style.setProperty('--bx', head.x.toFixed(4))
    style.setProperty('--by', head.y.toFixed(4))
    style.setProperty('--dx', head.dx.toFixed(2))
    style.setProperty('--dy', head.dy.toFixed(2))
    style.setProperty('--adx', (Math.abs(head.dx) / tangentSum).toFixed(3))
    style.setProperty('--ady', (Math.abs(head.dy) / tangentSum).toFixed(3))
    // living tail: 4 desynced oscillators — nodes surge along the tail
    // (osc stretches their path lag) while pulsing in size (--bnK,
    // counter-phased). shimmer scales the whole dance.
    const shimmer = cfg.shimmer
    const osc: number[] = []
    for (let index = 1; index <= 4; index++) {
      const period = [1.33, 1.7, 1.51, 1.21][index - 1]!
      const wave = Math.sin(2 * Math.PI * (time / (duration * period)) + index * 1.6)
      osc.push(wave)
      style.setProperty(`--bs${index}`, (1 + 0.3 * shimmer * wave).toFixed(3))
      style.setProperty(`--bn${index}`, (1 - 0.35 * shimmer * wave).toFixed(3))
    }
    // independent tail: each micro-spot of the stream walks the SAME path at
    // its own lag (px converted to arc fraction via this host's perimeter),
    // so the whole smear bends around corners
    const perimeterPx = pathPx(corner, aspect, Math.max(1, rec.hPx))
    const nodeCount = Math.min(32, Math.max(2, Math.round(cfg.nodes)) * 2)
    for (let i = 1; i < nodeCount; i++) {
      const surge = 1 + 0.3 * shimmer * osc[i % 4]!
      const lag = ((6 + i * 7) * cfg.tail * surge) / perimeterPx
      const node = walkSmooth(uHead - cfg.dir * lag, corner, aspect)
      style.setProperty(`--tx${i}`, node.x.toFixed(4))
      style.setProperty(`--ty${i}`, node.y.toFixed(4))
    }
    const hov = cfg.hover === 'reveal' ? hovC : cfg.hover === 'boost' ? 1 + 0.8 * cfg.hoverAmount * hovC : 1
    style.setProperty('--hov', hov.toFixed(3))
    style.setProperty('--hovB', (cfg.hover === 'boost' ? 1 + 0.4 * cfg.hoverAmount * hovC : 1).toFixed(3))
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

export type EventHorizonProps = Partial<EventHorizonCfg> & {
  /** named state to apply (built-in EVENT_HORIZON_STATES or a key of
   *  `states`). `null` suppresses state resolution entirely. */
  state?: keyof typeof EVENT_HORIZON_STATES | (string & {}) | null
  states?: Record<string, StateConfig<EventHorizonCfg>>
  /** per-theme base config — merged over your flat props, under any named state */
  themes?: ThemeConfig<EventHorizonCfg>
  /** merged while hovered (mouse only), with or without a named state */
  whileHover?: Partial<EventHorizonCfg>
  /** merged while pressed — pointer or keyboard */
  whilePressed?: Partial<EventHorizonCfg>
  /** fade-in duration for rebuilt layers when config/state changes; 0 disables */
  transitionMs?: number
  theme?: Theme
  themeDetector?: (host: HTMLElement | null) => Theme
}

export function EventHorizon({
  state,
  states,
  themes,
  whileHover,
  whilePressed,
  transitionMs = 320,
  theme: explicitTheme,
  themeDetector,
  ...over
}: EventHorizonProps = {}) {
  const ref = useRef<HTMLSpanElement>(null)
  const theme = useTheme(ref, explicitTheme, themeDetector)
  const reducedMotion = useReducedMotion()
  const interaction = useInteraction(ref)

  const cfg = mergeConfig<EventHorizonCfg>({
    defaults: EVENT_HORIZON,
    props: over,
    themes,
    state,
    builtIns: EVENT_HORIZON_STATES,
    states,
    derive: deriveEventHorizonState,
    theme,
    interaction,
    whileHover,
    whilePressed,
    componentName: 'event-horizon',
  })
  useEffect(() => {
    const fx = ref.current,
      host = fx?.parentElement as HTMLElement | null
    if (!fx || !host) return
    // degenerate-input guards (same rationale as Ethereal's): an empty
    // palette crashes trip() at layer-build time; NaN duration poisons the
    // orbit clock; an absurd tail/nodes/blur builds monster gradient strings
    // or layer boxes — configs can arrive from untrusted URL-shared links
    const num = (value: number, fallback: number, lo: number, hi: number) =>
      Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback
    const clamped: EventHorizonCfg = {
      ...cfg,
      colors: Array.isArray(cfg.colors) && cfg.colors.length ? cfg.colors : EVENT_HORIZON.colors,
      duration: num(cfg.duration, EVENT_HORIZON.duration, 0.5, 600),
      ring: num(cfg.ring, EVENT_HORIZON.ring, 0, 100),
      tail: num(cfg.tail, EVENT_HORIZON.tail, 0.1, 10),
      nodes: num(cfg.nodes, EVENT_HORIZON.nodes, 2, 16),
      node: num(cfg.node, EVENT_HORIZON.node, 0.1, 5),
      shimmer: num(cfg.shimmer, EVENT_HORIZON.shimmer, 0, 2),
      blur: num(cfg.blur, EVENT_HORIZON.blur, 0, 120),
      halo: num(cfg.halo, EVENT_HORIZON.halo, 0, 4),
      dist: num(cfg.dist, EVENT_HORIZON.dist, 0, 400),
      corner: num(cfg.corner, EVENT_HORIZON.corner, 0.05, 1.5),
      shadow: num(cfg.shadow, EVENT_HORIZON.shadow, 0, 1),
      lens: num(cfg.lens, EVENT_HORIZON.lens, 0, 60),
      hoverAmount: num(cfg.hoverAmount, EVENT_HORIZON.hoverAmount, 0, 10),
      hoverEase: num(cfg.hoverEase, EVENT_HORIZON.hoverEase, 0.1, 100),
    }
    checkHost(host, 'EventHorizon')
    const unclaim = claimHost(host, 'EventHorizon')
    fx.replaceChildren()
    // rebuilt layers fade in over `transitionMs` (same contract as Ethereal)
    if (transitionMs > 0 && !reducedMotion) {
      fx.style.opacity = '0'
      fx.style.transition = `opacity ${transitionMs}ms ease`
      // force a style flush so the 0 is actually committed — a single rAF
      // fires before style recalc and the transition would never run
      void fx.offsetWidth
      fx.style.opacity = '1'
    } else {
      fx.style.opacity = '1'
      fx.style.transition = ''
    }
    // anchor to the BORDER box (see Ethereal) and never clip — every layer
    // manages its own mask/clip
    const hostStyle = getComputedStyle(host)
    fx.style.inset = ''
    fx.style.top = `-${parseFloat(hostStyle.borderTopWidth) || 0}px`
    fx.style.right = `-${parseFloat(hostStyle.borderRightWidth) || 0}px`
    fx.style.bottom = `-${parseFloat(hostStyle.borderBottomWidth) || 0}px`
    fx.style.left = `-${parseFloat(hostStyle.borderLeftWidth) || 0}px`
    fx.style.overflow = 'visible'
    const radius = hostStyle.borderTopLeftRadius
    const clip = `inset(0 round ${radius})`
    const mk = (zIndex: string, parent?: HTMLElement) => {
      const layer = document.createElement('span')
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;border-radius:inherit'
      layer.style.zIndex = zIndex
      ;(parent ?? fx).appendChild(layer)
      return layer
    }
    const head = HEADS[0]
    // oriented ellipse dims via the normalized |tangent| blend; in 'round'
    // shape they collapse to a fixed circle so the glow silhouette never
    // swells or squashes through corners — same fix as Ethereal's spot.
    const isRound = clamped.shape === 'round'
    const orientW = (width: number, height: number) =>
      isRound
        ? `${((width + height) / 2).toFixed(0)}px`
        : `calc(${width}px * var(--adx,1) + ${height}px * var(--ady,0))`
    const orientH = (width: number, height: number) =>
      isRound
        ? `${((width + height) / 2).toFixed(0)}px`
        : `calc(${height}px * var(--adx,1) + ${width}px * var(--ady,0))`
    // doppler tail: colored veil ON TOP of the white-hot head, then a DENSE
    // chain of micro-spots lagging behind along the path (--txN/--tyN set
    // per-frame). Spacing ~7px — under the spot radius — so the glow blur
    // fuses them into one continuous smear that genuinely bends around
    // corners. Each surges along the tail and pulses in size; `shimmer`
    // scales how much of that motion shows.
    const nodePairs = Math.max(2, Math.round(clamped.nodes))
    const nodeCount = Math.min(32, nodePairs * 2)
    const nodeScale = clamped.node
    // `inset` is the layer's outward inset: gradient fractions must map to the
    // ELEMENT border, not the padded layer box, or the paint drifts away
    // from its mask as the head orbits (visible size shifts)
    const tail = (scale: number, alphaMul: number, inset = 0) => {
      const parts: string[] = []
      // color-on-top veil at the head — first background layer paints above
      const veil = trip(clamped.colors[0]!)
      parts.push(
        `radial-gradient(ellipse ${orientW(38 * scale * nodeScale, 26 * scale * nodeScale)} ${orientH(38 * scale * nodeScale, 26 * scale * nodeScale)} at ${pos(inset, head.x)} ${pos(inset, head.y)}, rgba(${veil},${(0.55 * alphaMul).toFixed(2)}) 0%, rgba(${veil},${(0.2 * alphaMul).toFixed(2)}) 45%, transparent 100%)`
      )
      for (let i = 0; i < nodeCount; i++) {
        const shrink = 1 - 0.6 * (i / nodeCount)
        const width = 26 * shrink * scale * nodeScale,
          height = 20 * shrink * scale * nodeScale
        // the taper lands on EXACTLY 0 at the last node — a nonzero node
        // crossing the reveal window's edge pops instead of dissolving
        const alpha =
          i === 0
            ? 1
            : i === 1
              ? 0.75 * alphaMul
              : 0.55 * Math.pow(Math.max(0, 1 - (i + 1) / nodeCount), 1.15) * alphaMul
        // head + first trailer white-hot, then the palette cycles down the chain
        const col =
          i < 2
            ? `rgba(255,255,255,${alpha.toFixed(2)})`
            : `rgba(${trip(clamped.colors[Math.floor((i - 2) / 2) % clamped.colors.length]!)},${alpha.toFixed(2)})`
        const pulse = (i % 4) + 1
        const ax = i === 0 ? pos(inset, head.x) : pos(inset, `var(--tx${i},.5)`)
        const ay = i === 0 ? pos(inset, head.y) : pos(inset, `var(--ty${i},.5)`)
        parts.push(
          `radial-gradient(ellipse calc(${orientW(width, height)} * var(--bn${pulse},1)) calc(${orientH(width, height)} * var(--bn${pulse},1)) at ${ax} ${ay}, ${col} 0%, transparent 100%)`
        )
      }
      return parts.join(', ')
    }
    // reveal window around the head — wide enough for the full tail reach
    // AT PEAK SURGE (the driver's surge oscillator stretches lags by up to
    // 1 + 0.3·shimmer; sizing for the unsurged reach lets surging nodes
    // exit the window and pop at its edge)
    const maxOff = (6 + (nodeCount - 1) * 7) * clamped.tail * (1 + 0.3 * clamped.shimmer) + 40
    const spotEH = (inset: number, scale: number) =>
      `radial-gradient(ellipse ${orientW(130 * scale + maxOff, 110 * scale)} ${orientH(130 * scale + maxOff, 110 * scale)} at ${pos(inset, head.x)} ${pos(inset, head.y)}, #fff 0%, rgba(255,255,255,0.5) 55%, transparent 100%)`
    // gravitational lens — graduated: three nested backdrop-filter annuli
    // whose blurs STACK where they overlap, so the smear compounds right at
    // the rim (with a bright light-pileup) and relaxes outward. Reads as the
    // page being pulled toward the hole, not a frosted band.
    let lensRO: ResizeObserver | null = null
    if (clamped.lens > 0) {
      const bands = [
        {
          width: 10,
          blur: clamped.lens * 1.7,
          extra: ' brightness(1.14) saturate(1.45)',
        },
        {
          width: 20,
          blur: clamped.lens * 0.9,
          extra: ' brightness(1.05) saturate(1.2)',
        },
        { width: 34, blur: clamped.lens * 0.35, extra: '' },
      ]
      const annuli: { el: HTMLElement; width: number }[] = []
      for (const annulus of bands) {
        const lens = mk('0')
        lens.style.inset = `-${annulus.width}px`
        const backdrop = `blur(${annulus.blur.toFixed(1)}px)${annulus.extra}`
        Object.assign(lens.style, {
          padding: `${annulus.width}px`,
          backdropFilter: backdrop,
          webkitBackdropFilter: backdrop,
          // annulus mask: content-box xor leaves only the outer band active
          webkitMask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
          webkitMaskComposite: 'xor',
          mask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
          maskComposite: 'exclude',
        })
        annuli.push({ el: lens, width: annulus.width })
      }
      // the annuli carry absolute px radii, so a percentage host radius
      // ('50%') must be re-resolved against the CURRENT box on every resize
      // — a mount-time value leaves the lens hugging the old corners
      const setLensRadii = () => {
        const rPx = radiusPx(radius, host)
        for (const { el: lens, width } of annuli)
          lens.style.borderRadius = `${rPx + width}px`
      }
      setLensRadii()
      lensRO = new ResizeObserver(setLensRadii)
      lensRO.observe(host)
    }
    // photon ring — the thin rim of lensed light circling the shape.
    // Not a static shadow: a border-ring gradient anchored to the head,
    // hottest where the disk passes and falling off around the perimeter,
    // its whole intensity breathing on a shimmer oscillator.
    const rimColor = trip(clamped.colors[0]!)
    const photonRing = mk('2')
    Object.assign(photonRing.style, {
      padding: '1.5px',
      background: [
        `radial-gradient(ellipse ${orientW(120, 90)} ${orientH(120, 90)} at ${pos(0, head.x)} ${pos(0, head.y)}, rgba(255,255,255,0.75) 0%, transparent 100%)`,
        `radial-gradient(ellipse ${orientW(210, 150)} ${orientH(210, 150)} at ${pos(0, head.x)} ${pos(0, head.y)}, rgba(${rimColor},0.95) 0%, rgba(${rimColor},0.35) 45%, rgba(${rimColor},0.07) 100%)`,
      ].join(', '),
      webkitMask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
      webkitMaskComposite: 'xor',
      mask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
      maskComposite: 'exclude',
      borderRadius: 'inherit',
      opacity: `calc(var(--bn3,1) * 0.8 * var(--hov,1))`,
    })
    // core shadow — the hole itself, always on, deepest at center
    const vignette = mk('1')
    Object.assign(vignette.style, {
      background: `radial-gradient(90% 100% at 50% 50%, rgba(0,0,0,${clamped.shadow}) 0%, rgba(0,0,0,${(clamped.shadow * 0.55).toFixed(2)}) 48%, transparent 78%)`,
      clipPath: clip,
    })
    // accretion ring — the lit border stretch with the tail colors
    const ring = mk('2')
    Object.assign(ring.style, {
      padding: `${clamped.ring}px`,
      background: tail(1, 1.15),
      webkitMask: `${spotEH(0, 1)}, linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
      webkitMaskComposite: 'source-in, xor',
      mask: `${spotEH(0, 1)}, linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
      maskComposite: 'intersect, exclude',
      clipPath: clip,
      opacity: `calc(var(--hov,1) * 1.2)`,
      filter: `brightness(var(--hovB,1))`,
    })
    // halo — the lensed glow escaping past the edge. The layer box must hold
    // the full painted reach (tail nodes sit ON the border, so their radius
    // + node size extends outward) PLUS the blur tail — an undersized box
    // clips the gaussian into visible straight edges at the layer boundary.
    const guardPx = Math.max(14, Math.ceil(clamped.blur * 2.2))
    const haloPad = Math.max(Math.ceil(44 + clamped.blur * 2 + clamped.dist + 26 * nodeScale), guardPx + 24)
    // edge-guard wrapper: fades the outer band to transparent AFTER the
    // blur, so nothing (node pulse peaks, huge blurs) can be hard-cut at
    // the layer box — same guarantee as Ethereal's external bloom
    const haloWrap = mk('3')
    haloWrap.style.inset = `-${haloPad}px`
    {
      const guardX = `linear-gradient(to right, transparent, #fff ${guardPx}px, #fff calc(100% - ${guardPx}px), transparent)`
      const guardY = `linear-gradient(transparent, #fff ${guardPx}px, #fff calc(100% - ${guardPx}px), transparent)`
      Object.assign(haloWrap.style, {
        webkitMask: `${guardX}, ${guardY}`,
        webkitMaskComposite: 'source-in',
        mask: `${guardX}, ${guardY}`,
        maskComposite: 'intersect',
      })
    }
    const halo = mk('3', haloWrap)
    Object.assign(halo.style, {
      background: tail(1.5, 0.55, haloPad),
      webkitMask: spotEH(haloPad, 1.4),
      mask: spotEH(haloPad, 1.4),
      filter: `blur(${clamped.blur}px) brightness(var(--hovB,1))`,
      opacity: `calc(var(--hov,1) * ${clamped.halo})`,
    })
    // halo distance — push the whole halo layer radially outward along the
    // center→head direction; --bx/--by animate, so the offset turns with the
    // orbit and the glow hovers `dist`px off the border
    if (clamped.dist > 0) {
      halo.style.translate = `calc((${head.x} - .5) * ${2 * clamped.dist}px) calc((${head.y} - .5) * ${2 * clamped.dist}px)`
    }

    // reveal starts hidden; other modes at full
    host.style.setProperty('--hov', clamped.hover === 'reveal' ? '0' : '1')

    if (reducedMotion) {
      // static frame: no ticker/pointer events — reveal's --hov 0 would stay
      // 0 forever and hide every layer
      host.style.setProperty('--hov', '1')
      return () => {
        unclaim()
        lensRO?.disconnect()
      }
    }
    const rec: HostRec = {
      el: host,
      cfg: clamped,
      phase: nextPhase(),
      hovT: 0,
      hovC: 0,
      clk: 0,
      aspect: quantAspect(host.offsetWidth, host.offsetHeight),
      hPx: Math.max(1, host.offsetHeight),
      visible: true,
    }
    const metricsRO = new ResizeObserver(() => {
      rec.aspect = quantAspect(host.offsetWidth, host.offsetHeight)
      rec.hPx = Math.max(1, host.offsetHeight)
    })
    metricsRO.observe(host)
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) rec.visible = entry.isIntersecting
      },
      { rootMargin: '160px' }
    )
    io.observe(host)
    const enter = () => {
      rec.hovT = 1
    }
    const leave = () => {
      rec.hovT = 0
    }
    host.addEventListener('pointerenter', enter)
    host.addEventListener('pointerleave', leave)
    addHost(rec)
    return () => {
      unclaim()
      lensRO?.disconnect()
      metricsRO.disconnect()
      io.disconnect()
      host.removeEventListener('pointerenter', enter)
      host.removeEventListener('pointerleave', leave)
      removeHost(rec)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cfg), transitionMs, reducedMotion])
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

/* Wrapper variant — see EtherealWrap for when to use it. */
export function EventHorizonWrap({
  children,
  style,
  className,
  ...over
}: EventHorizonProps & {
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <span
      className={className}
      style={{
        position: 'relative',
        isolation: 'isolate',
        display: 'inline-block',
        ...style,
      }}
    >
      <span style={{ position: 'relative', zIndex: 10, display: 'block' }}>{children}</span>
      <EventHorizon {...over} />
    </span>
  )
}

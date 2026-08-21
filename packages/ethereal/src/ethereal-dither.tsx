// EtherealDither — the travelling-light comet rendered as DIGITAL DITHERED
// BLOCKS: a canvas at one-pixel-per-cell resolution, upscaled with
// image-rendering:pixelated, intensity quantized through a Bayer 4×4 matrix.
// Same host contract and shared ticker as the other effects.
'use client'
import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { AUDIO, THINKING, damp, lift, scale, scaleDuration, tightenPulse } from './core/derive'
import { pathFractionAt, pathPx, walkSmooth } from './core/path'
import { mergeConfig, useInteraction, type StateConfig, type ThemeConfig } from './core/state'
import { subscribe } from './core/ticker'
import { useReducedMotion, useTheme, type Theme } from './core/theme'
import { EASE, TravelEase, checkHost, claimHost, nextPhase, radiusPx, trip } from './core/util'

export type EtherealDitherCfg = {
  colors: string[]
  path: 'around' | 'bottom'
  /** which side of the border the blocks paint on */
  place: 'both' | 'internal' | 'external'
  duration: number
  repeatDelay: number
  heads: 1 | 2
  spin: 'same' | 'counter'
  /** px size of one block cell */
  block: number
  /** glow radius around the head, px */
  reach: number
  /** border band thickness the glow hugs, px */
  band: number
  /** intensity quantization steps (fewer = chunkier) */
  levels: number
  /** px the block grid extends past the host; 0 = auto (2 × band) */
  bleed: number
  /** superellipse corner exponent for the path */
  corner: number
  strength: number
  travelEase: TravelEase
  /** slow sine warp of the head's progress — hesitates and hurries */
  wander: number
  /** candle-like intensity jitter */
  flicker: number
  /** reach breathes between these multipliers */
  pulseMin: number
  pulseMax: number
  saturation: number
  brightness: number
  /** ± hue drift range, degrees */
  hueRange: number
  /** extra white-hot cores fanned along the path */
  hotspots: number
  /** px spacing between fanned cores */
  hotSpread: number
  hover: 'none' | 'boost'
  hoverAmount: number
}

export const ETHEREAL_DITHER: EtherealDitherCfg = {
  colors: ['#4285f4', '#9b72cb', '#d96570', '#9b72cb'],
  path: 'around',
  place: 'both',
  duration: 7,
  repeatDelay: 0,
  heads: 1,
  spin: 'same',
  block: 2,
  reach: 75,
  band: 6,
  levels: 4,
  bleed: 0,
  corner: 0.3,
  strength: 2,
  travelEase: 'linear',
  wander: 0,
  flicker: 0,
  pulseMin: 0.9,
  pulseMax: 1.15,
  saturation: 1.6,
  brightness: 1,
  hueRange: 6,
  hotspots: 1,
  hotSpread: 22,
  hover: 'boost',
  hoverAmount: 1,
}

/** Distance within the glow tube around an `around` path. Along-path distance
 * prevents a hotspot from shortcutting through a short host and appearing as
 * a reflected copy on the opposite edge. */
export function perimeterHotspotDistanceNormSq(
  pixelTravel: number,
  headTravel: number,
  perimeterPx: number,
  edgeDistance: number,
  reach: number,
) {
  const delta = Math.abs(pixelTravel - headTravel)
  const along = Math.min(delta, 1 - delta) * perimeterPx
  // `reach` is also the outward glow radius. On a short pill it can exceed
  // half the perimeter, so cap only its along-path influence; otherwise the
  // hotspot legitimately walks the path yet still reappears on the far edge.
  const alongReach = Math.min(reach, perimeterPx * 0.22)
  return (along / alongReach) ** 2 + (edgeDistance / reach) ** 2
}

/** The registry of state NAMES. Empty entries: `thinking` and `audio` are
 *  derived from the caller's config by `deriveEtherealDitherState` below. An
 *  explicit entry here (or in a caller's `states` prop) overrides the derived
 *  value key by key — the escape hatch for a preset the rule misreads. */
export const ETHEREAL_DITHER_STATES: Record<'idle' | 'thinking' | 'audio', StateConfig<EtherealDitherCfg>> = {
  idle: {},
  thinking: {},
  audio: {},
}

/** Derive `thinking` / `audio` from the caller's own config.
 *
 *  Untouched, because they are what makes a dither preset itself: `colors`,
 *  `path`, `place`, `block`, `levels`, `band`, `reach`, `corner`. The blocks
 *  stay the same size and chunkiness; only the temperament moves.
 *
 *  The canvas consumes the same audio custom properties as the CSS renderers:
 *  `--aud` lifts the field, `--ahot` expands the live core, and `--fb0..7`
 *  flow continuously around the perimeter instead of becoming rigid sectors. */
export function deriveEtherealDitherState(cfg: EtherealDitherCfg, state: string): Partial<EtherealDitherCfg> {
  if (state === 'thinking')
    return {
      duration: scaleDuration(cfg.duration, THINKING.durationScale),
      // wander hesitates and hurries the head; flicker is the candle jitter.
      // Together they are exactly "restless" for this renderer.
      wander: lift(cfg.wander, THINKING.restlessness),
      flicker: lift(cfg.flicker, THINKING.restlessness * 0.7),
      ...tightenPulse(cfg, THINKING.pulseTighten),
      hover: 'none',
    }
  if (state === 'audio')
    return {
      duration: scaleDuration(cfg.duration, AUDIO.durationScale),
      wander: damp(cfg.wander, AUDIO.steadiness),
      flicker: damp(cfg.flicker, AUDIO.steadiness),
      strength: scale(cfg.strength, AUDIO.presence),
      ...tightenPulse(cfg, AUDIO.pulseTighten),
    }
  return {}
}

// classic ordered-dither thresholds, normalized 0..1
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((threshold) => (threshold + 0.5) / 16))

// grid overhang: explicit bleed wins; 0 = auto, wide enough that the edge
// band's gaussian tail fades below the draw threshold before the canvas ends
const bleedOf = (cfg: EtherealDitherCfg) => {
  const band = Number.isFinite(cfg.band) ? Math.min(400, Math.max(2, cfg.band)) : 26
  const explicit = Number.isFinite(cfg.bleed) ? Math.min(400, Math.max(0, cfg.bleed)) : 0
  // 3× band: the quantizer rounds faint tails UP to the minimum visible
  // level, so the gaussian needs to be truly dead before the grid ends.
  // The auto value wears the same 400px ceiling as an explicit one — an
  // unbounded 3×band once let ?d={"band":1000} grow the grid by 6000px in
  // each axis before a single cell was painted
  return explicit > 0 ? explicit : Math.min(400, Math.ceil(3 * band))
}

export type EtherealDitherProps = Partial<EtherealDitherCfg> & {
  /** named state to apply (built-in ETHEREAL_DITHER_STATES or a key of
   *  `states`). `null` suppresses state resolution entirely. */
  state?: keyof typeof ETHEREAL_DITHER_STATES | (string & {}) | null
  states?: Record<string, StateConfig<EtherealDitherCfg>>
  /** per-theme base config — merged over your flat props, under any named state */
  themes?: ThemeConfig<EtherealDitherCfg>
  /** merged while hovered (mouse only), with or without a named state */
  whileHover?: Partial<EtherealDitherCfg>
  /** merged while pressed — pointer or keyboard */
  whilePressed?: Partial<EtherealDitherCfg>
  /** fade-in duration for the repainted canvas when config/state changes; 0 disables */
  transitionMs?: number
  theme?: Theme
  themeDetector?: (host: HTMLElement | null) => Theme
}

export function EtherealDither({
  state,
  states,
  themes,
  whileHover,
  whilePressed,
  transitionMs = 320,
  theme: explicitTheme,
  themeDetector,
  ...over
}: EtherealDitherProps = {}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useTheme(ref, explicitTheme, themeDetector)
  const reducedMotion = useReducedMotion()
  const interaction = useInteraction(ref)

  const cfg = mergeConfig<EtherealDitherCfg>({
    defaults: ETHEREAL_DITHER,
    props: over,
    themes,
    state,
    builtIns: ETHEREAL_DITHER_STATES,
    states,
    derive: deriveEtherealDitherState,
    theme,
    interaction,
    whileHover,
    whilePressed,
    componentName: 'ethereal-dither',
  })

  useEffect(() => {
    const canvas = ref.current
    const host = canvas?.parentElement as HTMLElement | null
    if (!canvas || !host) return
    const num = (value: number, fallback: number, lo: number, hi: number) =>
      Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback
    const clamped: EtherealDitherCfg = {
      ...cfg,
      colors: Array.isArray(cfg.colors) && cfg.colors.length ? cfg.colors : ETHEREAL_DITHER.colors,
      block: num(cfg.block, 6, 2, 64),
      reach: num(cfg.reach, 150, 8, 2000),
      band: num(cfg.band, 26, 2, 400),
      levels: num(cfg.levels, 4, 2, 16),
      bleed: bleedOf(cfg),
      corner: num(cfg.corner, 0.3, 0.05, 1.5),
      duration: num(cfg.duration, 6, 0.1, 600),
      strength: num(cfg.strength, 1, 0, 4),
      wander: num(cfg.wander, 0, 0, 2),
      flicker: num(cfg.flicker, 0, 0, 2),
      pulseMin: num(cfg.pulseMin, 0.9, 0.2, 3),
      pulseMax: num(cfg.pulseMax, 1.15, 0.2, 3),
      saturation: num(cfg.saturation, 1, 0, 3),
      brightness: num(cfg.brightness, 1, 0.2, 3),
      hueRange: num(cfg.hueRange, 0, 0, 360),
      hotspots: num(cfg.hotspots, 1, 1, 8),
      hotSpread: num(cfg.hotSpread, 22, 0, 400),
      hoverAmount: num(cfg.hoverAmount, 1, 0, 10),
    }
    checkHost(host, 'EtherealDither')
    const unclaim = claimHost(host, 'EtherealDither')
    const ctx = canvas.getContext('2d')
    if (!ctx) return unclaim

    const basePal = clamped.colors.map((col) => trip(col).split(',').map(Number) as [number, number, number])
    const rgb2hsl = ([red, green, blue]: [number, number, number]): [number, number, number] => {
      red /= 255
      green /= 255
      blue /= 255
      const max = Math.max(red, green, blue),
        min = Math.min(red, green, blue),
        light = (max + min) / 2
      if (max === min) return [0, 0, light]
      const delta = max - min
      const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min)
      const hue =
        max === red
          ? ((green - blue) / delta + (green < blue ? 6 : 0)) / 6
          : max === green
            ? ((blue - red) / delta + 2) / 6
            : ((red - green) / delta + 4) / 6
      return [hue, sat, light]
    }
    const hsl2rgb = ([hue, sat, light]: [number, number, number]): [number, number, number] => {
      if (!sat) {
        const gray = Math.round(light * 255)
        return [gray, gray, gray]
      }
      const upper = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
      const lower = 2 * light - upper
      const channel = (hueFrac: number) => {
        const at = ((hueFrac % 1) + 1) % 1
        if (at < 1 / 6) return lower + (upper - lower) * 6 * at
        if (at < 1 / 2) return upper
        if (at < 2 / 3) return lower + (upper - lower) * (2 / 3 - at) * 6
        return lower
      }
      return [
        Math.round(channel(hue + 1 / 3) * 255),
        Math.round(channel(hue) * 255),
        Math.round(channel(hue - 1 / 3) * 255),
      ]
    }
    const palHSL = basePal.map(rgb2hsl)
    let pal = basePal
    if (clamped.hueRange === 0 && (clamped.saturation !== 1 || clamped.brightness !== 1)) {
      // static sat/bright — bake once
      pal = palHSL.map(([hue, sat, light]) =>
        hsl2rgb([hue, Math.min(1, sat * clamped.saturation), Math.min(1, light * clamped.brightness)]),
      )
    }

    // grid metrics — canvas is ONE PIXEL PER CELL, CSS scales it up
    let cols = 1
    let rows = 1
    let hostW = 1
    let hostH = 1
    let aspect = 3
    let radius = 0
    let edgeWeights = new Float32Array(1)
    let edgeDistances = new Float32Array(1)
    let perimeterPositions = new Float32Array(1)
    // cells are written straight into an ImageData buffer — building an
    // rgba() string + fillRect per painted cell (the old path) dominated the
    // frame at fine block sizes
    let img = ctx.createImageData(1, 1)
    let pixels = img.data
    // one grid cell costs three Float32Array slots + four ImageData bytes,
    // and (on the 'around' path) a 25-segment inverse-path search per cell
    // at every resize. The budget bounds a hostile band/block/bleed combo —
    // or just a huge host — to a few MB and a few million loop iterations by
    // coarsening the block size instead of allocating whatever the config
    // implies. 500k cells ≈ 7× a full-screen host at the default block.
    const MAX_CELLS = 500_000
    let blockPx = clamped.block
    const resize = () => {
      hostW = Math.max(1, host.offsetWidth)
      hostH = Math.max(1, host.offsetHeight)
      // follow the host's real silhouette — resolve border-radius (handles
      // '50%' pills) and clamp to the capsule limit
      radius = Math.min(radiusPx(getComputedStyle(host).borderTopLeftRadius, host), Math.min(hostW, hostH) / 2)
      aspect = Math.max(0.5, Math.min(8, Math.round((hostW / hostH) * 4) / 4))
      const gridW = hostW + 2 * clamped.bleed
      const gridH = hostH + 2 * clamped.bleed
      blockPx = Math.max(clamped.block, Math.ceil(Math.sqrt((gridW * gridH) / MAX_CELLS)))
      cols = Math.max(1, Math.ceil(gridW / blockPx))
      rows = Math.max(1, Math.ceil(gridH / blockPx))
      canvas.width = cols
      canvas.height = rows
      img = ctx.createImageData(cols, rows)
      pixels = img.data
      edgeWeights = new Float32Array(cols * rows)
      edgeDistances = new Float32Array(cols * rows)
      perimeterPositions = new Float32Array(cols * rows)
      // Geometry is stable until the host/config resizes. Cache the silhouette
      // and inverse path here instead of doing powers + atan2 for every cell on
      // every animation frame.
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const px = (gx + 0.5) * blockPx - clamped.bleed
          const py = (gy + 0.5) * blockPx - clamped.bleed
          const qx = Math.abs(px - hostW / 2) - (hostW / 2 - radius)
          const qy = Math.abs(py - hostH / 2) - (hostH / 2 - radius)
          const ox = Math.max(qx, 0)
          const oy = Math.max(qy, 0)
          const sdf = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - radius
          const inside = sdf < 0
          const cell = gy * cols + gx
          const allowed = clamped.place === 'internal' ? inside : clamped.place === 'external' ? !inside : true
          const dEdge = Math.abs(sdf)
          edgeDistances[cell] = dEdge
          edgeWeights[cell] = allowed ? Math.exp(-((dEdge / clamped.band) ** 2)) : 0
          if (clamped.path === 'around')
            perimeterPositions[cell] = pathFractionAt(px / hostW, py / hostH, clamped.corner, aspect)
        }
      }
    }
    resize()
    // resize() reassigns canvas.width, which blanks the bitmap — so a config
    // change starts from an empty canvas and the first repaint lands on the
    // next tick. Fading the element in over `transitionMs` from there is the
    // same contract Ethereal gives its rebuilt layers.
    if (transitionMs > 0 && !reducedMotion) {
      canvas.style.opacity = '0'
      canvas.style.transition = `opacity ${transitionMs}ms ease`
      // force a style flush so the 0 is committed before the 1 — otherwise
      // the two writes coalesce and no transition ever runs
      void canvas.offsetWidth
      canvas.style.opacity = '1'
    } else {
      canvas.style.opacity = '1'
      canvas.style.transition = ''
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    let visible = true
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible = entry.isIntersecting
      },
      { rootMargin: '160px' },
    )
    io.observe(host)

    let hovT = 0
    let hovC = 0
    const enter = () => {
      hovT = 1
    }
    const leave = () => {
      hovT = 0
    }
    host.addEventListener('pointerenter', enter)
    host.addEventListener('pointerleave', leave)

    const phase = nextPhase()

    const headPx = (travel: number): [number, number] => {
      if (clamped.path === 'bottom') {
        const sweep = travel < 0.5 ? travel * 2 : (1 - travel) * 2
        return [(0.06 + 0.88 * sweep) * hostW, hostH]
      }
      const point = walkSmooth(travel, clamped.corner, aspect)
      return [point.x * hostW, point.y * hostH]
    }

    const draw = (time: number, dt: number) => {
      // attachAudio writes directly on the host. Reading the inline custom
      // properties avoids a computed-style/layout read in this full-canvas hot
      // path while still letting audio retune an already-mounted renderer.
      const audioVar = (name: string) => {
        const value = Number.parseFloat(host.style.getPropertyValue(name))
        return Number.isFinite(value) ? Math.max(0.2, value) : 1
      }
      const audioGlow = audioVar('--aud')
      const audioHotspot = audioVar('--ahot')
      const audioBands = Array.from({ length: 8 }, (_unused, band) => audioVar(`--fb${band}`))
      hovC += (hovT - hovC) * Math.min(1, dt * 8)
      const boost = clamped.hover === 'boost' ? 1 + 0.7 * clamped.hoverAmount * hovC : 1
      const duration = clamped.duration
      const repeatDelay = Math.max(0, clamped.repeatDelay)
      const cycleTime = duration + repeatDelay
      const cycleT = (time + phase * duration) % cycleTime
      let progress = cycleT < duration ? cycleT / duration : 1
      if (clamped.wander)
        progress = (((progress + 0.1 * clamped.wander * Math.sin((2 * Math.PI * time) / (duration * 2.6))) % 1) + 1) % 1
      const travel = (EASE[clamped.travelEase] || EASE.linear)(progress)
      // per-frame hue drift — rebuild the (tiny) palette from HSL
      if (clamped.hueRange > 0) {
        const shift = ((clamped.hueRange * Math.sin(2 * Math.PI * (time / 12))) / 360) % 1
        pal = palHSL.map(([hue, sat, light]) =>
          hsl2rgb([hue + shift, Math.min(1, sat * clamped.saturation), Math.min(1, light * clamped.brightness)]),
        )
      }
      const baseTravels = [travel]
      if (clamped.heads === 2) baseTravels.push(clamped.spin === 'counter' ? 1 - travel : (travel + 0.5) % 1)
      // cores carry their own flicker weight + wander drift — a cluster
      // shimmers and strays as individuals, not one welded object
      const heads: [number, number, number, number][] = []
      const coreCount = Math.max(1, Math.round(clamped.hotspots))
      const perimeterPx = clamped.path === 'around' ? pathPx(clamped.corner, aspect, hostH) : 2 * (hostW + hostH)
      const flickerAmp = clamped.flicker > 0 ? clamped.flicker : coreCount > 1 ? 0.35 : 0
      for (const baseTravel of baseTravels)
        for (let core = 0; core < coreCount; core++) {
          const wobble =
            coreCount > 1 || clamped.wander > 0
              ? (6 + 30 * clamped.wander) *
                Math.sin((2 * Math.PI * time) / (duration * (1.7 + 0.29 * core)) + core * 2.3)
              : 0
          const off = clamped.hotSpread * (core - (coreCount - 1) / 2) + wobble
          const coreFlicker =
            1 +
            flickerAmp *
              (0.3 *
                Math.sin(time * (8.3 + 1.1 * core) + core * 5.1) *
                Math.sin(time * (4.7 + 0.6 * core) + core * 2.3))
          const headTravel = (((baseTravel + off / perimeterPx) % 1) + 1) % 1
          const [hx, hy] = headPx(headTravel)
          heads.push([hx, hy, coreFlicker, headTravel])
        }

      pixels.fill(0)
      const pMid = (clamped.pulseMin + clamped.pulseMax) / 2
      const pAmp = (clamped.pulseMax - clamped.pulseMin) / 2
      const pulse = pMid + pAmp * Math.sin(2 * Math.PI * (time / (duration * 1.33)))
      const flicker =
        1 +
        clamped.flicker *
          (0.32 * Math.sin(time * 9.7 + phase * 2.4) * Math.sin(time * 5.3 + phase) +
            0.14 * Math.sin(time * 23.1 + phase * 1.7))
      // The global envelope lifts the field, the hotspot envelope expands the
      // live core, and the spectrum flows continuously around the perimeter.
      // Interpolating neighbouring bands avoids eight rigid sectors that would
      // read as an equalizer pasted onto an otherwise organic glow.
      const reach = clamped.reach * boost * pulse * Math.sqrt(audioHotspot)
      const reach2 = reach ** 2
      // hot-loop locals — property lookups per cell add up at 10k+ cells.
      // blockPx, not clamped.block: resize() may have coarsened the grid to
      // stay inside the cell budget, and px math must match that grid
      const { bleed, levels } = clamped
      const block = blockPx
      const strength = clamped.strength * audioGlow
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          // cell center in host coords (grid is offset by the bleed)
          const px = (gx + 0.5) * block - bleed
          const py = (gy + 0.5) * block - bleed
          const cell = gy * cols + gx
          const dEdge = edgeDistances[cell]!
          const wEdge = edgeWeights[cell]!
          if (wEdge < 0.02) continue
          const perimeterPosition =
            clamped.path === 'around'
              ? perimeterPositions[cell]!
              : Math.atan2(py - hostH / 2, px - hostW / 2) / (2 * Math.PI) + 0.5
          const audioBandPos = perimeterPosition * audioBands.length
          const audioBandIndex = Math.floor(audioBandPos) % audioBands.length
          const audioBandMix = audioBandPos - Math.floor(audioBandPos)
          const audioBand =
            audioBands[audioBandIndex]! * (1 - audioBandMix) +
            audioBands[(audioBandIndex + 1) % audioBands.length]! * audioBandMix
          // strongest core wins — each contributes with its OWN flicker
          let gainBest = 0
          let distNorm = 1
          for (const [hx, hy, coreFlicker, headTravel] of heads) {
            const normalizedSq =
              clamped.path === 'around'
                ? perimeterHotspotDistanceNormSq(perimeterPosition, headTravel, perimeterPx, dEdge, reach)
                : ((px - hx) ** 2 + (py - hy) ** 2) / reach2
            if (normalizedSq > 1) continue
            const coreDist = Math.sqrt(normalizedSq)
            const gain = (1 - coreDist) ** 1.8 * coreFlicker
            if (gain > gainBest) {
              gainBest = gain
              distNorm = coreDist
            }
          }
          if (gainBest <= 0) continue
          // hard guarantee against canvas-edge cuts: whatever the params,
          // intensity ramps to zero over the last few cells of the grid
          const edgeCells = Math.min(gx, gy, cols - 1 - gx, rows - 1 - gy)
          const rim = Math.min(1, edgeCells / 3)
          const intensity = gainBest * wEdge * strength * boost * flicker * rim * audioBand
          if (intensity <= 0) continue
          const bay = BAYER[gy % 4]![gx % 4]!
          // Bayer-quantized alpha
          const quantized = Math.min(1, intensity) * levels
          let lvl = Math.floor(quantized)
          if (quantized - lvl > bay) lvl++
          if (!lvl) continue
          const alpha = lvl / levels
          // Ethereal character: the spotlight REVEALS multi-color stretches
          // laid out around the border (not EH-style doppler rings off the
          // head) — color follows the cell's perimeter position, drifting
          // slowly, with Bayer-dithered blends between adjacent colors.
          // The multiplier must be an INTEGER number of palette cycles or
          // the path wrap leaves no hard color seam down the element.
          const palPos = (perimeterPosition * pal.length * 2 + time * 0.12) % pal.length
          const lowIdx = Math.floor(palPos)
          const idx = (palPos - lowIdx > bay ? lowIdx + 1 : lowIdx) % pal.length
          let [red, green, blue] = pal[idx]!
          // hot head: white MELTS into the palette instead of sitting on top
          // as a hard disc — whiteness falls off smoothly and never reaches
          // pure white except the very center cells
          const wht = Math.max(0, 1 - distNorm / 0.32) ** 2 * 0.85
          if (wht > 0.01) {
            red = Math.round(red + (255 - red) * wht)
            green = Math.round(green + (255 - green) * wht)
            blue = Math.round(blue + (255 - blue) * wht)
          }
          const pixelIndex = (gy * cols + gx) * 4
          pixels[pixelIndex] = red
          pixels[pixelIndex + 1] = green
          pixels[pixelIndex + 2] = blue
          pixels[pixelIndex + 3] = Math.round(alpha * 255)
        }
      }
      ctx.putImageData(img, 0, 0)
    }

    if (reducedMotion) {
      draw(clamped.duration * 0.13, 0)
      // resizing reassigns canvas.width (which clears it) — repaint the
      // static frame or any layout change blanks the effect forever
      const roStatic = new ResizeObserver(() => draw(clamped.duration * 0.13, 0))
      roStatic.observe(host)
      return () => {
        roStatic.disconnect()
        unclaim()
        ro.disconnect()
        io.disconnect()
        host.removeEventListener('pointerenter', enter)
        host.removeEventListener('pointerleave', leave)
      }
    }

    // per-instance clock integrated from dt, exactly like the CSS renderers:
    // wall-clock `now` would keep the comet orbiting and the palette drifting
    // through a paused frame (the ticker pauses by sending dt = 0, not by
    // stopping), and would teleport the animation forward on resume
    // starts at 0: draw() applies this instance's `phase` stagger itself
    let clock = 0
    const unsub = subscribe((_now, dt) => {
      if (!visible || dt <= 0) return
      clock += dt
      draw(clock, dt)
    })
    return () => {
      unsub()
      unclaim()
      ro.disconnect()
      io.disconnect()
      host.removeEventListener('pointerenter', enter)
      host.removeEventListener('pointerleave', leave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cfg), transitionMs, reducedMotion])

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        inset: -bleedOf(cfg),
        width: `calc(100% + ${2 * bleedOf(cfg)}px)`,
        height: `calc(100% + ${2 * bleedOf(cfg)}px)`,
        pointerEvents: 'none',
        zIndex: 0,
        imageRendering: 'pixelated',
      }}
    />
  )
}

/* Wrapper form, same contract as EtherealWrap */
export function EtherealDitherWrap({
  children,
  style,
  className,
  ...over
}: EtherealDitherProps & {
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
      <EtherealDither {...over} />
    </span>
  )
}

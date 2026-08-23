// Playground config: presets, control definitions, diffing and code generation
// for both effects. Preset override objects are expressed in the package's
// canonical cfg field names (EtherealCfg / EventHorizonCfg) — the index.html
// playground uses shorthand aliases (soft→blendSoftness, blur→glowBlur,
// strokeW→strokeWidth, easeCurve→travelEase, breathe→breatheAmp,
// needleH→needleHeight, sat→saturation, bright→brightness, hoverAmt→hoverAmount,
// strokeO→strokeOpacity, innerO→innerOpacity, bloomO→bloomOpacity) —
// already mapped here.
import { parse as parseCssColor } from "culori"

import {
  ETHEREAL,
  ETHEREAL_DITHER,
  EVENT_HORIZON,
  EVENT_HORIZON_PRESETS,
} from "@theale/ethereal"
import type {
  EtherealCfg,
  EtherealDitherCfg,
  EventHorizonCfg,
  StateConfig,
} from "@theale/ethereal"

/** A preset is an override set for the FLAT config, optionally plus a `dark`
 *  branch. That asymmetry is the playground's editing model, not an accident:
 *  the flat config IS the light rendering (like Tailwind's base utilities) and
 *  `themes.dark` overrides it (like `dark:`). There is deliberately no `light`
 *  branch — it would be a second place to say the same thing, and the editor
 *  has no cell to show it in. */
export type EtherealOverrides = Partial<EtherealCfg> & {
  themes?: { dark?: Partial<EtherealCfg> }
}
export type EhOverrides = Partial<EventHorizonCfg>

/* ── Ethereal presets (mapped from index.html, canonical field names) ─────── */
/** Every preset reacts to hover by default. `hover` is the eased,
 *  ticker-driven reaction (smooth, per-frame) — distinct from the
 *  `whileHover`/`whilePressed` prop overlays, which rebuild layers with a
 *  crossfade. A preset that declares its own `hover` keeps it. Don't set both
 *  for the same effect: the two react on different curves and read as a
 *  double-take. */
const withHover = <T extends Record<string, unknown>>(
  presets: Record<string, T>
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(presets).map(([name, cfg]) => [
      name,
      { hover: "boost", ...cfg },
    ])
  )

/* ── light variants ───────────────────────────────────────────────────────
   The presets below are authored for a dark surface, because that is what
   they are: a glow. Rendered unchanged on white they very nearly disappear —
   a pale colour over white is white, and a wide soft blur over white is grey.

   So rather than ask every preset to be hand-tuned twice, ONE transform
   derives the light rendering from the dark one, and the original values
   become the `themes.dark` branch. Each factor below is doing a specific job:

     colours   deepened and re-saturated — the only change that matters much;
               a light-on-light glow has no contrast to work with
     blur      tightened — on white, spread reads as haze, not light
     inner     pulled back — the interior wash muddies a white surface
     stroke    lifted — the border ring is what survives on light, so lean on it
     bright    lowered — brightness > 1 pushes everything toward the background

   A preset that wants something else just declares `themes.dark` itself and
   this transform leaves it alone. */

/** Deepen and re-saturate one CSS colour for a light background. Handles the
 *  `#rgb`/`#rrggbb` and `rgb(r,g,b)` forms the presets actually use; anything
 *  else is returned untouched rather than mangled. */
function deepen(input: string, darken = 0.52, saturate = 1.4): string {
  let red: number, green: number, blue: number
  const hex = input.startsWith("#") ? input.slice(1) : null
  if (hex && (hex.length === 3 || hex.length === 6)) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : hex
    red = parseInt(full.slice(0, 2), 16)
    green = parseInt(full.slice(2, 4), 16)
    blue = parseInt(full.slice(4, 6), 16)
  } else {
    const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(input)
    if (!match) return input
    red = +match[1]
    green = +match[2]
    blue = +match[3]
  }
  const mean = (red + green + blue) / 3
  const push = (channel: number) =>
    Math.max(
      0,
      Math.min(255, Math.round((mean + (channel - mean) * saturate) * darken))
    )
  return `rgb(${push(red)},${push(green)},${push(blue)})`
}

/** Keys whose value depends on the surface. Everything else — path, timing,
 *  counts, geometry — is the preset's identity and must read identically in
 *  both themes, so it stays flat and is never duplicated into the branch. */
const THEME_DEPENDENT = [
  "colors",
  "glowBlur",
  "strokeOpacity",
  "innerOpacity",
  "bloomOpacity",
  "strength",
  "saturation",
  "brightness",
] as const

const cap = (value: number, max: number) => Math.min(value, max)
const round2 = (value: number) => Math.round(value * 100) / 100

/** Splits a dark-authored preset into a light flat base + a `themes.dark`
 *  branch carrying the original values. Presets that already declare a dark
 *  branch are passed through — they have opted out. */
const themed = (
  presets: Record<string, EtherealOverrides>
): Record<string, EtherealOverrides> =>
  Object.fromEntries(
    Object.entries(presets).map(([name, preset]) => {
      if (preset.themes) return [name, preset]
      const dark: Partial<EtherealCfg> = {}
      const light: EtherealOverrides = { ...preset }
      for (const key of THEME_DEPENDENT) {
        // fall back to the package default: the branch has to restore an
        // explicit value for every key the light side changes, or dark
        // silently inherits the light tuning
        const value = (preset[key] ?? ETHEREAL[key]) as never
        dark[key] = value
      }
      light.colors = (dark.colors as string[]).map((color) => deepen(color))
      light.glowBlur = round2((dark.glowBlur as number) * 0.6)
      light.strokeOpacity = round2(
        cap((dark.strokeOpacity as number) * 1.25, 2)
      )
      light.innerOpacity = round2((dark.innerOpacity as number) * 0.7)
      light.bloomOpacity = round2(cap((dark.bloomOpacity as number) * 1.1, 2))
      light.strength = round2(cap((dark.strength as number) * 1.25, 2))
      light.saturation = round2(cap((dark.saturation as number) * 1.3, 3))
      light.brightness = round2((dark.brightness as number) * 0.8)
      return [name, { ...light, themes: { dark } }]
    })
  )

const ETHEREAL_PRESETS_RAW: Record<string, EtherealOverrides> = {
  // These are ambient product effects, not progress indicators. Full laps
  // deliberately live on a slower clock; hover/state derivations can still
  // add urgency without making the resting surface feel busy.
  "Line (original)": { duration: 5.4 },
  "Dual sweep": {
    duration: 5.4,
    heads: 2,
    hotspots: 2,
    hotSpread: 24,
    trail: 1.2,
  },
  Orbit: {
    path: "around",
    duration: 14,
    needles: 10,
    hotspots: 2,
    hotSpread: 28,
    trail: 1.5,
    trailFade: 0.55,
    hover: "boost-speed",
  },
  "Dual orbit": {
    path: "around",
    heads: 2,
    spin: "counter",
    duration: 14.9,
    needles: 10,
    hotspots: 2,
    hotSpread: 26,
    trail: 1.4,
  },
  Comet: {
    path: "around",
    duration: 11.4,
    spotW: 150,
    spotH: 56,
    trail: 2.4,
    trailFade: 0.75,
    lead: 0.2,
    bloomOpacity: 1,
    needles: 8,
    hover: "boost-speed",
    hueRange: 8,
  },
  "Halo (external)": {
    place: "external",
    path: "around",
    duration: 14,
    bloomOpacity: 1,
    glowBlur: 10,
    hotspots: 2,
    hotSpread: 30,
    trail: 1.3,
  },
  "Halo + border": {
    place: "ext-border",
    path: "around",
    duration: 13.1,
    bloomOpacity: 1,
    glowBlur: 10,
    strokeOpacity: 1.3,
    hotspots: 2,
    hotSpread: 26,
    trail: 1.2,
  },
  "Pulse (breathe)": {
    path: "breathe",
    duration: 7.9,
    needles: 9,
    breatheAmp: 0.35,
    // breathe has no travelling head sweeping brightness past you, so the
    // same opacities that read on 'around' read as "off" here
    strokeOpacity: 1.05,
    innerOpacity: 0.6,
    bloomOpacity: 0.95,
  },
  "Gatecaster Orange": {
    colors: ["#ff5e35", "#ff8a3d", "#ffb347", "#ff5e35", "#ff7a4d"],
    duration: 6,
    needles: 6,
    needleHeight: 0.9,
    strokeOpacity: 1,
    innerOpacity: 0.55,
    bloomOpacity: 0.7,
    hueRange: 8,
  },
  "Silver mono": {
    colors: ["#dfe6f2", "#aebbd2", "#f2f6fc", "#c8d2e2"],
    path: "around",
    // Near-monochrome needs a slower, steadier orbit to read as an instrument
    // light rather than a desaturated copy of the colour presets.
    duration: 17.5,
    travelEase: "ease-in-out",
    wander: 0.08,
    spotW: 110,
    spotH: 56,
    trail: 1.7,
    trailFade: 0.6,
    needles: 6,
    needleHeight: 0.8,
    glowBlur: 10,
    // restrained, not absent: at 0.6/0.3/0.35 this preset was invisible on
    // the playground's own surface, which is not "subtle", it is broken
    strokeOpacity: 1,
    innerOpacity: 0.45,
    bloomOpacity: 0.6,
    strength: 1.1,
    hueRange: 0,
    pulseMin: 0.92,
    pulseMax: 1.12,
  },
  Ocean: {
    colors: [
      "rgb(100,80,220)",
      "rgb(60,120,255)",
      "rgb(80,100,200)",
      "rgb(130,70,255)",
      "rgb(70,130,255)",
    ],
    strokeOpacity: 1.1,
    innerOpacity: 0.65,
    hueRange: 10,
    hotspots: 2,
    hotSpread: 24,
    path: "around",
    // Long, tidal orbit: a little phase wander makes the cluster drift as a
    // current, instead of making this only the blue version of Sunset.
    duration: 15.2,
    travelEase: "ease-in-out",
    wander: 0.18,
    trail: 1.4,
    lead: 0.4,
    pulseMin: 0.88,
    pulseMax: 1.28,
  },
  Sunset: {
    colors: [
      "rgb(255,100,60)",
      "rgb(255,180,50)",
      "rgb(255,140,70)",
      "rgb(255,80,80)",
      "rgb(255,200,60)",
    ],
    strokeOpacity: 1.1,
    innerOpacity: 0.65,
    hueRange: 10,
    // A paired warm sweep reads as two weather fronts passing each other,
    // rather than another single palette swap on the default orbit.
    heads: 2,
    path: "bottom",
    duration: 11,
    hotspots: 2,
    hotSpread: 26,
    trail: 1.8,
    trailFade: 0.5,
  },
  Ember: {
    colors: ["#ff5e35", "#ff8a3d", "#ffb347", "#ff7a4d"],
    duration: 9.1,
    spotW: 100,
    spotH: 56,
    blendSoftness: 0.8,
    travelEase: "ease-in-out",
    flicker: 0.65,
    wander: 0.3,
    needles: 5,
    needleHeight: 0.7,
    glowBlur: 13,
    pulseMin: 0.55,
    pulseMax: 1.6,
    strokeOpacity: 0.95,
    innerOpacity: 0.4,
    bloomOpacity: 1.15,
    hueRange: 6,
    hotspots: 2,
    hotSpread: 30,
  },
  Aurora: {
    colors: [
      "rgb(80,220,180)",
      "rgb(90,140,255)",
      "rgb(160,90,255)",
      "rgb(60,200,230)",
    ],
    path: "around",
    duration: 15.8,
    spotW: 140,
    spotH: 80,
    blendSoftness: 1.2,
    wander: 0.8,
    needles: 12,
    needleHeight: 1.3,
    glowBlur: 16,
    pulseMin: 0.7,
    pulseMax: 1.5,
    strokeOpacity: 0.8,
    innerOpacity: 0.5,
    bloomOpacity: 0.7,
    hueRange: 40,
    hotspots: 3,
    hotSpread: 36,
    trail: 2,
    lead: 0.6,
    trailFade: 0.35,
  },
  Candle: {
    colors: ["#ffb347", "#ff8a3d", "#ffd98a"],
    duration: 12.3,
    spotW: 96,
    spotH: 70,
    blendSoftness: 1.1,
    // Linear travel avoids an idle-looking start. The renderer's shorter edge
    // envelope halves the gap without speeding this calm single-head lap up.
    travelEase: "linear",
    flicker: 0.9,
    wander: 0.45,
    needles: 3,
    needleHeight: 1.4,
    glowBlur: 11,
    pulseMin: 0.7,
    pulseMax: 1.35,
    strokeOpacity: 0.85,
    innerOpacity: 0.5,
    bloomOpacity: 1.1,
    hueRange: 5,
    hotspots: 2,
    hotSpread: 20,
  },
  "Assistant prompt": {
    colors: ["#4285f4", "#9b72cb", "#d96570", "#9b72cb"],
    path: "around",
    place: "both",
    duration: 14,
    spotW: 220,
    spotH: 120,
    spotBlur: 4,
    blendSoftness: 1.6,
    glowBlur: 18,
    needles: 16,
    needleHeight: 0.7,
    breatheAmp: 0.35,
    pulseMin: 0.92,
    pulseMax: 1.22,
    wander: 0.15,
    strokeOpacity: 0.72,
    innerOpacity: 0.28,
    bloomOpacity: 0.75,
    hueRange: 6,
    hotspots: 2,
    hotSpread: 54,
    trail: 2.2,
    trailFade: 0.3,
  },
  "Intelligence halo": {
    colors: ["#ff6f91", "#ff9671", "#ffc75f", "#d65db1", "#845ec2"],
    path: "around",
    place: "both",
    duration: 14.9,
    spotW: 150,
    spotH: 80,
    blendSoftness: 1.3,
    glowBlur: 16,
    needles: 9,
    // Keep the exterior filaments subordinate to the brighter border trace.
    needleHeight: 0.75,
    strokeOpacity: 0.9,
    innerOpacity: 0.5,
    bloomOpacity: 0.72,
    hueRange: 25,
    hotspots: 3,
    hotSpread: 40,
  },
  "Waveform (static)": {
    colors: ["#4285f4", "#9b72cb", "#d96570", "#4285f4"],
    path: "static",
    duration: 7,
    needles: 18,
    needleHeight: 1.5,
    glowBlur: 10,
    blendSoftness: 1.15,
    strokeOpacity: 0.9,
    innerOpacity: 0.5,
    bloomOpacity: 0.9,
    pulseMin: 0.9,
    pulseMax: 1.2,
    hueRange: 8,
  },
  // A dense comb whose only motion is the per-band sway of the needles
  // themselves. `static` is the only path that draws a fixed row of waveform
  // needles, and here nothing else competes with it.
  "Visualizer (static)": {
    colors: ["#7ab8ff", "#a5d8ff", "#b58cff", "#ff8ad8"],
    path: "static",
    // slow, and a pulse that hardly breathes: a busier envelope would drown
    // out the band-by-band rise and fall that IS this preset
    duration: 15.8,
    pulseMin: 0.97,
    pulseMax: 1.06,
    wander: 0,
    flicker: 0,
    needles: 24,
    needleHeight: 1.45,
    glowBlur: 11,
    blendSoftness: 1.2,
    strokeOpacity: 0.95,
    innerOpacity: 0.45,
    bloomOpacity: 0.85,
    hueRange: 14,
  },
}

export const ETHEREAL_PRESETS = themed(withHover(ETHEREAL_PRESETS_RAW))

/** Preset select grouping for the Ethereal tab. Nineteen names in one flat list
 *  read as nineteen variations of the same thing; grouped, the list says what
 *  kind of choice each one is — a different MOTION, a different PLACEMENT, a
 *  different PALETTE over the same motion, or a worked product example. */
export const ETHEREAL_PRESET_GROUPS: { label: string; names: string[] }[] = [
  {
    label: "Motion",
    names: [
      "Line (original)",
      "Dual sweep",
      "Orbit",
      "Dual orbit",
      "Comet",
      "Pulse (breathe)",
      "Waveform (static)",
      "Visualizer (static)",
    ],
  },
  { label: "Placement", names: ["Halo (external)", "Halo + border"] },
  {
    label: "Palettes",
    names: [
      "Gatecaster Orange",
      "Silver mono",
      "Ocean",
      "Sunset",
      "Ember",
      "Aurora",
      "Candle",
    ],
  },
  {
    label: "Product examples",
    names: ["Assistant prompt", "Intelligence halo"],
  },
]

/* ── Event Horizon presets: normalize the package presets to override diffs ─ */
export const EH_PRESETS: Record<string, EhOverrides> = Object.fromEntries(
  Object.entries(EVENT_HORIZON_PRESETS).map(([name, cfg]) => [
    name,
    diffCfg(cfg, EVENT_HORIZON),
  ])
)

/* ── diffing ──────────────────────────────────────────────────────────────
   Returns the subset of `cfg` whose values differ from `base`. Arrays (colors)
   compared structurally. */
export function diffCfg<T extends Record<string, unknown>>(
  cfg: Partial<T>,
  base: T
): Partial<T> {
  const out: Partial<T> = {}
  for (const k of Object.keys(base) as (keyof T)[]) {
    if (!(k in cfg)) continue
    const a = cfg[k]
    const b = base[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = a
  }
  return out
}

/** Turn a preset into an explicit named-state entry — what "start this state
 *  from a preset" writes in the states editor.
 *
 *  Two things make this more than a spread.
 *
 *  It DIFFS, like every other write in this playground. A state that restated
 *  all sixty keys would render the amber "overrides base" markers meaningless
 *  (every row would carry one) and would bury which handful of values the
 *  state actually changes — the entire point of reading the cascade.
 *
 *  And it diffs each branch against the config THAT branch inherits. The base
 *  config is asymmetric here — the flat config IS light and `themes.dark`
 *  overrides it (see `EtherealOverrides`) — while a state's two branches are
 *  symmetric, so the dark branch is diffed against base+dark, not against base.
 *
 *  Keys where the preset agrees with the base drop out, and that is the right
 *  behaviour rather than a lossy one: those are exactly the keys where the
 *  package's DERIVED variation (`deriveEtherealState` and friends) should keep
 *  bending the value, because the state has no opinion about them. An explicit
 *  entry is a list of disagreements, not a snapshot.
 *
 *  `defaults` is required because a preset is an override set: a key it omits
 *  means "the package default", not "whatever the user currently has". */
export function presetStateEntry<T extends Record<string, unknown>>(
  preset: Partial<T> & { themes?: { dark?: Partial<T> } },
  defaults: T,
  base: T,
  baseDark?: Partial<T>
): StateConfig<T> {
  const { themes, ...flat } = preset
  const presetLight: T = { ...defaults, ...flat }
  const presetDark: T = { ...presetLight, ...themes?.dark }
  // the dark branch is diffed against what THAT branch inherits: the base
  // config with the editor's `themes.dark` override already on top of it
  const darkBase: T = { ...base, ...baseDark }
  const light = diffCfg(presetLight, base)
  const dark = diffCfg(presetDark, darkBase)
  const entry: StateConfig<T> = {}
  // empty branches are pruned, never stored as `{}` — the editor reads a
  // present branch as "this state carries config", which is what tells the
  // user they left the derived variation behind
  if (Object.keys(light).length) entry.light = { base: light }
  if (Object.keys(dark).length) entry.dark = { base: dark }
  return entry
}

/* ── control definitions ──────────────────────────────────────────────────*/
type BaseDef<TKey> = {
  key: TKey
  label: string
  /** renders a section header above this control when it starts a new group */
  group?: string
  /** renders a lighter divider+label above this control, INSIDE its section.
   *  `shape` alone runs fifteen controls covering three unrelated things, and
   *  `count`/`height` are ambiguous until you notice which cluster they follow.
   *  Subtitles label the clusters without splitting them into more
   *  collapsibles — you want to compare `width` against `trail` without
   *  opening two panels. */
  subgroup?: string
  /** plain-language explanation, shown in the ⓘ popover beside the label.
   *  Labels are truncated to a ~5rem column, so this is where the real
   *  meaning of a terse name like "sat ×" or "loop pause" lives. */
  hint?: string
}
export type SliderDef<TKey> = BaseDef<TKey> & {
  kind: "slider"
  min: number
  max: number
  step: number
}
export type SelectDef<TKey> = BaseDef<TKey> & {
  kind: "select"
  options: { value: string; label: string }[]
  /** numeric selects (e.g. heads, dir) store numbers, not strings */
  numeric?: boolean
}
export type SwitchDef<TKey> = BaseDef<TKey> & { kind: "switch" }
/** palette editor. The value is an array, so an override is whole-value —
 *  there is no partial-array merge in `resolveState`. */
type ColorsDef<TKey> = BaseDef<TKey> & {
  kind: "colors"
  min?: number
  max?: number
}

export type ControlDef<TKey> =
  SliderDef<TKey> | SelectDef<TKey> | SwitchDef<TKey> | ColorsDef<TKey>

/* ── control hints ────────────────────────────────────────────────────────
   Keyed by cfg field, not by tab: `duration`, `repeatDelay`, `colors` and friends
   appear in all three effect tables and must never drift into three slightly
   different explanations. Applied by `withHints` at export time. */
const HINTS: Record<string, string> = {
  /* color */
  colors:
    "Palette the effect cycles through — across blobs, needles and the doppler tail. Order matters: it reads head-to-tail.",
  gamut:
    "sRGB is safe everywhere. Display P3 lets wide-gamut screens push noticeably more vivid glows.",
  saturation:
    "Multiplies the palette's saturation before it hits the layers. Below 1 washes it toward white.",
  brightness:
    "Multiplies the palette's lightness. Raise it on dark backgrounds, lower it if the glow blows out.",
  hueRange:
    "How far the hue drifts along the trail, in degrees. 0 keeps every blob the palette's exact color.",

  /* motion */
  path: "Where the light travels. bottom = a sweep along the lower edge · around = the full perimeter · breathe = stationary pulse · static = fixed band with waveform needles.",
  heads: "One comet, or two travelling the path at once.",
  spin: "With two heads: same direction (opposite sides of the path) or counter-rotating (they meet and cross).",
  dir: "Orbit direction — clockwise or counter-clockwise.",
  duration:
    "Seconds for one full lap of the path. This is the knob for pace: raise it to slow the effect down.",
  repeatDelay:
    "Dead time after each lap before the next begins. Makes the effect less frequent rather than slower.",
  travelEase:
    "Easing applied to the head's progress along the path. linear holds constant speed; the others hurry and hesitate.",
  breatheAmp: "breathe path only: how far the pulse swells and shrinks.",
  flicker:
    "Candle-like noise on brightness. Small values read as life, large as a failing bulb.",
  wander:
    "A slow sine warping progress along the path — the head hesitates and hurries instead of tracking perfectly.",
  shimmer: "Periodic surge in the accretion stream's brightness.",

  /* shape */
  spotShape:
    "round keeps the spotlight a chain of circles that each follow the path, so it never stretches into an ellipse at corners. adaptive is cheaper.",
  shape:
    "round forces a fixed-circle silhouette through the corners; adaptive follows the element's actual box.",
  spotSamples:
    "round only: how many circles compose the chain. 0 picks a count from the width/height ratio.",
  trail: "Comet-tail length — spacing of the trailing circles behind the head.",
  lead: "Extends the chain ahead of the head too. 0 = pure tail, 1 = as long in front as behind.",
  trailFade: "How fast trail circles shrink and dim toward the tail end.",
  spotW: "Spotlight width in px — the lit stretch of path.",
  spotH:
    "Height of the light in px — scales the glow's paint (blobs, needles, relight bands) as well as the reveal window, so it reads as a beam, not a border strip.",
  heightMin:
    "Lower bound of the height breathing, ×spotH. The glow's off-border height swings organically between min and max.",
  heightMax:
    "Upper bound of the height breathing, ×spotH. Raise it to let the light surge tall before settling back.",
  blendSoftness:
    "Softness of the spotlight's mask edge. 0 is a hard cut, high values dissolve it into the background.",
  spotBlur: "Extra blur on the spotlight mask itself, on top of softness.",
  spotOffset:
    "Pushes the spotlight off the path, in px. Negative moves it inward.",
  hotspots:
    "Extra white-hot cores fanned along the path. Each walks the path on its own, so they scatter rather than move as a block.",
  hotSpread: "How far apart the hotspots fan out along the path.",
  needles: "Count of thin light needles standing off the border.",
  needleHeight: "Length multiplier for the needles.",
  needleJitter:
    "Randomizes needle heights every rebuild instead of an even comb — reads as thinking rather than metering.",
  reveal: "hover: reveal only — how much of the effect is hidden until hover.",
  pulseMin: "Low end of the brightness pulse.",
  pulseMax: "High end of the brightness pulse.",
  ring: "Thickness of the accretion ring.",
  tail: "Length of the plasma stream trailing the orbiting head.",
  nodes: "How many nodes make up the stream — density of the tail.",
  node: "Size multiplier for each stream node.",
  corner:
    "Superellipse corner exponent for the travel path. Lower is squarer, higher rounds the corners off.",
  block: "Dither cell size in px. Bigger blocks, chunkier picture.",
  levels:
    "Quantization steps in the dither. 2 is stark black/white; more steps read smoother.",
  reach: "How far the dithered glow spreads from the border, in px.",
  band: "Thickness of the dithered border band, in px.",
  bleed:
    "How far the dither grid overhangs the element, in px. Raise it if the glow clips at the edges.",

  /* glow */
  place:
    "Where the glow paints. internal stays inside the element; external and both paint outside it, and any ancestor with overflow hidden will clip that.",
  strokeWidth: "Width of the lit border ring, in px.",
  glowBlur:
    "Blur radius on the glow layers. The main cost knob — high values are expensive on large elements.",
  blur: "Blur radius on the halo.",
  strokeOpacity: "Opacity of the lit border ring.",
  innerOpacity: "Opacity of the interior color wash.",
  bloomOpacity: "Opacity of the white-hot bloom around the head.",
  halo: "Opacity of the lensed halo around the whole element.",
  dist: "Pushes the halo away from the border, in px.",
  lens: "Backdrop-filter lensing strength — bends what's behind the element. 0 turns it off (and skips the cost).",
  shadow: "Depth of the vignette darkening the element's center.",
  strength: "Overall intensity multiplier for the whole effect.",

  /* interaction */
  hover:
    "The eased, per-frame hover reaction. boost brightens · speed accelerates the lap · reveal fades the effect in · none opts out. Distinct from the whileHover state overlay, which rebuilds layers with a crossfade — don't use both on the same effect.",
  hoverAmount: "How far the hover reaction goes.",
  hoverEase:
    "How fast the hover reaction ramps in and out. Higher is snappier.",
}

const withHints = <TKey extends string>(
  ctls: ControlDef<TKey>[]
): ControlDef<TKey>[] =>
  ctls.map((c) => {
    const hint = HINTS[c.key as string]
    return hint ? { ...c, hint } : c
  })

type EK = keyof EtherealCfg
type HK = keyof EventHorizonCfg
type DK = keyof EtherealDitherCfg

const ETHEREAL_CONTROLS_RAW: ControlDef<EK>[] = [
  {
    kind: "colors",
    key: "colors",
    label: "colors",
    group: "color",
    subgroup: "palette",
  },
  {
    kind: "select",
    key: "gamut",
    label: "gamut",
    options: [
      { value: "srgb", label: "sRGB" },
      { value: "p3", label: "Display P3" },
    ],
  },
  {
    kind: "slider",
    key: "saturation",
    label: "sat",
    min: 0.4,
    max: 2,
    step: 0.05,
    subgroup: "tone",
  },
  {
    kind: "slider",
    key: "brightness",
    label: "bright",
    min: 0.6,
    max: 2,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "hueRange",
    label: "hue drift",
    min: 0,
    max: 60,
    step: 1,
  },
  {
    kind: "select",
    key: "path",
    label: "path",
    group: "motion",
    options: [
      { value: "bottom", label: "bottom" },
      { value: "around", label: "around" },
      { value: "breathe", label: "breathe" },
      { value: "static", label: "static" },
    ],
  },
  {
    kind: "select",
    key: "heads",
    label: "heads",
    numeric: true,
    options: [
      { value: "1", label: "single" },
      { value: "2", label: "dual" },
    ],
  },
  {
    kind: "select",
    key: "spin",
    label: "spin",
    options: [
      { value: "same", label: "same dir" },
      { value: "counter", label: "counter" },
    ],
  },
  {
    kind: "slider",
    key: "duration",
    label: "duration",
    min: 0.5,
    max: 20,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "repeatDelay",
    label: "loop pause",
    min: 0,
    max: 6,
    step: 0.1,
  },
  {
    kind: "select",
    key: "travelEase",
    label: "curve",
    options: [
      { value: "linear", label: "linear" },
      { value: "ease-in", label: "ease-in" },
      { value: "ease-out", label: "ease-out" },
      { value: "ease-in-out", label: "in-out" },
      { value: "back", label: "back" },
      { value: "bounce", label: "bounce" },
    ],
  },
  {
    kind: "slider",
    key: "breatheAmp",
    label: "breathe",
    min: 0,
    max: 0.8,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "flicker",
    label: "flicker",
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "wander",
    label: "wander",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    kind: "select",
    key: "spotShape",
    label: "shape",
    group: "shape",
    subgroup: "spotlight",
    options: [
      { value: "adaptive", label: "adaptive" },
      { value: "round", label: "round" },
    ],
  },
  {
    kind: "slider",
    key: "spotSamples",
    label: "samples",
    min: 0,
    max: 9,
    step: 1,
  },
  { kind: "slider", key: "spotW", label: "width", min: 20, max: 240, step: 1 },
  { kind: "slider", key: "spotH", label: "height", min: 20, max: 320, step: 1 },
  {
    kind: "slider",
    key: "heightMin",
    label: "height min",
    min: 0.2,
    max: 2,
    step: 0.05,
    subgroup: "height breathe",
  },
  {
    kind: "slider",
    key: "heightMax",
    label: "height max",
    min: 0.2,
    max: 4,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "blendSoftness",
    label: "softness",
    min: 0,
    max: 1.6,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "spotBlur",
    label: "spot blur",
    min: 0,
    max: 10,
    step: 0.5,
  },
  {
    kind: "slider",
    key: "spotOffset",
    label: "offset",
    min: -30,
    max: 30,
    step: 1,
  },
  {
    kind: "slider",
    key: "hotspots",
    label: "hotspots",
    min: 1,
    max: 5,
    step: 1,
  },
  {
    kind: "slider",
    key: "hotSpread",
    label: "hot spread",
    min: 0,
    max: 56,
    step: 1,
  },
  {
    kind: "slider",
    key: "trail",
    label: "trail",
    min: 0.2,
    max: 3,
    step: 0.1,
    subgroup: "trail",
  },
  {
    kind: "slider",
    key: "lead",
    label: "leading trail",
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "trailFade",
    label: "trail fade",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "needles",
    label: "count",
    min: 0,
    max: 24,
    step: 1,
    subgroup: "needles",
  },
  {
    kind: "slider",
    key: "needleHeight",
    label: "height",
    min: 0.3,
    max: 2,
    step: 0.1,
  },
  { kind: "switch", key: "needleJitter", label: "random" },
  {
    kind: "select",
    key: "place",
    label: "glow",
    group: "glow",
    subgroup: "layers",
    options: [
      { value: "internal", label: "internal" },
      { value: "external", label: "external" },
      { value: "ext-border", label: "ext + border" },
      { value: "both", label: "both" },
    ],
  },
  {
    kind: "slider",
    key: "strokeWidth",
    label: "border px",
    min: 0.5,
    max: 4,
    step: 0.5,
  },
  {
    kind: "slider",
    key: "glowBlur",
    label: "glow blur",
    min: 0,
    max: 24,
    step: 1,
  },
  {
    kind: "slider",
    key: "strokeOpacity",
    label: "stroke",
    min: 0,
    max: 1.7,
    step: 0.02,
    subgroup: "opacity",
  },
  {
    kind: "slider",
    key: "innerOpacity",
    label: "inner wash",
    min: 0,
    max: 1.2,
    step: 0.02,
  },
  {
    kind: "slider",
    key: "bloomOpacity",
    label: "bloom",
    min: 0,
    max: 1.6,
    step: 0.02,
  },
  {
    kind: "slider",
    key: "strength",
    label: "strength",
    min: 0.2,
    max: 2,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "pulseMin",
    label: "pulse min",
    min: 0.2,
    max: 1.5,
    step: 0.05,
    subgroup: "pulse",
  },
  {
    kind: "slider",
    key: "pulseMax",
    label: "pulse max",
    min: 0.5,
    max: 2.5,
    step: 0.05,
  },
  {
    kind: "select",
    key: "hover",
    label: "hover",
    group: "interaction",
    options: [
      { value: "none", label: "none" },
      { value: "boost", label: "boost" },
      { value: "speed", label: "speed" },
      { value: "boost-speed", label: "boost-speed" },
      { value: "reveal", label: "reveal" },
    ],
  },
  {
    kind: "slider",
    key: "hoverAmount",
    label: "amount",
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "hoverEase",
    label: "ramp",
    min: 1,
    max: 20,
    step: 0.5,
  },
  {
    kind: "slider",
    key: "reveal",
    label: "reveal",
    min: 0.4,
    max: 1.6,
    step: 0.05,
  },
]

export const ETHEREAL_CONTROLS = withHints(ETHEREAL_CONTROLS_RAW)

const EH_CONTROLS_RAW: ControlDef<HK>[] = [
  { kind: "colors", key: "colors", label: "colors", group: "color" },
  {
    kind: "select",
    key: "dir",
    label: "dir",
    numeric: true,
    group: "motion",
    options: [
      { value: "1", label: "cw" },
      { value: "-1", label: "ccw" },
    ],
  },
  {
    kind: "slider",
    key: "duration",
    label: "duration",
    min: 1,
    max: 20,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "repeatDelay",
    label: "loop pause",
    min: 0,
    max: 6,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "shimmer",
    label: "shimmer",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    kind: "select",
    key: "shape",
    label: "shape",
    group: "shape",
    options: [
      { value: "adaptive", label: "adaptive" },
      { value: "round", label: "round" },
    ],
  },
  { kind: "slider", key: "ring", label: "ring", min: 0.5, max: 5, step: 0.5 },
  { kind: "slider", key: "tail", label: "tail", min: 0.4, max: 2.5, step: 0.1 },
  { kind: "slider", key: "nodes", label: "nodes", min: 2, max: 16, step: 1 },
  {
    kind: "slider",
    key: "node",
    label: "nodeSize",
    min: 0.4,
    max: 2,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "corner",
    label: "corner",
    min: 0.15,
    max: 0.6,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "blur",
    label: "blur",
    min: 4,
    max: 24,
    step: 1,
    group: "glow",
  },
  { kind: "slider", key: "halo", label: "halo", min: 0, max: 1.6, step: 0.05 },
  { kind: "slider", key: "dist", label: "dist", min: 0, max: 24, step: 1 },
  { kind: "slider", key: "lens", label: "lens", min: 0, max: 8, step: 0.5 },
  {
    kind: "slider",
    key: "shadow",
    label: "shadow",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    kind: "select",
    key: "hover",
    label: "hover",
    group: "interaction",
    options: [
      { value: "none", label: "none" },
      { value: "boost", label: "boost" },
      { value: "speed", label: "speed" },
      { value: "reveal", label: "reveal" },
    ],
  },
  {
    kind: "slider",
    key: "hoverAmount",
    label: "hoverAmt",
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "hoverEase",
    label: "hoverEase",
    min: 1,
    max: 20,
    step: 0.5,
  },
]

/* ── code generation ──────────────────────────────────────────────────────*/
const inline = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map((item) => JSON.stringify(item)).join(", ")}]`
    : JSON.stringify(v)

/** Object props (`themes`, `states`) printed over several lines. On one line
 *  a `themes` branch is 300+ characters, and a `<pre>` whose longest line is
 *  300 characters has a 300-character min-content width — which, in a grid
 *  column, physically pushes the preview off the side of the page. Wrapping is
 *  not only nicer to read; it is what keeps the layout from blowing out. */
/** object keys must stay compilable TSX: a custom state named `error-state`
 *  or `2fa` is a perfectly legal map key but not a legal bare identifier —
 *  emitted unquoted it fails to parse the moment someone pastes the snippet */
const objKey = (key: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)

function fmtObj(value: Record<string, unknown>, indent: string): string {
  const body = Object.entries(value)
    .map(([key, item]) => {
      const rendered =
        item && typeof item === "object" && !Array.isArray(item)
          ? fmtObj(item as Record<string, unknown>, `${indent}  `)
          : inline(item)
      return `${indent}  ${objKey(key)}: ${rendered},`
    })
    .join("\n")
  return `{\n${body}\n${indent}}`
}

function fmtVal(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v)
  if (typeof v === "number") return `{${v}}`
  if (typeof v === "boolean") return v ? "" : "{false}"
  if (Array.isArray(v))
    return `{[${v.map((c) => JSON.stringify(c)).join(", ")}]}`
  if (v && typeof v === "object")
    return `{${fmtObj(v as Record<string, unknown>, "  ")}}`
  return `{${JSON.stringify(v)}}`
}

export function genCode(
  component: "Ethereal" | "EventHorizon" | "EtherealDither",
  overrides: Record<string, unknown>
): string {
  const entries = Object.entries(overrides)
  const importLine = `import { ${component} } from '@theale/ethereal'`
  const jsx =
    entries.length === 0
      ? `<button className="relative isolate">\n  <span className="relative z-10">…</span>\n  <${component} />\n</button>`
      : (() => {
          const props = entries
            .map(([k, v]) => {
              const rendered = fmtVal(v)
              return rendered === "" ? `  ${k}` : `  ${k}=${rendered}`
            })
            .join("\n")
          return `<button className="relative isolate">\n  <span className="relative z-10">…</span>\n  <${component}\n  ${props.replace(/\n/g, "\n  ")}\n  />\n</button>`
        })()
  return `${importLine}\n\n${jsx}`
}

/* ── search-param helpers ─────────────────────────────────────────────────*/
/** control table for each known base config, resolved by object identity.
 *  Built lazily: the EH/Dither tables are declared after this point in the
 *  module, so eagerly building the map here would read them mid-eval. */
let domainTables: Map<object, ControlDef<string>[]> | null = null
const domainsFor = (base: object): Map<string, ControlDef<string>> | null => {
  domainTables ??= new Map<object, ControlDef<string>[]>([
    [ETHEREAL, ETHEREAL_CONTROLS],
    [EVENT_HORIZON, EH_CONTROLS],
    [ETHEREAL_DITHER, DITHER_CONTROLS],
  ])
  const controls = domainTables.get(base)
  return controls
    ? new Map(controls.map((ctl) => [String(ctl.key), ctl]))
    : null
}

/** A shared-link string is a color only if the color library can parse it as
 *  one CSS `<color>`. That excludes `url(...)`, layered `a, b` lists and every
 *  other `background` shorthand trick — the swatch and the package both treat
 *  these as paint. */
const isCssColor = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 64 &&
  parseCssColor(value.trim()) !== undefined

export function parseOverrides<T extends Record<string, unknown>>(
  raw: string | Record<string, unknown> | undefined,
  base: T
): Partial<T> {
  if (!raw) return {}
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {}
    // keep only known keys whose value fits that control's real domain —
    // range for sliders, option membership for selects, parseable CSS
    // colors for palettes. A hostile shared link (?c={"needles":1e8},
    // ?c={"colors":["url(//evil)"]}, ?d={"band":1000}) must not reach the
    // animation clocks, the swatch styles, or the dither allocator.
    const domains = domainsFor(base)
    const out: Partial<T> = {}
    for (const k of Object.keys(base) as (keyof T)[]) {
      if (!(k in parsed)) continue
      const v = (parsed as Record<string, unknown>)[k as string]
      const bv = base[k]
      const ctl = domains?.get(k as string)
      if (ctl?.kind === "slider") {
        if (typeof v !== "number" || !Number.isFinite(v)) continue
        // clamp to the control's real range, not a blanket ±1000 — presets
        // deliberately sit anywhere inside it (including off the step grid,
        // e.g. glowBlur 4.8), so the grid is not enforced here
        out[k] = Math.max(ctl.min, Math.min(ctl.max, v)) as T[keyof T]
      } else if (ctl?.kind === "select") {
        const rendered =
          typeof v === "number" && Number.isFinite(v)
            ? String(v)
            : typeof v === "string"
              ? v
              : null
        if (typeof v !== typeof bv) continue
        if (rendered === null || !ctl.options.some((o) => o.value === rendered))
          continue
        out[k] = v as T[keyof T]
      } else if (ctl?.kind === "switch") {
        if (typeof v !== "boolean") continue
        out[k] = v as T[keyof T]
      } else if (ctl?.kind === "colors") {
        if (!Array.isArray(v) || !v.every(isCssColor)) continue
        out[k] = v.slice(0, ctl.max ?? 12) as T[keyof T]
      } else if (typeof bv === "number") {
        if (typeof v !== "number" || !Number.isFinite(v)) continue
        out[k] = Math.max(-1000, Math.min(1000, v)) as T[keyof T]
      } else if (typeof bv === "string" || typeof bv === "boolean") {
        if (typeof v !== typeof bv) continue
        out[k] = v as T[keyof T]
      } else if (Array.isArray(bv)) {
        if (!Array.isArray(v) || !v.every(isCssColor)) continue
        out[k] = v.slice(0, 12) as T[keyof T]
      }
    }
    return out
  } catch {
    return {}
  }
}

/** name of the preset whose override set matches, else "Custom" */
export function matchPreset(
  overrides: Record<string, unknown>,
  presets: Record<string, Record<string, unknown>>
): string {
  const target = JSON.stringify(overrides)
  for (const [name, ov] of Object.entries(presets)) {
    if (JSON.stringify(ov) === target) return name
  }
  return "Custom"
}

export { ETHEREAL, EVENT_HORIZON }

/* ── EtherealDither: presets + controls ───────────────────────────────────*/
export { ETHEREAL_DITHER }
export type DitherOverrides = Partial<EtherealDitherCfg>

const DITHER_PRESETS_RAW: Record<string, DitherOverrides> = {
  "Rainbow bits": {
    colors: [
      "rgb(255,50,100)",
      "rgb(255,160,30)",
      "rgb(50,200,80)",
      "rgb(40,140,255)",
      "rgb(180,40,240)",
    ],
    saturation: 1,
    hueRange: 0,
    duration: 11.2,
    wander: 0.2,
    flicker: 0.12,
    pulseMin: 0.86,
    pulseMax: 1.3,
  },
  Ocean: {
    colors: [
      "rgb(100,80,220)",
      "rgb(60,120,255)",
      "rgb(80,100,200)",
      "rgb(130,70,255)",
      "rgb(70,130,255)",
    ],
    hueRange: 10,
    duration: 16.1,
    travelEase: "ease-in-out",
    wander: 0.32,
    flicker: 0.06,
    pulseMin: 0.84,
    pulseMax: 1.24,
  },
  Sunset: {
    colors: [
      "rgb(255,100,60)",
      "rgb(255,180,50)",
      "rgb(255,140,70)",
      "rgb(255,80,80)",
      "rgb(255,200,60)",
    ],
    hueRange: 10,
    heads: 2,
    spin: "counter",
    duration: 13.3,
    wander: 0.14,
    flicker: 0.1,
    pulseMin: 0.9,
    pulseMax: 1.28,
  },
  Ember: {
    colors: ["#ff5e35", "#ff8a3d", "#ffb347", "#ff7a4d"],
    duration: 9.1,
    travelEase: "ease-in-out",
    flicker: 0.65,
    wander: 0.3,
    pulseMin: 0.55,
    pulseMax: 1.6,
    hueRange: 6,
  },
  Aurora: {
    colors: [
      "rgb(80,220,180)",
      "rgb(90,140,255)",
      "rgb(160,90,255)",
      "rgb(60,200,230)",
    ],
    duration: 15.8,
    wander: 0.8,
    reach: 210,
    band: 34,
    pulseMin: 0.7,
    pulseMax: 1.5,
    hueRange: 40,
  },
  Candle: {
    colors: ["#ffb347", "#ff8a3d", "#ffd98a"],
    duration: 12.3,
    travelEase: "linear",
    flicker: 0.9,
    wander: 0.45,
    pulseMin: 0.7,
    pulseMax: 1.35,
    hueRange: 5,
  },
  "Silver mono": {
    colors: ["#dfe6f2", "#aebbd2", "#f2f6fc", "#c8d2e2"],
    strength: 0.9,
    saturation: 0.9,
    hueRange: 0,
    duration: 18.4,
    travelEase: "ease-in-out",
    wander: 0.06,
    flicker: 0.04,
    pulseMin: 0.95,
    pulseMax: 1.08,
  },
  "Assistant prompt": {
    colors: ["#4285f4", "#9b72cb", "#d96570", "#9b72cb"],
    duration: 12.3,
    reach: 190,
    band: 30,
    hueRange: 6,
    wander: 0.16,
    flicker: 0.1,
    pulseMin: 0.9,
    pulseMax: 1.22,
  },
  "Dual scan": {
    heads: 2,
    spin: "counter",
    block: 5,
    levels: 5,
    duration: 12.3,
  },
  Terminal: {
    colors: ["#00ff66", "#00cc44", "#66ffaa"],
    block: 8,
    levels: 3,
    reach: 180,
    duration: 13.7,
    wander: 0.06,
    flicker: 0.08,
    pulseMin: 0.94,
    pulseMax: 1.12,
  },
  "Amber CRT": {
    colors: ["#ffb000", "#ff8800", "#ffd75e"],
    block: 7,
    levels: 3,
    band: 20,
    duration: 14.7,
    wander: 0.08,
    flicker: 0.14,
    pulseMin: 0.9,
    pulseMax: 1.18,
  },
}

export const DITHER_PRESETS = withHover(DITHER_PRESETS_RAW)

/** preset select grouping for the Dither tab */
export const DITHER_PRESET_GROUPS: { label: string; names: string[] }[] = [
  {
    label: "Ethereal classics",
    names: [
      "Rainbow bits",
      "Ocean",
      "Sunset",
      "Ember",
      "Aurora",
      "Candle",
      "Silver mono",
      "Assistant prompt",
    ],
  },
  { label: "Dither exclusive", names: ["Dual scan", "Terminal", "Amber CRT"] },
]

export const EH_CONTROLS = withHints(EH_CONTROLS_RAW)

const DITHER_CONTROLS_RAW: ControlDef<DK>[] = [
  { kind: "colors", key: "colors", label: "colors", group: "color" },
  {
    kind: "slider",
    key: "saturation",
    label: "sat",
    min: 0.4,
    max: 2,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "brightness",
    label: "bright",
    min: 0.6,
    max: 2,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "hueRange",
    label: "hueRange",
    min: 0,
    max: 60,
    step: 1,
  },
  {
    kind: "select",
    key: "path",
    label: "path",
    group: "motion",
    options: [
      { value: "around", label: "around" },
      { value: "bottom", label: "bottom" },
    ],
  },
  {
    kind: "select",
    key: "heads",
    label: "heads",
    numeric: true,
    options: [
      { value: "1", label: "1" },
      { value: "2", label: "2" },
    ],
  },
  {
    kind: "select",
    key: "spin",
    label: "spin",
    options: [
      { value: "same", label: "same" },
      { value: "counter", label: "counter" },
    ],
  },
  {
    kind: "select",
    key: "travelEase",
    label: "ease",
    options: [
      { value: "linear", label: "linear" },
      { value: "ease-in", label: "ease-in" },
      { value: "ease-out", label: "ease-out" },
      { value: "ease-in-out", label: "ease-in-out" },
      { value: "back", label: "back" },
      { value: "bounce", label: "bounce" },
    ],
  },
  {
    kind: "slider",
    key: "duration",
    label: "duration",
    min: 0.5,
    max: 20,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "repeatDelay",
    label: "loop pause",
    min: 0,
    max: 6,
    step: 0.1,
  },
  {
    kind: "slider",
    key: "wander",
    label: "wander",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "flicker",
    label: "flicker",
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "pulseMin",
    label: "pulseMin",
    min: 0.2,
    max: 1.5,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "pulseMax",
    label: "pulseMax",
    min: 0.5,
    max: 2.5,
    step: 0.05,
  },
  {
    kind: "select",
    key: "place",
    label: "place",
    group: "shape",
    options: [
      { value: "both", label: "both" },
      { value: "internal", label: "internal" },
      { value: "external", label: "external" },
    ],
  },
  { kind: "slider", key: "block", label: "block", min: 2, max: 20, step: 1 },
  { kind: "slider", key: "levels", label: "levels", min: 2, max: 8, step: 1 },
  { kind: "slider", key: "reach", label: "reach", min: 40, max: 320, step: 5 },
  { kind: "slider", key: "band", label: "band", min: 6, max: 64, step: 1 },
  { kind: "slider", key: "bleed", label: "bleed", min: 0, max: 48, step: 2 },
  {
    kind: "slider",
    key: "corner",
    label: "corner",
    min: 0.15,
    max: 0.6,
    step: 0.05,
  },
  {
    kind: "slider",
    key: "hotspots",
    label: "hotspots",
    min: 1,
    max: 5,
    step: 1,
  },
  {
    kind: "slider",
    key: "hotSpread",
    label: "hotSpread",
    min: 0,
    max: 60,
    step: 1,
  },
  {
    kind: "slider",
    key: "strength",
    label: "strength",
    min: 0.2,
    max: 2,
    step: 0.05,
    group: "glow",
  },
  {
    kind: "select",
    key: "hover",
    label: "hover",
    group: "interaction",
    options: [
      { value: "none", label: "none" },
      { value: "boost", label: "boost" },
    ],
  },
  {
    kind: "slider",
    key: "hoverAmount",
    label: "hoverAmt",
    min: 0,
    max: 2,
    step: 0.1,
  },
]

export const DITHER_CONTROLS = withHints(DITHER_CONTROLS_RAW)

/** Split a flat control list into accordion sections at each `group` marker.
 *  Shared by the base-config editor and the per-state editor so both always
 *  show the same sections in the same order. */
export function splitSections<TKey extends string>(
  controls: ControlDef<TKey>[]
) {
  const out: { title: string; items: ControlDef<TKey>[] }[] = []
  let cur: { title: string; items: ControlDef<TKey>[] } = {
    title: "general",
    items: [],
  }
  for (const ctl of controls) {
    if (ctl.group) {
      if (cur.items.length) out.push(cur)
      cur = { title: ctl.group, items: [] }
    }
    cur.items.push(ctl)
  }
  if (cur.items.length) out.push(cur)
  return out
}

// Single source of truth for the docs page AND the generated markdown
// (/llms.txt, /llms-full.txt, /docs.md). Pure data — no JSX, no React — so
// the Vite plugin in vite.config.ts can import it at build time.
//
// Anything documented in exactly one of the two renderings will drift; put it
// here and both get it.
import type { PropGroup, PropRow } from "@/components/docs/prop-table"
import type { NavItem } from "@/components/docs/section-nav"

export const NAV: NavItem[] = [
  { id: "getting-started", label: "Getting started" },
  { id: "ethereal-api", label: "<Ethereal> API" },
  { id: "states", label: "States" },
  { id: "event-horizon-api", label: "<EventHorizon> API" },
  { id: "ethereal-dither-api", label: "<EtherealDither> API" },
  { id: "wrappers", label: "Wrap components" },
  { id: "behavior", label: "Behavior & performance" },
]

/* ---------------------------------------------------------------- prop data */

export const ETHEREAL_GROUPS: PropGroup[] = [
  {
    title: "Colors, path & timing",
    rows: [
      {
        name: "colors",
        type: "string[]",
        default: "9-color rainbow",
        description:
          "Palette cycled across blobs, needles and cores. Any CSS-parseable color.",
      },
      {
        name: "path",
        type: "'bottom' | 'around'\n| 'breathe' | 'static'",
        default: "'bottom'",
        description:
          "bottom = light sweeps the bottom edge · around = full perimeter · breathe = stationary pulse · static = fixed bottom band with waveform needles.",
      },
      {
        name: "duration",
        type: "number",
        default: "3.1",
        description: "Seconds for one full travel cycle (clamped to 0.1–600).",
      },
      {
        name: "repeatDelay",
        type: "number",
        default: "0",
        description:
          "Dead time (s) after each cycle before the next begins — less frequent, not slower.",
      },
      {
        name: "heads",
        type: "1 | 2",
        default: "1",
        description: "One travelling comet head, or two.",
      },
      {
        name: "spin",
        type: "'same' | 'counter'",
        default: "'same'",
        description:
          "With heads = 2, the two heads co-rotate or counter-rotate.",
      },
      {
        name: "travelEase",
        type: "'linear' | 'ease-in'\n| 'ease-out' | 'ease-in-out'\n| 'back' | 'bounce'",
        default: "'linear'",
        description: "Easing applied to the head's progress along the path.",
      },
      {
        name: "wander",
        type: "number",
        default: "0",
        description:
          "Slow sine warp of progress — the head hesitates and hurries (0 = steady).",
      },
      {
        name: "breatheAmp",
        type: "number",
        default: "0.25",
        description:
          "Amplitude of the breathe-mode pulse; also drives subtle size pulsing.",
      },
    ],
  },
  {
    title: "Spot geometry & placement",
    rows: [
      {
        name: "place",
        type: "'internal' | 'external'\n| 'ext-border' | 'both'",
        default: "'internal'",
        description:
          "Where the glow paints: inside the host, outside, only outside the border, or both. External placements can be clipped by ancestors (see caveats).",
      },
      {
        name: "spotShape",
        type: "'adaptive' | 'round'",
        default: "'round'",
        description:
          "adaptive stretches the spotlight along the travel direction; round is a chain of equal circles that each follow the path — never a stretched ellipse.",
      },
      {
        name: "spotSamples",
        type: "number",
        default: "0",
        description:
          "round only: circles in the chain (0 = auto from spotW/spotH ratio, capped at 9).",
      },
      {
        name: "trail",
        type: "number",
        default: "1",
        description:
          "Comet-tail length multiplier for the spot chain (clamped to 0.2–4).",
      },
      {
        name: "lead",
        type: "number",
        default: "0",
        description:
          "Leading trail — the chain extends AHEAD of the head too (0 = none, 1 = as long as the tail).",
      },
      {
        name: "trailFade",
        type: "number",
        default: "0.45",
        description:
          "How strongly trail circles shrink and dim toward the tail end (0–1).",
      },
      {
        name: "spotW",
        type: "number",
        default: "78",
        description: "Spotlight width in px (clamped to 1–4000).",
      },
      {
        name: "spotH",
        type: "number",
        default: "60",
        description:
          "Height of the light in px (clamped to 1–4000). Scales the glow's paint — blobs, needles, edge-relight bands — as well as the reveal window.",
      },
      {
        name: "heightMin",
        type: "number",
        default: "0.8",
        description:
          "Lower bound of the height breathing, ×spotH (travel paths; breathe keeps breatheAmp).",
      },
      {
        name: "heightMax",
        type: "number",
        default: "1.3",
        description:
          "Upper bound of the height breathing, ×spotH — raise it to let the light surge tall.",
      },
      {
        name: "spotBlur",
        type: "number",
        default: "0",
        description:
          "Blur (px) of the masked-in spot content, softening the mask cutoff.",
      },
      {
        name: "spotOffset",
        type: "number",
        default: "0",
        description:
          "Pushes the spotlight anchor outward past the border along the head's normal (px). Ignored in breathe.",
      },
      {
        name: "strokeWidth",
        type: "number",
        default: "1",
        description: "Thickness (px) of the lit border ring.",
      },
      {
        name: "blendSoftness",
        type: "number",
        default: "0.5",
        description:
          "Softness of gradient stops across the spot and needles (~0–1.6).",
      },
      {
        name: "reveal",
        type: "number",
        default: "1",
        description:
          "Scales the bloom spotlight mask (internal and external) — smaller = tighter reveal.",
      },
      {
        name: "hotspots",
        type: "number",
        default: "1",
        description:
          "Extra white-hot cores fanned along the path, each walking it individually.",
      },
      {
        name: "hotSpread",
        type: "number",
        default: "22",
        description: "Spacing (px) between fanned hotspot cores.",
      },
    ],
  },
  {
    title: "Needles",
    rows: [
      {
        name: "needles",
        type: "number",
        default: "7",
        description: "Count of thin light needles emitted along the edge.",
      },
      {
        name: "needleHeight",
        type: "number",
        default: "1",
        description: "Length multiplier for the needles.",
      },
      {
        name: "needleJitter",
        type: "boolean",
        default: "false",
        description:
          "breathe only: needles wobble and reshuffle onto new perimeter spots each cycle.",
      },
    ],
  },
  {
    title: "Bloom & opacities",
    rows: [
      {
        name: "glowBlur",
        type: "number",
        default: "8",
        description: "Gaussian blur (px) of the bloom / needle halo layer.",
      },
      {
        name: "strokeOpacity",
        type: "number",
        default: "1.14",
        description: "Opacity multiplier of the lit border ring.",
      },
      {
        name: "innerOpacity",
        type: "number",
        default: "0.7",
        description:
          "Opacity multiplier of the interior color wash (internal / both).",
      },
      {
        name: "bloomOpacity",
        type: "number",
        default: "0.8",
        description: "Opacity multiplier of the needle bloom layer.",
      },
      {
        name: "strength",
        type: "number",
        default: "1",
        description: "Master opacity multiplier over all layers.",
      },
      {
        name: "saturation",
        type: "number",
        default: "1",
        description: "saturate() multiplier applied to every layer.",
      },
      {
        name: "brightness",
        type: "number",
        default: "1",
        description: "brightness() multiplier applied to every layer.",
      },
      {
        name: "hueRange",
        type: "number",
        default: "13",
        description:
          "Degrees of hue oscillation over time (0 = fixed hue; breathe does a full-circle rotation).",
      },
      {
        name: "gamut",
        type: "'srgb' | 'p3'",
        default: "'srgb'",
        description:
          "Color space for emitted gradients — p3 uses color(display-p3 …).",
      },
    ],
  },
  {
    title: "Hover",
    rows: [
      {
        name: "hover",
        type: "'none' | 'boost'\n| 'speed' | 'boost-speed'\n| 'reveal'",
        default: "'none'",
        description:
          "Pointer response: none · boost (brighter + larger) · speed (faster travel) · boost-speed (both at once) · reveal (fades in from hidden on hover).",
      },
      {
        name: "hoverAmount",
        type: "number",
        default: "1",
        description: "Strength of the hover response.",
      },
      {
        name: "hoverEase",
        type: "number",
        default: "8",
        description:
          "Smoothing rate of the hover transition (higher = snappier).",
      },
    ],
  },
  {
    title: "Misc & theming",
    rows: [
      {
        name: "flicker",
        type: "number",
        default: "0",
        description: "Candle-like irregular intensity jitter (0 = steady).",
      },
      {
        name: "pulseMin",
        type: "number",
        default: "0.8",
        description: "Lower bound of the size / intensity pulse oscillators.",
      },
      {
        name: "pulseMax",
        type: "number",
        default: "1.4",
        description: "Upper bound of the size / intensity pulse oscillators.",
      },
    ],
  },
]

export const EVENT_HORIZON_GROUPS: PropGroup[] = [
  {
    title: "Colors & timing",
    rows: [
      {
        name: "colors",
        type: "string[]",
        default: "['#ffb46b', '#ff8a3d',\n '#b58cff']",
        description: "Doppler palette cycled down the accretion tail.",
      },
      {
        name: "duration",
        type: "number",
        default: "6",
        description: "Seconds for one orbit (clamped to 0.5–600).",
      },
      {
        name: "repeatDelay",
        type: "number",
        default: "0",
        description:
          "Dead time (s) after each orbit before the next begins — less frequent, not slower.",
      },
      {
        name: "dir",
        type: "1 | -1",
        default: "1",
        description: "Orbit direction.",
      },
    ],
  },
  {
    title: "Disk geometry",
    rows: [
      {
        name: "ring",
        type: "number",
        default: "2",
        description: "Accretion-ring thickness (px).",
      },
      {
        name: "tail",
        type: "number",
        default: "1.2",
        description: "Tail length multiplier.",
      },
      {
        name: "nodes",
        type: "number",
        default: "9",
        description:
          "Tail micro-spot pairs — stream density (chain capped at 32 spots).",
      },
      {
        name: "node",
        type: "number",
        default: "1",
        description: "Node size multiplier.",
      },
      {
        name: "shimmer",
        type: "number",
        default: "0.45",
        description: "How much the tail surges and pulses.",
      },
      {
        name: "shape",
        type: "'adaptive' | 'round'",
        default: "'adaptive'",
        description:
          "round collapses oriented ellipses to fixed circles — the silhouette never swells or squashes through corners.",
      },
      {
        name: "corner",
        type: "number",
        default: "0.3",
        description:
          "Superellipse corner exponent for the orbit path (lower = squarer).",
      },
    ],
  },
  {
    title: "Lens, halo & shadow",
    rows: [
      {
        name: "lens",
        type: "number",
        default: "4",
        description:
          "Graduated gravitational-lens backdrop-blur strength (0 = off).",
      },
      {
        name: "halo",
        type: "number",
        default: "0.9",
        description: "Halo opacity.",
      },
      {
        name: "blur",
        type: "number",
        default: "14",
        description: "Halo gaussian blur (px).",
      },
      {
        name: "dist",
        type: "number",
        default: "0",
        description: "Halo distance off the border (px).",
      },
      {
        name: "shadow",
        type: "number",
        default: "0.35",
        description: "Center vignette depth.",
      },
    ],
  },
  {
    title: "Hover",
    rows: [
      {
        name: "hover",
        type: "'none' | 'boost'\n| 'speed' | 'reveal'",
        default: "'boost'",
        description: "Pointer response — same modes as Ethereal.",
      },
      {
        name: "hoverAmount",
        type: "number",
        default: "1.2",
        description: "Strength of the hover response.",
      },
      {
        name: "hoverEase",
        type: "number",
        default: "8",
        description: "Smoothing rate of the hover transition.",
      },
    ],
  },
]

export const ETHEREAL_DITHER_GROUPS: PropGroup[] = [
  {
    title: "Colors, path & timing",
    rows: [
      {
        name: "colors",
        type: "string[]",
        default: "['#4285f4', '#9b72cb',\n '#d96570', '#9b72cb']",
        description: "Palette cycled through the quantized blocks.",
      },
      {
        name: "path",
        type: "'around' | 'bottom'",
        default: "'around'",
        description: "Full perimeter, or a bottom-edge sweep.",
      },
      {
        name: "place",
        type: "'both' | 'internal'\n| 'external'",
        default: "'both'",
        description: "Which side of the border the blocks paint on.",
      },
      {
        name: "duration",
        type: "number",
        default: "7",
        description: "Seconds for one full travel cycle (clamped to 0.1–600).",
      },
      {
        name: "heads",
        type: "1 | 2",
        default: "1",
        description: "One travelling head, or two.",
      },
      {
        name: "spin",
        type: "'same' | 'counter'",
        default: "'same'",
        description:
          "With heads = 2, the two heads co-rotate or counter-rotate.",
      },
      {
        name: "travelEase",
        type: "'linear' | 'ease-in'\n| 'ease-out' | 'ease-in-out'\n| 'back' | 'bounce'",
        default: "'linear'",
        description: "Easing applied to the head's progress along the path.",
      },
      {
        name: "repeatDelay",
        type: "number",
        default: "0",
        description:
          "Seconds the head rests at the end of the path before the next cycle.",
      },
      {
        name: "wander",
        type: "number",
        default: "0",
        description:
          "Slow sine warp of progress — the head hesitates and hurries.",
      },
    ],
  },
  {
    title: "Dither grid",
    rows: [
      {
        name: "block",
        type: "number",
        default: "2",
        description:
          "Size of one block cell in px (clamped to 2–64) — the pixel size of the whole effect.",
      },
      {
        name: "levels",
        type: "number",
        default: "4",
        description:
          "Intensity quantization steps, 2–16. Fewer = chunkier, more posterized.",
      },
      {
        name: "reach",
        type: "number",
        default: "75",
        description: "Glow radius around the head (px, 8–2000).",
      },
      {
        name: "band",
        type: "number",
        default: "6",
        description: "Thickness of the border band the glow hugs (px, 2–1000).",
      },
      {
        name: "bleed",
        type: "number",
        default: "0",
        description:
          "How far the grid extends past the host (px). 0 = auto, wide enough for the edge band's tail to fade out.",
      },
      {
        name: "corner",
        type: "number",
        default: "0.3",
        description:
          "Superellipse corner exponent for the path (lower = squarer).",
      },
    ],
  },
  {
    title: "Intensity & color",
    rows: [
      {
        name: "strength",
        type: "number",
        default: "2",
        description: "Master intensity multiplier (0–4).",
      },
      {
        name: "saturation",
        type: "number",
        default: "1.6",
        description: "Saturation multiplier applied to the palette.",
      },
      {
        name: "brightness",
        type: "number",
        default: "1",
        description: "Brightness multiplier applied to the palette.",
      },
      {
        name: "hueRange",
        type: "number",
        default: "6",
        description: "Degrees of hue oscillation over time (0 = fixed hue).",
      },
      {
        name: "flicker",
        type: "number",
        default: "0",
        description: "Candle-like irregular intensity jitter (0 = steady).",
      },
      {
        name: "pulseMin",
        type: "number",
        default: "0.9",
        description: "Lower bound of the reach pulse.",
      },
      {
        name: "pulseMax",
        type: "number",
        default: "1.15",
        description: "Upper bound of the reach pulse.",
      },
      {
        name: "hotspots",
        type: "number",
        default: "1",
        description: "Extra white-hot cores fanned along the path (1–8).",
      },
      {
        name: "hotSpread",
        type: "number",
        default: "22",
        description: "Spacing (px) between fanned cores.",
      },
    ],
  },
  {
    title: "Hover",
    rows: [
      {
        name: "hover",
        type: "'none' | 'boost'",
        default: "'boost'",
        description:
          "Pointer response — boost brightens and enlarges the glow.",
      },
      {
        name: "hoverAmount",
        type: "number",
        default: "1",
        description: "Strength of the hover response.",
      },
    ],
  },
]

/* ------------------------------------------------------------- code samples */

export const INSTALL = `npm i ethereal-glow`

export const INSTALL_SHADCN = `npx shadcn@latest add https://ethereal.ale.design/r/ethereal.json`

export const MINIMAL = `import { Ethereal, EventHorizon } from 'ethereal-glow'

// Ethereal — a comet travels the border behind a spotlight mask
<button className="relative isolate ...">
  <span className="relative z-10">Get started</span>
  <Ethereal path="around" heads={2} spin="counter" />
</button>

// EventHorizon — a black-hole accretion disk
<button className="relative isolate ...">
  <span className="relative z-10">Enter</span>
  <EventHorizon />
</button>`

export const WRAP = `import { EtherealWrap, EventHorizonWrap, EtherealDitherWrap } from 'ethereal-glow'

// Replaced elements (inputs, textareas) can't contain the effect span —
// wrap them instead. The wrapper span becomes the positioned, isolated host.
<EtherealWrap path="static">
  <SearchInput />
</EtherealWrap>

// EventHorizonWrap and EtherealDitherWrap provide the same host contract.`

export const PRESETS_CODE = `import { EventHorizon, EVENT_HORIZON_PRESETS } from 'ethereal-glow'

<EventHorizon {...EVENT_HORIZON_PRESETS['Violet quasar']} />`

export const HOST_CODE = `/* Every effect needs a positioned, isolated host. Tailwind: */
<button className="relative isolate ..."> … </button>

/* Plain CSS: */
.host { position: relative; isolation: isolate; }`

export const STATES_CODE = `import { Ethereal, ETHEREAL_STATES } from 'ethereal-glow'

// Switch named states — the rebuilt layers cross-fade over transitionMs.
// Built-ins: 'idle' | 'thinking'.
<button className="relative isolate ...">
  <span className="relative z-10">Send</span>
  <Ethereal state={status} />
</button>`

export const CUSTOM_STATES_CODE = `// A state is keyed by VARIANT, not by config key directly:
//   light / dark        the theme branch, picked by the resolved theme
//   .base               that theme's config for the state
//   .whileHover         merged on top while hovered (mouse only)
//   .whilePressed       merged on top while pressed — pointer OR keyboard,
//                       held ~600ms so quick clicks stay visible
// Theme owns interaction, so light and dark can carry different hover treatments.
// Later variants win, so whilePressed can override whileHover.
// Custom states merge over the built-ins per variant; unknown names warn
// once and fall back to the base config.
<Ethereal
  state="sending"
  states={{
    sending: {
      light: {
        base: { colors: ['#3b82f6'], duration: 1.2 },
        whileHover: { strength: 1.4 },
      },
      dark: {
        base: { colors: ['#7ab8ff'], duration: 1.2 },
        whileHover: { strength: 1.8 },
      },
    },
  }}
  transitionMs={200} // 0 disables the cross-fade
/>`

/* The state / theme / interaction props — a separate table on the page
 * because they are cross-cutting rather than part of any one config. All
 * three components take them, so the types are written against `Cfg`: the
 * effect's own config type (EtherealCfg, EventHorizonCfg, EtherealDitherCfg). */
export const STATE_PROPS: PropRow[] = [
  {
    name: "state",
    type: "string | null",
    default: "'idle'",
    description:
      "Named state to apply: a built-in ('idle' | 'thinking') or any key of `states`. Unknown names warn once and fall back to the base config; `null` suppresses state resolution entirely.",
  },
  {
    name: "states",
    type: "Record<string,\nStateConfig<Cfg>>",
    default: "—",
    description:
      "Custom / overriding state configs, merged over the built-ins per key.",
  },
  {
    name: "themes",
    type: "Partial<Record<'light' | 'dark',\nPartial<Cfg>>>",
    default: "—",
    description:
      "Per-theme base config, merged over your flat props and UNDER any named state — so a state can still override it. Note the shape: a themes branch is flat, unlike a states branch, so `themes.light.base.duration` is a silent no-op. It is the only per-theme mechanism on all three effects — a glow that should be dimmer on white is `themes={{ light: { strength: 0.6 } }}`.",
  },
  {
    name: "transitionMs",
    type: "number",
    default: "320",
    description:
      "Cross-fade duration (ms) when the config or state changes; 0 disables the cross-fade.",
  },
  {
    name: "whileHover",
    type: "Partial<Cfg>",
    default: "—",
    description:
      "Merged while the host is hovered (mouse only), with or without a named state. Theme-independent — for a light/dark split use a state's light.whileHover instead.",
  },
  {
    name: "whilePressed",
    type: "Partial<Cfg>",
    default: "—",
    description:
      "Merged while pressed (pointer or keyboard). Layers over whileHover, never directly over base — a real press is hovered and pressed at once. A quick click pulses for ~0.6s.",
  },
  {
    name: "theme",
    type: "'light' | 'dark'",
    default: "auto",
    description:
      "Pins the theme and skips detection entirely. Omit it and the effect resolves: host data-theme → host .dark/.light class → the same two checks on every ancestor → prefers-color-scheme. Tailwind's class strategy, shadcn/ui and next-themes all work with no configuration.",
  },
  {
    name: "themeDetector",
    type: "(host: HTMLElement | null)\n=> 'light' | 'dark'",
    default: "—",
    description:
      "Replaces the whole resolution chain — use it when the theme lives somewhere the DOM does not show it (React context, a cookie, a custom attribute). Like `theme`, it opts out of watching: you own re-rendering when the value changes.",
  },
]

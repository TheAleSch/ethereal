<h1 align="center">Ethereal</h1>

<p align="center">
  Travelling-light, black-hole and dithered glow effects for React. Two CSS renderers and one pixelated-canvas renderer share a single ~60fps animation loop.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/renderers-CSS_+_canvas-000?labelColor=000" alt="CSS and canvas renderers" />
  <img src="https://img.shields.io/badge/loop-one_shared_rAF-000?labelColor=000" alt="one shared rAF loop" />
  <img src="https://img.shields.io/badge/size-18.0_kB_min%2Bgzip-000?labelColor=000" alt="18.0 kB min+gzip" />
  <img src="https://img.shields.io/badge/install-npm_+_shadcn_CLI-000?labelColor=000" alt="installs via npm or the shadcn CLI" />
  <img src="https://img.shields.io/badge/types-included-000?labelColor=000" alt="types included" />
  <a href="./packages/ethereal/LICENSE"><img src="https://img.shields.io/badge/license-MIT-000?labelColor=000" alt="license" /></a>
</p>

<p align="center">
  <a href="https://ethereal.ale.design"><b>Live demo →</b></a> &nbsp;·&nbsp;
  <a href="https://ethereal.ale.design/docs"><b>Docs →</b></a> &nbsp;·&nbsp;
  <a href="https://ethereal.ale.design/playground"><b>Playground →</b></a> &nbsp;·&nbsp;
  <a href="https://ethereal.ale.design/llms-full.txt"><b>llms-full.txt →</b></a>
</p>

---

The two CSS renderers paint with gradients and masks; EtherealDither deliberately
uses a pixelated canvas. A comet head travels a constant-speed superellipse path
behind a spotlight mask, lighting a stretch of border ring, an interior wash,
thin needles and a white-hot core. Every mounted effect shares one
`requestAnimationFrame` loop and one theme observer. Each instance has its own
size and visibility observers, which cache geometry so animation frames do not
read layout.

The design rule everything follows: anything elongated is a **composition of
round pieces individually following the border path** — never a stretched
ellipse, never a rigid welded object. Chains bend through corners like a
procession.

## Quick start

Install the package:

```sh
npm i ethereal-glow
```

Or take the shadcn route — a thin `EtherealButton` wrapper over the package, so
fixes ship via npm instead of being stranded in your tree:

```sh
npx shadcn@latest add https://ethereal.ale.design/r/ethereal.json
```

React ≥18 is the only peer dependency. Every component is a client component
(`'use client'`), so it is safe to import from a React Server Component.

The effect must be a **child** of a host that is `position: relative` and
`isolation: isolate`:

```tsx
import { Ethereal } from "ethereal-glow";

<button className="relative isolate">
  <span className="relative z-10">Get started</span>
  <Ethereal path="around" heads={2} spin="counter" />
</button>;
```

Replaced elements (`<input>`, `<img>`) cannot contain children — wrap them
instead:

```tsx
import { EtherealWrap } from "ethereal-glow";

<EtherealWrap path="static">
  <SearchInput />
</EtherealWrap>;
```

Every prop is an optional override of the exported defaults (`ETHEREAL`,
`EVENT_HORIZON`, `ETHEREAL_DITHER`). Tune in the
**[playground](https://ethereal.ale.design/playground)** and copy the generated
JSX, or **Copy link** to share the exact configuration by URL.

## Three effects, one engine

|                         | What it is                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`<Ethereal/>`**       | The travelling-light comet — lit border ring, interior colour wash, light needles, white-hot core, following a constant-speed superellipse.                                      |
| **`<EventHorizon/>`**   | A black-hole accretion disk — a white-hot head orbits trailing a doppler-tinted plasma stream, wrapped in a graduated gravitational lens, a living photon rim and a lensed halo. |
| **`<EtherealDither/>`** | The comet as digital blocks — a one-pixel-per-cell canvas upscaled with `image-rendering: pixelated`, quantized through a Bayer 4×4 matrix.                                      |

All three share the ticker, the theme observer and the config merge, and all
three resolve `state` / `themes` through one implementation. Each has a `*Wrap`
variant for hosts you can't put children inside.

## What's in this repo

| Path                                       | What                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/ethereal`](./packages/ethereal) | **`ethereal-glow`** — the React components, the shared ticker, and state/theme resolution. This is what consumers install.                |
| [`apps/site`](./apps/site)                 | The [ethereal.ale.design](https://ethereal.ale.design) site — landing demo, docs, and playground (TanStack Start). Not shipped to consumers. |
| [`registry`](./registry)                   | The shadcn registry item — an `EtherealButton` wrapper that depends on the npm package rather than vendoring it.                             |
| [`registry.json`](./registry.json)         | Source of truth for what the shadcn CLI installs.                                                                                            |

## Release order

Run `npm run verify`, then publish the exact `ethereal-glow` version to npm.
The package's `prepublishOnly` hook repeats its typecheck, source tests, build,
and packed React 18 consumer smoke so publication fails before a broken
artifact becomes immutable. After publishing, run
`npm run verify:registry:published`; it requires that exact version to be the
npm `latest` release and installs the unmodified shadcn item. Deploy the site
and registry only after that passes. Ordinary `npm run verify` uses a clearly
separate local-tarball registry smoke so pre-publication CI does not depend on
npm.

## Why

- **Pure CSS renderer** — layered `radial-gradient`s behind travelling mask
  layers. No canvas, no WebGL, no per-element render target. (`EtherealDither`
  is the deliberate exception, and says so.)
- **One loop for the whole page** — a single module-level rAF ticker drives
  every mounted instance and stops when the last one unmounts. Per frame it
  writes CSS custom properties; layout reads are cached by `ResizeObserver`, so
  there is no thrash.
- **Tunable frame rate** — `setTickRate(30)` halves the paint cost on hero-size
  effects; `setTickRate(0)` ticks at the display's native refresh. Speed is
  unaffected either way, because every effect integrates against wall-clock
  `dt` rather than counting frames.
- **Round-chain geometry** — `spotShape: 'round'` builds the spotlight as a
  chain of circles that each follow the path independently, so it bends through
  corners instead of shearing.
- **Theme resolution with zero config** — `data-theme`, `.dark`/`.light`
  classes on the host or any ancestor, then `prefers-color-scheme`. One
  document-wide `MutationObserver` serves every instance, so a theme toggle
  updates the glow without a remount. Works out of the box with Tailwind
  `darkMode: 'class'`, shadcn/ui, and next-themes.
- **Off-screen instances pause** via `IntersectionObserver`, and the loop clamps
  `dt` after background-tab pauses so clocks never jump.
- **`prefers-reduced-motion: reduce`** renders a static glow with no loop at all.

## States and themes

`state` is a named partial config merged over your base props; changing it
rebuilds the layers with a fade-in (`transitionMs`, default `320`). Built-ins
mirror an AI chat composer — `idle`, `thinking`.

```tsx
const [state, setState] = useState<'idle' | 'thinking'>('idle')

<EtherealWrap path="around" state={state}>
  <ChatComposer />
</EtherealWrap>
```

A state branches by **theme** first, then by interaction slot (`.base`,
`.whileHover`, `.whilePressed`), so light and dark can carry different hover
treatments. For a treatment that's the same in both themes, skip the state and
use the flat `whileHover` / `whilePressed` props.

When light and dark want different _values_ rather than a dimmer version of the
same glow, branch the base config with `themes`:

```tsx
<Ethereal
  path="around"
  duration={8}
  themes={{
    light: { colors: ["#5b21b6"], strength: 0.8, glowBlur: 8 },
    dark: { colors: ["#c4b5fd"], strength: 1.4 },
  }}
/>
```

The merge order, lowest to highest:

| Layer | Source                                                             |
| ----- | ------------------------------------------------------------------ |
| 1     | exported defaults (`ETHEREAL`, `EVENT_HORIZON`, `ETHEREAL_DITHER`) |
| 2     | your flat props                                                    |
| 3     | `themes[resolvedTheme]`                                            |
| 4     | the named `state`'s theme branch, then its hover/press slots       |
| 5     | the flat `whileHover` / `whilePressed` props                       |

`themes` sits _below_ states on purpose: a state is the more specific thing, so
`state="error"` can still override the theme baseline.

Mind the shape asymmetry — a `themes` branch is flat, but a `states` branch has
interaction slots. `themes.light.duration` works; `themes.light.base.duration`
is a silent no-op.

## Key props

### `<Ethereal/>`

| Prop                     | Default          | What it does                                                                                                  |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `colors`                 | 9-colour rainbow | Palette cycled across blobs and needles                                                                       |
| `path`                   | `'bottom'`       | `bottom` line · `around` full perimeter · `breathe` stationary pulse · `static` fixed band + waveform needles |
| `heads` / `spin`         | `1` / `'same'`   | Dual comets, co- or counter-rotating                                                                          |
| `place`                  | `'internal'`     | `internal` · `external` · `ext-border` · `both`                                                               |
| `spotShape`              | `'round'`        | `round` = a chain of circles that individually follow the path                                                |
| `spotSamples`            | `0`              | Circles in the chain (0 = auto from the spotW/spotH ratio)                                                    |
| `hotspots` / `hotSpread` | `1` / `22`       | Extra white-hot cores fanned along the path, each walking it individually                                     |
| `hover`                  | `'none'`         | `boost` · `speed` · `reveal`                                                                                  |

`duration`, `spotW/H`, `needles`, `glowBlur` and the rest are typed and
documented on `EtherealCfg`.

### `<EventHorizon/>`

| Prop                                       | Default               | What it does                                                  |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------- |
| `colors`                                   | warm oranges + violet | Doppler palette down the tail                                 |
| `duration` / `dir`                         | `6` / `1`             | Orbit period and direction                                    |
| `ring`, `tail`, `nodes`, `node`, `shimmer` |                       | Ring thickness, tail length, stream density, node size, surge |
| `blur`, `halo`, `dist`                     | `14`, `0.9`, `0`      | Halo blur, opacity, distance off the border                   |
| `shape`                                    | `'adaptive'`          | `round` = fixed-circle silhouette through corners             |
| `corner`                                   | `0.3`                 | Superellipse exponent (lower = squarer path)                  |
| `lens`                                     | `4`                   | Graduated `backdrop-filter` lensing (0 = off)                 |
| `shadow`                                   | `0.35`                | Centre vignette depth                                         |
| `hover`                                    | `'boost'`             | `boost` · `speed` · `reveal` · `none`                         |

### `<EtherealDither/>`

`block` (cell px), `levels` (quantization steps), `reach` (glow radius), `band`
(border band px), `bleed` (grid overhang px), plus the familiar `colors` /
`path` / `heads` / `spin` / `duration` / `hover`.

It redraws the whole canvas every tick rather than writing custom properties, so
the default 60fps rate doubles its CPU cost outright with nothing for the
browser to coalesce. Call `setTickRate(30)` if you use it.

## Clipping caveat

With `place: "external"` / `"ext-border"` / `"both"` — and Event Horizon's halo
always — the glow paints OUTSIDE the host, so any ancestor that clips will cut
it off: `overflow` hidden/auto/scroll/clip, `contain: paint`, `clip-path`, or a
transformed ancestor with overflow. Give the nearest scroll container padding
for the glow reach (~`glowBlur × 2 + 30px`), lift the element out of the
clipping wrapper, or use `place: "internal"`.

The mirror-image caveat: `place: "internal"` draws inside the element, so on a
solid bright fill it barely reads. Use external placement there, or keep
ethereal elements dark or outlined.

## Local development

This repo is npm workspaces — the lockfile is npm's, so use npm here even if
your own apps use something else.

```sh
npm install            # workspace root
npm run build          # tsup → packages/ethereal/dist (ESM + d.ts)
npm run typecheck      # both workspaces
npm test               # vitest, single run (builds the package first)
npm run site:dev       # the site → http://localhost:3000
npm run site:build     # package + site production build
npm run test:e2e -w site   # Playwright, starts its own dev server
```

Two dev tools worth knowing:

```sh
node apps/site/e2e/preset-contact-sheet.mjs   # every preset, both backdrops, tiled
```

Presets are a visual artifact and reviewing them by reading their numbers does
not work — that script is how sixteen invisible-on-white presets were found. Run
it after touching presets or any default, and look at the two sheets.

The package source is the canonical implementation; the playground's React code
tab mirrors it and the two should be kept in parity when either changes.

Inspired by the mechanism of Jakub Antalík's border-beam.

## License

[MIT](./packages/ethereal/LICENSE) © Alexandre Schrammel

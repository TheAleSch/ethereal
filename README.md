<h1 align="center">Ethereal</h1>

<p align="center">
  Travelling-light and black-hole glow effects for React. Layered <code>radial-gradient</code>s behind moving spotlight masks — no canvas, no WebGL — and one shared ~60fps loop animating CSS custom properties for every instance on the page.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/renderer-pure_CSS-000?labelColor=000" alt="pure CSS renderer" />
  <img src="https://img.shields.io/badge/loop-one_shared_rAF-000?labelColor=000" alt="one shared rAF loop" />
  <img src="https://img.shields.io/badge/size-16.6_kB_min%2Bgzip-000?labelColor=000" alt="16.6 kB min+gzip" />
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

Most glow libraries either spin up a canvas per element or hand you a single
hardcoded border beam. This one paints entirely in CSS — a comet head travels a
constant-speed superellipse path behind a spotlight mask, lighting a stretch of
border ring, an interior wash, thin needles and a white-hot core. Mount fifty of
them and there is still exactly **one** `requestAnimationFrame` loop, one theme
observer, and one `ResizeObserver` cache; per frame the only work is writing
custom properties.

The design rule everything follows: anything elongated is a **composition of
round pieces individually following the border path** — never a stretched
ellipse, never a rigid welded object. Chains bend through corners like a
procession.

## Quick start

Install the package:

```sh
npm i @theale/ethereal
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
import { Ethereal } from "@theale/ethereal";

<button className="relative isolate">
  <span className="relative z-10">Get started</span>
  <Ethereal path="around" heads={2} spin="counter" />
</button>;
```

Replaced elements (`<input>`, `<img>`) cannot contain children — wrap them
instead:

```tsx
import { EtherealWrap } from "@theale/ethereal";

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

| Path                                       | What                                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/ethereal`](./packages/ethereal) | **`@theale/ethereal`** — the React components, the shared ticker, state/theme resolution, and the audio driver. This is what consumers install. |
| [`apps/site`](./apps/site)                 | The [ethereal.ale.design](https://ethereal.ale.design) site — landing demo, docs, and playground (TanStack Start). Not shipped to consumers.    |
| [`registry`](./registry)                   | The shadcn registry item — an `EtherealButton` wrapper that depends on the npm package rather than vendoring it.                                |
| [`registry.json`](./registry.json)         | Source of truth for what the shadcn CLI installs.                                                                                               |

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
- **Audio reactivity that modulates rather than replaces** — three host
  variables (`--aud`, `--ahot`, `--fb0…7`) all rest at exactly `1`, so a silent
  or un-attached host renders identically to one that was never attached. Sound
  scales the glow you tuned; it never imposes a pattern of its own.
- **Off-screen instances pause** via `IntersectionObserver`, and the loop clamps
  `dt` after background-tab pauses so clocks never jump.
- **`prefers-reduced-motion: reduce`** renders a static glow with no loop at all.

## States and themes

`state` is a named partial config merged over your base props; changing it
rebuilds the layers with a fade-in (`transitionMs`, default `320`). Built-ins
mirror an AI chat composer — `idle`, `thinking`, `audio`.

```tsx
const [state, setState] = useState<'idle' | 'thinking' | 'audio'>('idle')

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

## Audio

Any config reacts to sound, and nothing is drawn that wasn't there in silence.

| Variable        | At rest | What sound does                                                                                                                                                                   |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--aud`         | `1`     | lifts the whole glow (→ ~1.5 at full drive)                                                                                                                                       |
| `--ahot`        | `1`     | swells the hotspot cores / the Event Horizon head (→ ~1.9)                                                                                                                        |
| `--fb0`…`--fb7` | `1`     | scales each Ethereal needle by frequency band (0.3…2.4); EtherealDither interpolates the bands around its perimeter so the canvas ripples instead of splitting into eight sectors |

`sensitivity` multiplies the _deviation from rest_, not the output: `0` is a
total no-op, `2` roughly doubles the excursion. Drive auto-gains against a
slowly-decaying peak, so a quiet mic and a hot one both reach full drive with no
per-device tuning.

Drive it from playback — an assistant speaking — not just the mic:

```tsx
import { attachAudio, attachMicAudio } from "@theale/ethereal";

const stop = await attachAudio(host, audioEl); // <audio> / TTS reply
const stop = await attachAudio(host, ttsGain); // any Web Audio node
const stop = await attachAudio(host, remoteStream); // WebRTC MediaStream
const stop = await attachMicAudio(host, { sensitivity: 1 });
```

`stop()` detaches and resets the variables. One caveat: an `HTMLMediaElement`
can only ever be attached to a single `AudioContext` (a spec limitation of
`createMediaElementSource`) — pass your own `context` if you already route that
element through Web Audio.

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

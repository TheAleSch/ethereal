# ethereal-glow

**[Playground](https://ethereal.ale.design/playground)** ·
**[Docs](https://ethereal.ale.design/docs)** ·
**[ethereal.ale.design](https://ethereal.ale.design)**

Travelling-light, black-hole and dithered glow effects for React. Two renderers
use CSS gradients and masks; the dithered renderer uses a pixelated canvas. All
three are driven by **one shared ~60fps loop** for every mounted instance.

Three effects:

- **`<Ethereal/>`** — a comet head travels along your element behind a
  spotlight mask: a lit stretch of the border ring, an interior color wash,
  thin light needles and a white-hot core.
- **`<EventHorizon/>`** — a black-hole accretion disk: a white-hot head
  orbits trailing a doppler-tinted plasma stream, wrapped in a graduated
  gravitational lens, a living photon rim and a lensed halo.
- **`<EtherealDither/>`** — the travelling-light comet rendered as quantized
  canvas blocks through a Bayer 4×4 matrix.

## Install

```sh
npm i ethereal-glow
```

React ≥18 is a peer dependency. All three components are client components
(`'use client'`) — safe to import from React Server Components.

## Use

Drop the effect inside any element that has `position: relative` and
`isolation: isolate`:

```tsx
import { Ethereal, EventHorizon } from 'ethereal-glow'

<button className="relative isolate ...">
  <span className="relative z-10">Get started</span>
  <Ethereal path="around" heads={2} spin="counter" />
</button>

<button className="relative isolate ...">
  <span className="relative z-10">Enter</span>
  <EventHorizon />
</button>
```

When you can't edit the child (inputs, third-party components), use the
wrapper form — replaced elements can't contain the effect span:

```tsx
import {
  EtherealWrap,
  EventHorizonWrap,
  EtherealDitherWrap,
} from "ethereal-glow";

<EtherealWrap path="static">
  <SearchInput />
</EtherealWrap>;
```

All props are optional overrides of the exported defaults (`ETHEREAL`,
`EVENT_HORIZON`, `ETHEREAL_DITHER`). The playground's **Copy link** / code panel emits a
ready-to-spread props object:

```tsx
<Ethereal {...configFromPlayground} />
```

Event Horizon ships presets:

```tsx
import { EVENT_HORIZON_PRESETS } from "ethereal-glow";
<EventHorizon {...EVENT_HORIZON_PRESETS["Violet quasar"]} />;
```

## EtherealDither

The comet as **digital dithered blocks** — a canvas at one-pixel-per-cell
resolution upscaled with `image-rendering: pixelated`, intensity quantized
through a Bayer 4×4 matrix. Retro-terminal cousin of `<Ethereal/>`, same
host contract and shared ticker:

```tsx
import { EtherealDither, EtherealDitherWrap } from "ethereal-glow";

<EtherealDitherWrap
  colors={["#00ff66", "#00cc44", "#66ffaa"]}
  block={8}
  levels={3}
>
  <button>Insert coin</button>
</EtherealDitherWrap>;
```

Key props: `block` (cell px), `levels` (quantization steps), `reach` (glow
radius), `band` (border band px), `bleed` (grid overhang px), plus the
familiar `colors` / `path` / `heads` / `spin` / `duration` / `hover`.

## States

`Ethereal` (and `EtherealWrap`) accept a `state` prop — a named **variation of
the config you gave**, not a different look bolted on top. The built-in states
are derived from your own config: your colors, path, geometry and pacing go in,
and the same effect comes back quicker and more restless (`thinking`). A red
comet going `around` stays a red comet going around. Changing state rebuilds
the layers with a fade-in
(`transitionMs`, default `320`, `0` disables). Built-ins mirror an AI chat
composer:

```tsx
const [state, setState] = useState<'idle' | 'thinking'>('idle')
<EtherealWrap path="around" state={state}>
  <ChatComposer />
</EtherealWrap>
```

| State      | Character                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `idle`     | your base config, untouched                                                                                               |
| `thinking` | your config, quicker and more restless — shorter duration, more wander and flicker, a tighter pulse, hover reactions off  |

`EventHorizon` and `EtherealDither` derive the same temperament from their own
config shapes (orbit and shimmer; block wander and flicker).

The derivation is a fallback, not an override: anything you state explicitly
wins. Define or override states with the `states` prop — an entry there
replaces the derived value key by key, and leaves the rest derived. A state is
keyed by **variant**, not by config key directly:

| Variant          | Applied                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `light` / `dark` | the theme branch, picked by the resolved theme                                                                             |
| `.base`          | that theme's config for the state                                                                                          |
| `.whileHover`    | merged on top while hovered (mouse only — a touch tap never latches it on)                                                 |
| `.whilePressed`  | merged on top while pressed, by pointer **or** keyboard (Enter/Space), held ~600ms so a quick click still reads as a pulse |

Theme owns interaction, so light and dark can carry different hover treatments.
Within a theme, later slots win: `whilePressed` overrides `whileHover`.

Full precedence, lowest to highest: defaults → your flat props → `themes`
branch → **derived state variation** → the named state's config (built-in,
then `states`, then its hover/press slots) → the flat `whileHover` /
`whilePressed` props.

To show a state's variation without mounting the component — a preview, a
generated snippet — call the rule directly: `deriveEtherealState(cfg,
'thinking')` (also `deriveEventHorizonState`, `deriveEtherealDitherState`)
returns the `Partial<Cfg>` that would be merged over `cfg`.

```tsx
<Ethereal
  state="error"
  states={{
    error: {
      light: {
        base: { colors: ["#dc2626"], path: "breathe", duration: 1.6 },
        whileHover: { strength: 1.4 },
      },
      dark: {
        base: { colors: ["#ff4444"], path: "breathe", duration: 1.6 },
        whileHover: { strength: 1.8 },
      },
    },
  }}
/>
```

The same shape works on `<EventHorizon/>` and `<EtherealDither/>` — all three
resolve states through one shared implementation.

For a hover or press treatment that is the _same_ in both themes, skip the
state entirely and use the top-level `whileHover` / `whilePressed` props:

```tsx
<Ethereal path="around" whileHover={{ strength: 1.5 }} />
```

Both are flat `Partial<Cfg>` — no theme branch. They are spread after the
resolved state, so for any one key use the prop overlay **or** the state's
slot, not both.

### Per-theme base config

When light and dark want different _values_ — not just a dimmer version of
the same glow — branch the base config with `themes`:

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

The full merge order, lowest to highest:

| Layer | Source                                                             |
| ----- | ------------------------------------------------------------------ |
| 1     | exported defaults (`ETHEREAL`, `EVENT_HORIZON`, `ETHEREAL_DITHER`) |
| 2     | your flat props                                                    |
| 3     | `themes[resolvedTheme]`                                            |
| 4     | the named `state`'s theme branch, then its hover/press slots       |
| 5     | the flat `whileHover` / `whilePressed` props                       |

`themes` sits below states on purpose: a state is the more specific thing, so
`state="error"` can still override the theme baseline. If it were the other
way round, one `themes.dark.duration` would silently pin duration across every
state.

`themes` is the only per-theme mechanism — all three effects take it, and it is
the whole light-mode story for each of them. "Same config, just dimmer on
white" is `themes={{ light: { strength: 0.6 } }}`.

Mind the shape asymmetry between the two props: a `themes` branch is flat, but
a `states` branch has interaction slots — so `themes.light.duration` works while
`themes.light.base.duration` is a silent no-op.

### Theme resolution

Zero configuration in the common case. On mount each effect resolves, in order:

1. the `theme` prop, if you passed one — detection is skipped entirely
2. the host's own `data-theme="dark" | "light"`
3. the host's own `.dark` / `.light` class
4. the same two checks on every ancestor
5. `prefers-color-scheme: dark`
6. `light`

| Setup                                                          | Resolves via                |
| -------------------------------------------------------------- | --------------------------- |
| Tailwind `darkMode: 'class'` (and v4's `@custom-variant dark`) | `.dark` on `<html>`, step 4 |
| shadcn/ui + next-themes                                        | `class="dark"`, step 4      |
| next-themes `attribute="data-theme"`                           | step 2 / 4                  |
| Tailwind `darkMode: 'media'`, or no theme system at all        | step 5                      |
| anything else                                                  | `themeDetector`             |

Changes are picked up live — one document-wide `MutationObserver` shared by
every mounted instance watches `data-theme` and `class`, and a `matchMedia`
listener covers the OS scheme. A theme toggle updates the glow without a
remount.

Two escape hatches:

```tsx
<Ethereal theme="dark" />                                  {/* pin it */}
<Ethereal themeDetector={(host) => myThemeStore.current} /> {/* replace the chain */}
```

Both opt out of watching: if you own the value, you own re-rendering when it
changes.

## Key props

### Ethereal

| Prop                                            | Default         | What it does                                                                                                  |
| ----------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `colors`                                        | 9-color rainbow | Palette cycled across blobs/needles                                                                           |
| `path`                                          | `'bottom'`      | `bottom` line · `around` full perimeter · `breathe` stationary pulse · `static` fixed band + waveform needles |
| `heads` / `spin`                                | `1` / `'same'`  | Dual comets, co- or counter-rotating                                                                          |
| `place`                                         | `'internal'`    | `internal` · `external` · `ext-border` (glow only outside) · `both`                                           |
| `spotShape`                                     | `'round'`       | `round` = the spotlight is a chain of circles that individually follow the path — never a stretched ellipse   |
| `spotSamples`                                   | `0`             | Circles in the round chain (0 = auto from spotW/spotH ratio)                                                  |
| `hotspots` / `hotSpread`                        | `1` / `22`      | Extra white-hot cores fanned along the path, each walking it individually                                     |
| `hover`                                         | `'none'`        | `boost` · `speed` · `reveal`                                                                                  |
| `duration`, `spotW/H`, `needles`, `glowBlur`, … |                 | See `EtherealCfg` — every field is typed and documented in the source                                         |

### EventHorizon

| Prop                                       | Default               | What it does                                                                   |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------------------------ |
| `colors`                                   | warm oranges + violet | Doppler palette down the tail                                                  |
| `duration` / `dir`                         | `6` / `1`             | Orbit period and direction                                                     |
| `ring`, `tail`, `nodes`, `node`, `shimmer` |                       | Accretion ring thickness, tail length, stream density, node size, surge amount |
| `blur`, `halo`, `dist`                     | `14`, `0.9`, `0`      | Halo blur, opacity, and distance off the border                                |
| `shape`                                    | `'adaptive'`          | `round` = fixed-circle silhouette through corners                              |
| `corner`                                   | `0.3`                 | Superellipse corner exponent (lower = squarer path)                            |
| `lens`                                     | `4`                   | Graduated backdrop-filter lensing strength (0 = off)                           |
| `shadow`                                   | `0.35`                | Center vignette depth                                                          |
| `hover`                                    | `'boost'`             | `boost` · `speed` · `reveal` · `none`                                          |

## Behavior & performance

- **One rAF loop** drives every instance of all three effects, targeting ~60fps —
  one tick per frame on a 60Hz display; higher-refresh displays are gated
  down to the target. It stops entirely when the last instance unmounts.
- **The frame rate is tunable** via `setTickRate(fps)` — pass `0` to tick at
  the display's native refresh rate, or `30` to halve the paint cost on
  hero-size effects. Speed is unaffected: every effect integrates against
  wall-clock `dt` rather than counting frames.

  ```ts
  import { setTickRate, getTickRate } from "ethereal-glow";
  setTickRate(30); // large effect, tight budget
  ```

  It is one process-wide setting, not per-instance — every effect shares the
  loop, so the last caller wins. `getTickRate()` reads it back if a component
  needs to restore the previous value on unmount.

  `<EtherealDither/>` redraws its canvas every tick rather than only writing
  CSS custom properties, so it can be the most expensive renderer on a large
  host — consider `setTickRate(30)` when using it.

- **Off-screen instances pause** (IntersectionObserver, 160px margin) and
  the loop clamps `dt` after background-tab pauses so clocks never jump.
- **Layout reads are cached** by ResizeObserver — the per-frame code only
  writes CSS custom properties, so there is no layout thrash.
- **`prefers-reduced-motion: reduce`** renders a static glow with no
  animation loop.
- **Theming**: honors `html[data-theme]`, `.light`/`.dark` classes, or the
  OS scheme — see [Theme resolution](#theme-resolution). One shared
  MutationObserver and one `matchMedia` listener serve every mounted
  instance, regardless of how deep in the tree they sit. Use `themes.light` to
  tune any of the three effects for light backgrounds.
- **State transitions**: re-render with a different config and the rebuilt
  layers fade in over ~320ms (e.g. idle → thinking on a chat composer).

## Clipping caveat

With `place: "external"` / `"ext-border"` / `"both"` (and Event Horizon's
halo always) the glow paints OUTSIDE the host, so any ancestor that clips
will cut it off: `overflow` hidden/auto/scroll/clip, `contain: paint`,
`clip-path`, transformed ancestors with overflow. Give the nearest scroll
container enough padding for the glow reach (~`glowBlur×2 + 30px`), lift the
element out of the clipping wrapper, or use `place: "internal"`.

Also: `place: "internal"` draws INSIDE the element — on a solid bright fill
it barely reads. Use external placement there, or keep ethereal elements
dark/outlined.

## License

MIT

# Changelog

All notable changes to `ethereal-glow` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `EVENT_HORIZON_PRESETS.Pulsar` (the only teal disk) and
  `EVENT_HORIZON_PRESETS.Eclipse`, built for light surfaces: no lens and almost
  no core shadow.

### Changed

- `EVENT_HORIZON_PRESETS.Gargantua` was the default config slowed down and
  rendered as its twin; it is now a big white-gold disk.
  `EVENT_HORIZON_PRESETS.Neutron` laps in 4.2s instead of 3.2s with a shorter,
  softer tail, so the trail no longer breaks into separate lumps.

- `<Ethereal>` strong glows roll off like light instead of clamping: past
  `strength` 1 the halo reaches further and, on dark surfaces, the core runs
  hotter, while pulse and flicker stay visible. Hotspot cores are tinted by the
  head's colour instead of pure white (grey smoke on dark pages, a bleached
  hole on light ones).
- `<Ethereal>` is roughly twice as cheap per frame: a comet chain renders as
  one masked layer per head instead of one per chain circle, unchanged and
  invisible-frame variable writes are skipped, and the effect paints on its own
  compositor layer. On a gallery of twelve glowing buttons (headless Chromium,
  GPU raster) style work per frame drops ~48%, paint ~41%, raster ~67%, and the
  page holds 60fps where it held 38.
- `<Ethereal>` writes its per-frame CSS variables on its own effect span
  instead of the host, so they no longer shadow same-named variables in your
  content. Anything that read them off the host must read the effect span.

### Fixed

- `<EventHorizon>` on a light surface no longer prints a white frame round the
  host: the lens's brightness lift, which reads as light piling up at the rim
  on a dark page, is dropped when the theme is light.
- `<Ethereal>` config changes (states, `whileHover`, `whilePressed`) now
  cross-fade over `transitionMs`. The fade never ran after the first mount, so
  every hover treatment snapped in.

## [0.1.0] — 2026-08-21

Initial release.

### Added

- `<Ethereal>` / `<EtherealWrap>` — travelling-light border glow driven by pure
  CSS gradients and masks.
- `<EventHorizon>` / `<EventHorizonWrap>` — black-hole lensing glow.
- `<EtherealDither>` / `<EtherealDitherWrap>` — dithered canvas glow.
- Named states (`idle`, `thinking`) with light/dark theme branches and
  `whileHover` / `whilePressed` interaction overlays, plus custom states via
  the `states` prop.
- State derivation: `thinking` is derived from the caller's own config, so the
  state stays recognisably the preset you tuned.
- One shared `requestAnimationFrame` loop for every mounted effect
  (`setTickRate`, `setPaused` exported from the root).
- `ethereal-glow/core` subpath exposing the shared ticker, theme observer,
  path walker and merge primitives for sibling renderers.
- ESM-only build with `'use client'` banners for React Server Components.

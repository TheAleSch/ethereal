# Changelog

All notable changes to `@theale/ethereal` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

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
- `@theale/ethereal/core` subpath exposing the shared ticker, theme observer,
  path walker and merge primitives for sibling renderers.
- ESM-only build with `'use client'` banners for React Server Components.

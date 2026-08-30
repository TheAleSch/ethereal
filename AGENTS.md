# AGENTS.md

Guidance for coding agents. Two audiences: agents **using** `ethereal-glow`
in someone else's app, and agents **working in this repo**.

## Using ethereal-glow

### The host contract — this is the rule that gets broken

The effect is a **child** of the element it decorates, and that element must be
a stacking context:

```tsx
<button className="relative isolate">
  <span className="relative z-10">Get started</span>
  <Ethereal path="around" heads={2} />
</button>
```

- The host **must** have `position: relative` **and** `isolation: isolate`.
  Without the isolation the glow paints over your content instead of behind it.
- Your own content **must** sit on a higher layer (`relative z-10`).
- The effect element renders no visible content of its own. Do not give it a
  className, do not try to size it.

### Replaced elements cannot be hosts

`<input>`, `<textarea>`, `<img>`, `<video>` cannot contain children. Wrapping is
not a style preference here, it is the only thing that works:

```tsx
<EtherealWrap path="static">
  <SearchInput />
</EtherealWrap>
```

`EtherealWrap`, `EventHorizonWrap` and `EtherealDitherWrap` render the
positioned, isolated host span for you and take the same props as the effect,
plus `className` and `style`.

### Picking a component

| Want | Use |
| --- | --- |
| a comet travelling the border | `<Ethereal>` |
| a black-hole accretion disk | `<EventHorizon>` |
| the comet as chunky dithered blocks (canvas) | `<EtherealDither>` |

### Other things that are easy to get wrong

- All three ship `'use client'` already. Do **not** add a `'use client'` to a
  Server Component just to import them.
- `place: 'external'` and `'ext-border'` paint outside the host, so any
  ancestor with `overflow: hidden` will clip them.
- A named state's `whilePressed` layers on top of `whileHover`, never directly
  on `base` — a real press is hovered *and* pressed at once.
- Use the top-level `whileHover` / `whilePressed` props for a treatment that is
  identical in both themes; use a state's `light.whileHover` / `dark.whileHover`
  when they differ. For one key, use one or the other, not both.
- `themes={{ light, dark }}` branches the **base** config by theme. It merges
  above your flat props and **below** any named state, so a state can still
  override it. It is the only per-theme mechanism on all three components — a
  glow that should be dimmer on white is `themes={{ light: { strength: 0.6 } }}`.
- `duration` is the only pacing control — seconds for one lap of the path.
- Theme is detected automatically (`data-theme`, `.dark`/`.light`, then
  `prefers-color-scheme`). Do not wire up a theme prop unless the app's theme
  lives somewhere the DOM does not show it — then use `themeDetector`.

Full machine-readable reference: <https://ethereal.ale.design/llms-full.txt>

## Working in this repo

```
packages/ethereal     ethereal-glow — the CSS renderer, canonical
apps/site             docs site + playground (TanStack Start)
registry/             shadcn/ui registry item source
docs/                 design specs and release notes
```

```sh
npm install                       # workspace root
npm run build                     # the package
npm run typecheck                 # both workspaces
npm test                          # builds core first, then runs the tests
npm run test:e2e -w site          # browser suite; owns its own dev server
npm run site:dev                  # dev server
```

`npm test` builds `packages/ethereal` before running, because the `./core`
subpath resolves through `dist/`. Running the tests directly against a stale
`dist` fails for reasons unrelated to the code under test.

Conventions:

- **`apps/site/src/content/docs-data.ts` is the single source for reference
  content.** The `/docs` page and the generated `/llms.txt`, `/llms-full.txt`
  and `/docs.md` all read it. Adding a prop means adding it there, once.
- The generated endpoints are written into `apps/site/public/` by the
  `vite-ai-endpoints.ts` plugin on every dev start and build. Do not hand-edit
  them.
- `packages/ethereal/README.md` is the canonical prose and is embedded verbatim
  in the generated reference. Keep it accurate.
- **`apps/site/src/content/to-markdown.ts` composes the generated markdown by
  hand, one block per docs section.** Nothing derives sections from the nav, so
  adding a `/docs` section without adding a block there leaves it silently
  absent from `/llms-full.txt` and `/docs.md`.
- All three components resolve config through `mergeConfig` in
  `packages/ethereal/src/core/state.ts`. A test asserts none of them hand-rolls
  a merge — if you add a renderer, it goes through the same function.
- A named state is **derived** from the caller's config, not hard-coded: each
  component passes a `derive` rule (`deriveEtherealState` and friends) that
  reads the merged config and returns a variation. `mergeConfig` applies it
  BELOW the state tables, so an explicit entry in `ETHEREAL_STATES` or a
  caller's `states` prop always wins. That precedence is expressed once, there.
  The built-in tables hold only the state names; anything you put back in one
  needs a comment saying which rule could not derive it.
- `ethereal-glow/core` is the shared-primitives subpath and is **ESM-only on
  purpose**: esbuild cannot code-split CJS, so a `core.cjs` would have carried a
  second private copy of the ticker.
- Never add `Co-Authored-By` lines to commits.
- Never build a `YYYY-MM-DD` string via `toISOString()` — use local calendar
  parts, or the date shifts a day for UTC+ users near midnight.

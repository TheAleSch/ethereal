import { createFileRoute, Link } from "@tanstack/react-router"

import { pageHead } from "@/lib/head"
import { EVENT_HORIZON_PRESETS } from "@theale/ethereal"
import { CodeBlock } from "@/components/docs/code-block"
import { CopyPage } from "@/components/docs/copy-page"
import { LiveDemo } from "@/components/docs/live-demo"
import { PropTable } from "@/components/docs/prop-table"
import { SectionNav } from "@/components/docs/section-nav"
import {
  NAV,
  ETHEREAL_GROUPS,
  EVENT_HORIZON_GROUPS,
  ETHEREAL_DITHER_GROUPS,
  INSTALL,
  INSTALL_SHADCN,
  MINIMAL,
  WRAP,
  PRESETS_CODE,
  HOST_CODE,
  STATES_CODE,
  CUSTOM_STATES_CODE,
  AUDIO_CODE,
  STATE_PROPS,
} from "@/content/docs-data"

export const Route = createFileRoute("/docs")({
  head: () => pageHead("/docs"),
  component: DocsPage,
})

/* ------------------------------------------------------------------ layout */

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-5 text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[68ch] text-[15px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[68ch] rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[14px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200">
      {children}
    </code>
  )
}

/** The cross-cutting state/theme/interaction props. Rendered under EVERY
 *  component section, because all three take them — showing it only under
 *  Ethereal is what made `themes` read as an Ethereal-only feature. `Cfg`
 *  in the type column is the section's own config type.
 *
 *  `rows` defaults to `STATE_PROPS` (idle/thinking/audio built-ins). */
function StatePropsTable({ rows = STATE_PROPS }: { rows?: typeof STATE_PROPS }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.07] bg-white/[0.02] text-[11px] tracking-wide text-zinc-300 uppercase">
            <th className="px-4 py-2.5 font-medium">Prop</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Default</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i, arr) => (
            <tr
              key={row.name}
              className={
                "align-top transition-colors hover:bg-white/[0.02]" +
                (i < arr.length - 1 ? " border-b border-white/[0.04]" : "")
              }
            >
              <td className="px-4 py-2.5 font-mono text-[13px] whitespace-nowrap text-foreground">
                {row.name}
              </td>
              <td className="px-4 py-2.5 font-mono text-[12px] whitespace-pre-wrap text-sky-300/80">
                {row.type}
              </td>
              <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap text-amber-300/70">
                {row.default}
              </td>
              <td className="max-w-md px-4 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
                {row.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DocsPage() {
  return (
    <main className="container mx-auto px-4 pt-24 pb-10 lg:pt-28 lg:pb-14">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <p className="mb-2 font-mono text-xs tracking-wide text-muted-foreground">
            @theale/ethereal
          </p>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Documentation
            </h1>
            <CopyPage />
          </div>
          <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-muted-foreground">
            Travelling-light and black-hole glow effects for React — pure CSS
            gradients and masks, no canvas or WebGL, driven by one shared ~60fps
            loop for every mounted instance.
          </p>
          <div className="mt-6">
            <LiveDemo />
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
          {/* mobile: collapsible in-page nav (the sidebar is lg-only) */}
          <details className="mb-8 rounded-lg border border-white/10 lg:hidden">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground select-none">
              On this page
            </summary>
            <nav className="flex flex-col gap-0.5 px-2 pb-3">
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </details>
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <SectionNav items={NAV} />
            </div>
          </aside>

          <div className="min-w-0 space-y-16">
            {/* 1. Getting started */}
            <Section id="getting-started" title="Getting started">
              <Prose>
                Install the package. React ≥ 18 is a peer dependency.
              </Prose>
              <CodeBlock code={INSTALL} lang="sh" />
              <Prose>
                Or, if you use <Code>shadcn/ui</Code>, take the registry path
                instead — it drops an <Code>EtherealButton</Code> into{" "}
                <Code>components/ui/</Code> that you own and can restyle, with{" "}
                <Code>@theale/ethereal</Code> added as a dependency so fixes
                still arrive over npm rather than being stranded in your tree.
              </Prose>
              <CodeBlock code={INSTALL_SHADCN} lang="sh" />
              <Prose>
                Drop an effect inside any element that is a positioned, isolated
                host — <Code>position: relative</Code> plus{" "}
                <Code>isolation: isolate</Code>. Keep your own content on a
                higher stacking layer (<Code>relative z-10</Code>) so it sits
                above the glow.
              </Prose>
              <CodeBlock code={MINIMAL} />
              <Note>
                <strong className="font-semibold text-foreground">
                  Next.js App Router:
                </strong>{" "}
                both components already ship the <Code>'use client'</Code>{" "}
                directive, so you can import them straight into a Server
                Component. You only need your own <Code>'use client'</Code> if
                the surrounding file also uses state or event handlers.
              </Note>
            </Section>

            {/* 2. Ethereal API */}
            <Section id="ethereal-api" title="<Ethereal> API">
              <Prose>
                A comet head travels along the element behind a spotlight mask:
                a lit stretch of the border ring, an interior color wash, thin
                light needles and a white-hot core. Every prop is an optional
                override of the exported <Code>ETHEREAL</Code> defaults.
              </Prose>
              <PropTable groups={ETHEREAL_GROUPS} />
            </Section>

            {/* States & audio */}
            <Section id="states" title="States & audio">
              <Prose>
                <Code>{"<Ethereal>"}</Code> and{" "}
                <Code>{"<EtherealWrap>"}</Code> accept a <Code>state</Code> prop
                — a named partial config merged over your base props. Change it
                and the rebuilt layers cross-fade. The three built-ins are
                exported as <Code>ETHEREAL_STATES</Code>.
              </Prose>
              <StatePropsTable />
              <Prose>
                Light and dark can also want different <em>values</em>, not
                just a dimmer version of the same glow — branch the base
                config with <Code>themes</Code>. It sits below states on
                purpose: a state is the more specific thing, so a named{" "}
                <Code>state</Code> can still override the theme baseline. The
                full merge order, lowest to highest:
              </Prose>
              <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.07] bg-white/[0.02] text-[11px] tracking-wide text-zinc-300 uppercase">
                      <th className="px-4 py-2.5 font-medium">Layer</th>
                      <th className="px-4 py-2.5 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        "1",
                        "exported defaults (ETHEREAL, EVENT_HORIZON, ETHEREAL_DITHER)",
                      ],
                      ["2", "your flat props"],
                      ["3", "themes[resolvedTheme]"],
                      [
                        "4",
                        "the named state's theme branch, then its hover/press slots",
                      ],
                      ["5", "the flat whileHover / whilePressed props"],
                    ].map(([layer, source], i, arr) => (
                      <tr
                        key={layer}
                        className={
                          "align-top transition-colors hover:bg-white/[0.02]" +
                          (i < arr.length - 1
                            ? " border-b border-white/[0.04]"
                            : "")
                        }
                      >
                        <td className="px-4 py-2.5 font-mono text-[13px] whitespace-nowrap text-foreground">
                          {layer}
                        </td>
                        <td className="max-w-md px-4 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
                          {source}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Prose>
                <Code>themes</Code> is the only per-theme mechanism — all three
                effects take it, and it is the whole light-mode story for each
                of them. &ldquo;Same config, just dimmer on white&rdquo; is{" "}
                <Code>{"themes={{ light: { strength: 0.6 } }}"}</Code>.
              </Prose>
              <CodeBlock code={STATES_CODE} />
              <CodeBlock code={CUSTOM_STATES_CODE} />

              <h3 className="pt-2 text-base font-semibold tracking-tight text-foreground">
                Audio reactivity
              </h3>
              <Prose>
                <Code>attachMicAudio(host, options)</Code> wires microphone
                input to the glow. It rides the shared ticker to set three host
                variables the layers already consume: <Code>--aud</Code> lifts
                the whole glow, <Code>--ahot</Code> swells the hotspot cores,
                and <Code>--fb0..7</Code> scale each needle&rsquo;s height by
                its frequency band — on <em>every</em> path, so your needles
                become the waveform rather than a separate widget appearing.
                All three rest at exactly <Code>1</Code>: a silent host renders
                identically to one that was never attached. Mic permission is
                requested only when you call it, never on mount.
              </Prose>
              <ul className="max-w-[68ch] space-y-2 text-[14px] leading-relaxed text-muted-foreground">
                <li>
                  <Code>sensitivity?: number</Code> (default <Code>1</Code>) —
                  multiplies the <em>deviation</em> from the resting look, not
                  the output, so <Code>0</Code> is a total no-op. The drive
                  auto-gains against a slowly-decaying peak, so a quiet mic and
                  a hot one both reach full drive without per-device tuning.
                </li>
                <li>
                  <Code>stream?: MediaStream</Code> — reuse a stream you already
                  hold (e.g. a call); it is <em>not</em> stopped on detach.
                  Streams the function opens itself are.
                </li>
              </ul>
              <Prose>
                Returns a <Code>Promise&lt;() =&gt; void&gt;</Code>. Call it
                after the effect mounts; the resolved function detaches, stops
                any stream it opened, and resets <Code>--aud</Code>,{" "}
                <Code>--ahot</Code> and <Code>--fb0..7</Code>. It rejects if
                permission is denied.
              </Prose>
              <CodeBlock code={AUDIO_CODE} />

              <h3 className="mt-10 mb-3 text-base font-medium text-foreground">
                Tuning this in the playground
              </h3>
              <Prose>
                The <Link to="/playground" className="underline underline-offset-2">playground</Link>{" "}
                edits the same cascade this page describes, one cell at a time. The{" "}
                <Code>Base</Code> row is the flat config every state inherits; each named
                state below it is a <Code>states</Code> entry. Inside a row, the two pill
                strips pick which cell you are editing: theme, then interaction slot.
              </Prose>
              <Prose>
                On the <Code>Base</Code> row the theme pills read <Code>base</Code> and{" "}
                <Code>dark ↑</Code> rather than light/dark, because the base config is not
                symmetric: <Code>base</Code> edits the shared flat props, and{" "}
                <Code>dark ↑</Code> writes a <Code>themes.dark</Code> override on top —
                the same shape as Tailwind&rsquo;s base styles plus{" "}
                <Code>dark:</Code> variants. On a named state the pills are plain{" "}
                <Code>light</Code> / <Code>dark</Code>, because a state really does have
                two symmetric branches.
              </Prose>
              <Prose>
                A green dot on a pill means that cell holds overrides; an amber dot beside
                a control means <em>this</em> cell sets it — click it to clear. Whichever
                control section you have expanded stays expanded as you switch theme, slot
                or state, so you can compare one group of values across cells without
                losing your place.
              </Prose>
            </Section>

            {/* 3. EventHorizon API */}
            <Section id="event-horizon-api" title="<EventHorizon> API">
              <Prose>
                A black-hole accretion disk: a white-hot head orbits, trailing a
                doppler-tinted plasma stream, wrapped in a graduated
                gravitational lens, a living photon rim and a lensed halo.
                Overrides the exported <Code>EVENT_HORIZON</Code> defaults.
              </Prose>
              <PropTable groups={EVENT_HORIZON_GROUPS} />

              <h3 className="pt-2 text-base font-semibold tracking-tight text-foreground">
                EVENT_HORIZON_PRESETS
              </h3>
              <Prose>
                Five ready-made configs, spread straight onto the component.
              </Prose>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(EVENT_HORIZON_PRESETS).map(([name, cfg]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3"
                  >
                    <span className="font-mono text-[13px] text-foreground">
                      {name}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {cfg.colors.map((c, i) => (
                        <span
                          key={i}
                          title={c}
                          className="size-4 rounded-full ring-1 ring-white/10"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <CodeBlock code={PRESETS_CODE} />

              <h3 className="pt-2 text-base font-semibold tracking-tight text-foreground">
                State, theme & interaction props
              </h3>
              <Prose>
                Identical to Ethereal's, with <Code>EventHorizonCfg</Code> as{" "}
                <Code>Cfg</Code> — <Code>state</Code>, <Code>states</Code>,{" "}
                <Code>themes</Code>, <Code>whileHover</Code>,{" "}
                <Code>whilePressed</Code> and the theme props all resolve
                through the same shared implementation. Built-in states:{" "}
                <Code>EVENT_HORIZON_STATES</Code>.
              </Prose>
              <StatePropsTable />
            </Section>

            {/* 4. EtherealDither API */}
            <Section id="ethereal-dither-api" title="<EtherealDither> API">
              <Prose>
                The same travelling comet, rendered as ordered-dithered blocks
                on a canvas instead of CSS gradients — a Bayer-quantized
                palette that reads as pixel art. It is the one effect that
                repaints every tick rather than writing CSS variables, so
                consider <Code>setTickRate(30)</Code> when you use it.
                Overrides the exported <Code>ETHEREAL_DITHER</Code> defaults.
              </Prose>
              <PropTable groups={ETHEREAL_DITHER_GROUPS} />

              <h3 className="pt-2 text-base font-semibold tracking-tight text-foreground">
                State, theme & interaction props
              </h3>
              <Prose>
                Identical to Ethereal's, with <Code>EtherealDitherCfg</Code> as{" "}
                <Code>Cfg</Code>. Built-in states:{" "}
                <Code>ETHEREAL_DITHER_STATES</Code>.
              </Prose>
              <StatePropsTable />
            </Section>

            {/* 5. Wrappers */}
            <Section id="wrappers" title="Wrap components">
              <Prose>
                <Code>{"<EtherealWrap>"}</Code> and{" "}
                <Code>{"<EventHorizonWrap>"}</Code> render the positioned,
                isolated host span for you and place the effect inside it, with
                your children on a raised layer. Use them when you can't edit the
                child — third-party components, or replaced elements like{" "}
                <Code>{"<input>"}</Code> and <Code>{"<textarea>"}</Code>, which
                can't contain the effect span at all.
              </Prose>
              <Prose>
                They accept every config prop, plus <Code>className</Code> and{" "}
                <Code>style</Code> on the wrapper. The glow follows the
                wrapper's border radius, so match it to the child (e.g. give
                children <Code>rounded-[inherit]</Code>).
              </Prose>
              <CodeBlock code={WRAP} />
            </Section>

            {/* 6. Behavior & performance */}
            <Section id="behavior" title="Behavior & performance">
              <ul className="max-w-[72ch] space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <li>
                  <strong className="font-medium text-foreground">
                    One shared ticker.
                  </strong>{" "}
                  A single <Code>requestAnimationFrame</Code> loop, targeting
                  ~60fps — one tick per frame on a 60Hz display; higher-refresh
                  displays are gated down to the target — drives every instance
                  of both effects; it stops entirely when the last instance
                  unmounts. Off-screen instances
                  pause via an IntersectionObserver (160px margin), and the loop
                  clamps <Code>dt</Code> after background-tab pauses so clocks
                  never jump.
                </li>
                <li>
                  <strong className="font-medium text-foreground">
                    Tunable frame rate.
                  </strong>{" "}
                  <Code>setTickRate(fps)</Code> changes the shared loop&rsquo;s
                  target — <Code>0</Code> ticks at the display&rsquo;s native
                  refresh rate, <Code>30</Code> halves the paint cost for
                  hero-size effects. Animation speed is unaffected either way,
                  since every effect integrates against wall-clock{" "}
                  <Code>dt</Code> rather than counting frames.
                </li>
                <li>
                  <strong className="font-medium text-foreground">
                    No layout thrash.
                  </strong>{" "}
                  Layout metrics are cached by a ResizeObserver and refreshed
                  only on real size changes — the per-frame code only writes CSS
                  custom properties, never reads <Code>offsetWidth</Code>/
                  <Code>offsetHeight</Code>.
                </li>
                <li>
                  <strong className="font-medium text-foreground">
                    Reduced motion.
                  </strong>{" "}
                  Under <Code>prefers-reduced-motion: reduce</Code> a single
                  static glow frame renders with no animation loop.
                </li>
                <li>
                  <strong className="font-medium text-foreground">
                    Host requirements.
                  </strong>{" "}
                  The parent must be <Code>position: relative</Code> +{" "}
                  <Code>isolation: isolate</Code>. A <Code>position: static</Code>{" "}
                  host is warned about in the console (the glow would anchor to
                  the wrong ancestor).
                </li>
                <li>
                  <strong className="font-medium text-foreground">
                    One effect per host.
                  </strong>{" "}
                  Mounting two effects (or two of the same) on the same element
                  makes them fight over the shared CSS variables; the second
                  logs a console warning. Give each effect its own host.
                </li>
                <li>
                  <strong className="font-medium text-foreground">
                    State transitions.
                  </strong>{" "}
                  Re-render with a different config and the rebuilt layers
                  cross-fade in over ~320ms — e.g. idle → audio → thinking on a
                  chat composer.
                </li>
                <li>
                  <strong className="font-medium text-foreground">
                    Theming & audio.
                  </strong>{" "}
                  The effect honors <Code>html[data-theme]</Code>,{" "}
                  <Code>.light</Code>/<Code>.dark</Code> classes, or the OS
                  scheme, so Tailwind's class strategy, shadcn/ui and
                  next-themes all work unconfigured; <Code>theme</Code> pins it
                  and <Code>themeDetector</Code> replaces the chain. One
                  document-wide observer and one <Code>matchMedia</Code>{" "}
                  listener serve every mounted instance, so a theme toggle
                  updates the glow live no matter how many are on the page (use{" "}
                  <Code>themes.light</Code> to tune any of the three effects for
                  light backgrounds). Audio drives{" "}
                  <Code>--aud</Code>, <Code>--ahot</Code> and{" "}
                  <Code>--fb0..7</Code>, all resting at <Code>1</Code> — see
                  Audio reactivity above.
                </li>
              </ul>
              <CodeBlock code={HOST_CODE} lang="css" />
              <Note>
                <strong className="font-semibold text-foreground">
                  Clipping caveat.
                </strong>{" "}
                With <Code>place: "external"</Code> / <Code>"ext-border"</Code> /{" "}
                <Code>"both"</Code> (and Event Horizon's halo always) the glow
                paints outside the host, so any ancestor that clips will cut it
                off: <Code>overflow</Code> hidden/auto/scroll/clip,{" "}
                <Code>contain: paint</Code>, <Code>clip-path</Code>, or a
                transformed ancestor with overflow. Pad the nearest scroll
                container by roughly <Code>glowBlur × 2 + 30px</Code>, lift the
                element out of the clipping wrapper, or use{" "}
                <Code>place: "internal"</Code>. Note that internal placement
                draws inside the element and barely reads on a solid bright fill —
                use external placement there, or keep ethereal elements
                dark/outlined.
              </Note>
            </Section>

          </div>
        </div>
      </div>
    </main>
  )
}

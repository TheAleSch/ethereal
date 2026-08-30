import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { pageHead } from "@/lib/head"
import {
  EtherealDither,
  EtherealDitherWrap,
  EtherealWrap,
  EventHorizon,
  EVENT_HORIZON_PRESETS,
} from "ethereal-glow"
import { Grid2x2 } from "lucide-react"

import { CodeBlock } from "@/components/home/code-block"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const Route = createFileRoute("/")({
  head: () => ({
    ...pageHead("/"),
    // Google Analytics (gtag.js) — landing page only
    scripts: [
      {
        src: "https://www.googletagmanager.com/gtag/js?id=G-J9T7KWF9P6",
        async: true,
      },
      {
        children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-J9T7KWF9P6');`,
      },
    ],
  }),
  component: Home,
})

// the shadcn path is the registry, not a copy-paste component — it drops an
// EtherealButton you own into components/ui/ and adds ethereal-glow as a
// dependency, so both tabs are an install command
const shadcnSnippet = `npx shadcn@latest add https://ethereal.ale.design/r/ethereal.json`

// Whole-entry ESM, minified and gzipped — the bundlephobia convention, and
// the honest number for the install command directly beside it. Importing a
// single component tree-shakes to 10.7 kB. Regenerate after a release:
//   npm run build
//   npx esbuild <(echo "export * from './packages/ethereal/dist/index.js'") \
//     --bundle --format=esm --minify --external:react \
//     --external:react/jsx-runtime | gzip -9 | wc -c
const BUNDLE_SIZE = "16.6 kB min+gzip"

const SUNSET = [
  "rgb(255,100,60)",
  "rgb(255,180,50)",
  "rgb(255,140,70)",
  "rgb(255,80,80)",
  "rgb(255,200,60)",
]
const EMBER = ["#ffb46b", "#ff8a3d", "#b58cff"]
// install-box border: a cyan/violet sweep, so the light reads as passing over
// the terminal rather than outlining it
const INSTALL_GLOW = [
  "rgb(40,180,220)",
  "rgb(100,70,255)",
  "rgb(40,140,255)",
  "rgb(30,185,170)",
]

const SPECS = [
  "Zero dependencies",
  "One shared loop, 60fps default",
  "Pauses off-screen",
  "Respects reduced motion",
  "Pure ESM + types",
]

function Home() {
  // dither mode: every live effect on the page swaps to its blocky
  // EtherealDither rendering
  const [dither, setDither] = useState(false)
  return (
    <main className="relative overflow-x-clip">
      {/* ambient wash — quiet, lets the live glows carry the identity */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(60%_60%_at_50%_-10%,rgba(120,90,255,0.12),transparent_70%)]"
      />

      {/* ── Hero ─────────────────────────────────────────────── */}
      {/* bottom padding is deliberately smaller than the top: the install
          section below adds none of its own, so the two paddings stopped
          stacking into an 11rem void */}
      <section className="container mx-auto grid items-center gap-10 px-4 pt-16 pb-10 sm:gap-14 sm:pt-20 sm:pb-12 lg:grid-cols-[1.05fr_0.95fr] lg:pt-28 lg:pb-12">
        <div className="max-w-xl">
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Travelling light,
            <br />
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              rendered in pure CSS.
            </span>
          </h1>

          {/* stacks full-width below sm — a 150px-wide CTA beside a
              150px-wide toggle reads as two half-broken buttons */}
          <div className="mt-9 flex flex-wrap items-center gap-4">
            {/* live effect #1 — travelling-light border on the primary CTA
                (Intelligence halo preset, amber palette; blocky in dither mode) */}
            {dither ? (
              <EtherealDitherWrap
                colors={SUNSET}
                duration={11}
                hotspots={3}
                hotSpread={40}
                className="w-full sm:w-auto"
                style={{ borderRadius: 12 }}
              >
                <Link
                  to="/playground"
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-10 py-3 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.08] sm:px-16"
                >
                  Playground
                </Link>
              </EtherealDitherWrap>
            ) : (
              <EtherealWrap
                path="around"
                place="both"
                duration={11}
                spotW={150}
                spotH={80}
                blendSoftness={1.3}
                glowBlur={16}
                needles={12}
                needleHeight={1.1}
                strokeOpacity={0.9}
                innerOpacity={0.5}
                bloomOpacity={0.9}
                hueRange={25}
                hotspots={3}
                hotSpread={40}
                hover="boost-speed"
                hoverAmount={1.2}
                colors={SUNSET}
                className="w-full sm:w-auto"
                style={{ borderRadius: 12 }}
              >
                <Link
                  to="/playground"
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-10 py-3 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.08] sm:px-16"
                >
                  Playground
                </Link>
              </EtherealWrap>
            )}

            <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 sm:w-auto sm:justify-start">
              <Switch
                id="dither-mode"
                checked={dither}
                onCheckedChange={setDither}
              />
              <Label
                htmlFor="dither-mode"
                className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Grid2x2 className="size-4" /> Dither mode
              </Label>
            </div>
          </div>
        </div>

        {/* live effect #2 — Event Horizon accretion glow on a showcase panel */}
        <div className="flex justify-center lg:justify-end">
          <div className="relative isolate flex aspect-square w-full max-w-[17rem] flex-col items-center justify-center gap-3 rounded-full border border-white/10 bg-black/40 p-8 text-center sm:max-w-sm sm:p-14">
            {dither ? (
              <EtherealDither
                colors={EMBER}
                duration={14}
                corner={1}
                block={4}
                reach={130}
                band={14}
              />
            ) : (
              <EventHorizon
                {...EVENT_HORIZON_PRESETS["Ember disk"]}
                duration={14}
                corner={1}
              />
            )}
            {/* the label follows what actually renders — dither mode swaps in
                EtherealDither, and captioning that <EventHorizon/> sent people
                to copy a component that looks nothing like what they saw */}
            <span className="relative z-10 text-lg font-medium text-foreground">
              {dither ? (
                <>&lt;EtherealDither /&gt;</>
              ) : (
                <>&lt;EventHorizon /&gt;</>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* ── Install ──────────────────────────────────────────── */}
      <section className="container mx-auto px-4 pt-0 pb-16">
        {/* min-w-0: a non-wrapping <pre>'s min-content would otherwise force
            the column wider than small viewports and clip */}
        <div className="mx-auto max-w-2xl min-w-0 space-y-4">
          <Tabs defaultValue="npm">
            <TabsList
              variant="line"
              className="mb-3 w-full justify-start gap-4 border-b border-white/10"
            >
              <TabsTrigger
                value="npm"
                className="flex-none rounded-sm px-1 font-mono text-xs after:bottom-[-1px]"
              >
                npm
              </TabsTrigger>
              <TabsTrigger
                value="shadcn"
                className="flex-none rounded-sm px-1 font-mono text-xs after:bottom-[-1px]"
              >
                shadcn/ui
              </TabsTrigger>
            </TabsList>
            <TabsContent value="npm">
              {/* live effect #3 — Ethereal border around the install command */}
              <InstallBorder dither={dither}>
                <CodeBlock
                  label="terminal"
                  meta={BUNDLE_SIZE}
                  code="npm install ethereal-glow"
                />
              </InstallBorder>
            </TabsContent>
            <TabsContent value="shadcn">
              <InstallBorder dither={dither}>
                <CodeBlock
                  label="terminal"
                  meta={BUNDLE_SIZE}
                  code={shadcnSnippet}
                />
              </InstallBorder>
            </TabsContent>
          </Tabs>

          {/* trust signals sit next to the ask, not in their own section —
              the full detail lives in /docs#behavior */}
          <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 pt-2 text-center font-mono text-xs text-muted-foreground">
            {SPECS.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                {i > 0 && (
                  <span aria-hidden className="text-white/20">
                    ·
                  </span>
                )}
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}

function InstallBorder({
  dither,
  children,
}: {
  dither: boolean
  children: React.ReactNode
}) {
  return dither ? (
    // the blocky twin of the tuned config below — same palette, lap and
    // hotspot fan, translated to the props Dither actually has. block stays
    // off the default 2, which is too fine to read as dithering on a box
    // this wide and just looks like a soft glow.
    <EtherealDitherWrap
      className="w-full"
      colors={INSTALL_GLOW}
      path="around"
      heads={2}
      place="both"
      duration={8}
      block={4}
      levels={4}
      reach={150}
      band={16}
      hotspots={5}
      hotSpread={23}
      wander={0.3}
      flicker={0.35}
      saturation={2}
      brightness={0.6}
      hueRange={6}
      style={{ borderRadius: 12, display: "block" }}
    >
      {children}
    </EtherealDitherWrap>
  ) : (
    // tuned in the playground. Nearly every knob sits in `themes.dark` rather
    // than on the element: the site renders dark, and keeping the flat props
    // to the handful that are theme-independent means a future light variant
    // is a second branch, not a rewrite.
    <EtherealWrap
      className="w-full"
      heads={2}
      hover="boost"
      trail={1.2}
      hotspots={2}
      hotSpread={24}
      themes={{
        dark: {
          path: "around",
          duration: 6.2,
          breatheAmp: 0.25,
          spotSamples: 9,
          trail: 3,
          trailFade: 1,
          spotW: 56,
          spotH: 81,
          spotOffset: 30,
          hotspots: 5,
          colors: INSTALL_GLOW,
          spotBlur: 5.5,
          blendSoftness: 0.45,
          strokeWidth: 1.5,
          glowBlur: 24,
          strokeOpacity: 1.6,
          innerOpacity: 0,
          bloomOpacity: 1.6,
          strength: 1.4,
          lead: 1.8,
          pulseMin: 0.65,
          pulseMax: 1.65,
          needleJitter: true,
        },
      }}
      style={{ borderRadius: 12, display: "block" }}
    >
      {children}
    </EtherealWrap>
  )
}

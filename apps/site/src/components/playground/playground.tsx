"use client"

import { cloneElement, useCallback, useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"
import { getRouteApi } from "@tanstack/react-router"
import {
  Ethereal,
  EtherealDither,
  EventHorizon,
  ETHEREAL_STATES,
  deriveEtherealState,
  THEME_VARIANTS,
  INTERACTION_VARIANTS,
  isPaused,
  setPaused,
} from "@theale/ethereal"
import type {
  EtherealCfg,
  InteractionSlot,
  ThemeConfig,
} from "@theale/ethereal"
import {
  RotateCcw,
  Link2,
  Check,
  Moon,
  Pause,
  Pin,
  Play,
  Sun,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useCopy } from "@/lib/use-copy"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ControlSections, CopyButton } from "./controls"
import { CopyForAi } from "./copy-for-ai"
import { HOST_CLASS, surfaceClass } from "./host-snippet"
import type { PreviewHostKind } from "./preview-host-kind"
import { PerfHud } from "./perf-hud"
import { StatesEditor, withoutState } from "./states-editor"
import type { PresetOverrides, StateMap } from "./states-editor"
import { pinnedStateOverride } from "./pinned-state"
import {
  ETHEREAL,
  ETHEREAL_DITHER,
  EVENT_HORIZON,
  ETHEREAL_CONTROLS,
  ETHEREAL_PRESETS,
  ETHEREAL_PRESET_GROUPS,
  DITHER_CONTROLS,
  DITHER_PRESETS,
  DITHER_PRESET_GROUPS,
  EH_CONTROLS,
  EH_PRESETS,
  diffCfg,
  genCode,
  matchPreset,
  parseOverrides,
  splitSections,
} from "./presets"
import type { ControlDef } from "./presets"

const route = getRouteApi("/playground")

type Tab = "ethereal" | "eh" | "dither"

const COMPONENT_OF: Record<Tab, string> = {
  ethereal: "<Ethereal>",
  eh: "<EventHorizon>",
  dither: "<EtherealDither>",
}
type AnyCfg = Record<string, unknown>

const ETHEREAL_STATE_OPTIONS = [
  { value: "idle", label: "idle" },
  { value: "thinking", label: "thinking" },
]

// canonicalize an override set to base key order so preset matching is
// insensitive to how the object was authored
function norm(ov: AnyCfg, base: AnyCfg): AnyCfg {
  return diffCfg({ ...base, ...ov }, base)
}

/** Re-attach a normalized dark branch so a preset and the live editor state
 *  compare as ONE value. Without this a preset would "match" the moment its
 *  flat half did, and picking a themed preset then clearing its dark branch
 *  would still read as that preset in the picker. `themes` goes on last on
 *  both sides so the JSON key order agrees. */
const withDark = (flat: AnyCfg, dark: AnyCfg): AnyCfg =>
  Object.keys(dark).length ? { ...flat, themes: { dark } } : flat

// Landing default: the Orbit preset, initialized exactly as picking it in
// the preset select would — light-tuned flat config plus the themes.dark
// branch — so the picker reads "Orbit" on load and both backdrops render
// the tuned variant.
const { themes: ORBIT_THEMES, ...ORBIT_FLAT } = ETHEREAL_PRESETS["Orbit"]

const NORM_E_PRESETS = Object.fromEntries(
  Object.entries(ETHEREAL_PRESETS).map(([n, ov]) => {
    const { themes, ...flat } = ov
    return [
      n,
      withDark(norm(flat, ETHEREAL), norm(themes?.dark ?? {}, ETHEREAL)),
    ]
  })
)
const NORM_H_PRESETS = Object.fromEntries(
  Object.entries(EH_PRESETS).map(([n, ov]) => [
    n,
    norm(ov, EVENT_HORIZON as AnyCfg),
  ])
)
const NORM_D_PRESETS = Object.fromEntries(
  Object.entries(DITHER_PRESETS).map(([n, ov]) => [
    n,
    norm(ov, ETHEREAL_DITHER as AnyCfg),
  ])
)

export function Playground() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  // initial state is ALWAYS the defaults — the route is prerendered without
  // search params, so reading them during the first render would hydrate a
  // tree that differs from the static HTML. Shared-link params apply in the
  // mount effect below instead.
  const [tab, setTab] = useState<Tab>("ethereal")
  const [eCfg, setECfg] = useState<typeof ETHEREAL>(() => ({
    ...ETHEREAL,
    ...ORBIT_FLAT,
  }))
  const [hCfg, setHCfg] = useState(() => ({ ...EVENT_HORIZON }))
  const [dCfg, setDCfg] = useState(() => ({ ...ETHEREAL_DITHER }))
  const [theme, setTheme] = useState<"light" | "dark">("dark")
  const [eState, setEState] = useState<string>("idle")
  const [eStates, setEStates] = useState<StateMap>({})
  // per-theme base config — the Base cell's light/dark branches
  const [eThemes, setEThemes] = useState<ThemeConfig<EtherealCfg>>(() =>
    ORBIT_THEMES?.dark ? { dark: ORBIT_THEMES.dark } : {}
  )
  const [eFade, setEFade] = useState(320)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (search.tab) setTab(search.tab)
    if (search.c) {
      setECfg({ ...ETHEREAL, ...parseOverrides(search.c, ETHEREAL) })
      // a shared link IS the whole ethereal config: without an explicit tm
      // branch the Orbit default's themes.dark must not bleed into it
      if (!search.tm) setEThemes({})
    }
    if (search.h)
      setHCfg({ ...EVENT_HORIZON, ...parseOverrides(search.h, EVENT_HORIZON) })
    if (search.d)
      setDCfg({
        ...ETHEREAL_DITHER,
        ...parseOverrides(search.d, ETHEREAL_DITHER),
      })
    if (search.st) {
      const map: StateMap = {}
      for (const [name, part] of Object.entries(search.st)) {
        if (typeof name !== "string" || !/^[a-z0-9-]{1,32}$/.test(name))
          continue
        // built-in names never travel as CUSTOM state data: the editor can't
        // create them, and a link carrying one would shadow the package state
        if (name === "idle" || name in ETHEREAL_STATES) continue
        if (!part || typeof part !== "object") continue
        // nested shape: state → theme → interaction → partial config, both
        // levels enumerated by the package so a new slot round-trips
        // automatically
        const entry: StateMap[string] = {}
        for (const themeVariant of THEME_VARIANTS) {
          const themePart = (part as Record<string, unknown>)[themeVariant] as
            Record<string, unknown> | undefined
          if (!themePart || typeof themePart !== "object") continue
          const slots: Record<string, unknown> = {}
          for (const slot of INTERACTION_VARIANTS) {
            const clean = parseOverrides(
              themePart[slot] as Record<string, unknown> | undefined,
              ETHEREAL
            )
            if (Object.keys(clean).length) slots[slot] = clean
          }
          if (Object.keys(slots).length) entry[themeVariant] = slots
        }
        if (Object.keys(entry).length) map[name] = entry
      }
      if (Object.keys(map).length) setEStates(map)
    }
    if (search.tm) {
      // clamp per branch — parseOverrides is what stops a hostile link
      // (?tm={"dark":{"needles":1e8}}) from reaching the animation clocks
      const next: ThemeConfig<EtherealCfg> = {}
      for (const t of THEME_VARIANTS) {
        const branch = parseOverrides(
          search.tm[t] as Record<string, unknown> | undefined,
          ETHEREAL
        )
        if (Object.keys(branch).length) next[t] = branch
      }
      // the PROP is symmetric, but this editor's convention is "light IS the
      // base, dark overrides it" — there is no light cell to show or clear a
      // themes.light branch in, so a hand-written or legacy link carrying one
      // would render an override nothing on screen could reach. Fold it into
      // the flat base config instead: the light preview is byte-identical,
      // every folded key becomes visible and editable, and any dark-specific
      // value the link also carried still wins on top of it.
      const { light, ...rest } = next
      if (light) setECfg((c) => ({ ...c, ...light }))
      // always replace: a light-only link must clear the Orbit default's dark
      // branch, not inherit it
      setEThemes(rest)
    }
    if (
      search.s &&
      (ETHEREAL_STATE_OPTIONS.some((o) => o.value === search.s) ||
        (search.st && search.s in search.st))
    )
      setEState(search.s)
    setHydrated(true)
    // apply the shared link exactly once, after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eOv = useMemo(() => diffCfg(eCfg, ETHEREAL), [eCfg])
  const hOv = useMemo(() => diffCfg(hCfg, EVENT_HORIZON), [hCfg])
  const dOv = useMemo(() => diffCfg(dCfg, ETHEREAL_DITHER), [dCfg])

  // keep the URL in sync — shareable links encode tab + per-effect overrides.
  // Gated on `hydrated` so the defaults-first mount can't wipe the incoming
  // params before the effect above applies them.
  useEffect(() => {
    if (!hydrated) return
    // debounced: Safari hard-throttles history.replaceState (100/30s) and a
    // slider drag would blow straight through that
    const timer = setTimeout(() => {
      navigate({
        replace: true,
        // URL sync must never touch the scroll position — without this every
        // slider tick jumps the page back to the top
        resetScroll: false,
        search: {
          tab,
          // raw objects — the router's search serializer JSON-encodes them
          c: Object.keys(eOv).length
            ? (eOv as Record<string, unknown>)
            : undefined,
          h: Object.keys(hOv).length
            ? (hOv as Record<string, unknown>)
            : undefined,
          d: Object.keys(dOv).length
            ? (dOv as Record<string, unknown>)
            : undefined,
          s: eState !== "idle" ? eState : undefined,
          st: Object.keys(eStates).length
            ? (eStates as Record<string, unknown>)
            : undefined,
          tm: Object.keys(eThemes).length
            ? (eThemes as Record<string, unknown>)
            : undefined,
        },
      })
    }, 250)
    return () => clearTimeout(timer)
    // navigate is stable; re-run only when the shareable state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, eOv, hOv, dOv, eState, eStates, eThemes, hydrated])

  const ePreset = matchPreset(
    withDark(eOv, norm(eThemes.dark ?? {}, ETHEREAL)),
    NORM_E_PRESETS
  )
  const hPreset = matchPreset(hOv, NORM_H_PRESETS)
  const dPreset = matchPreset(dOv, NORM_D_PRESETS)

  const setEControl = useCallback(
    (k: string, v: unknown) => setECfg((c) => ({ ...c, [k]: v })),
    []
  )
  const setHControl = useCallback(
    (k: string, v: unknown) => setHCfg((c) => ({ ...c, [k]: v })),
    []
  )
  const setDControl = useCallback(
    (k: string, v: unknown) =>
      setDCfg((c: typeof ETHEREAL_DITHER) => ({ ...c, [k]: v })),
    []
  )

  // shared with the code and "copy for AI" buttons — same flash, and a
  // timeout that is cleared on unmount rather than left to fire into a
  // component that has navigated away
  const { copied: linkCopied, copy } = useCopy()
  const copyLink = useCallback(() => {
    if (typeof window === "undefined") return
    void copy(window.location.href)
  }, [copy])

  // state (when non-idle) leads the prop list — it overrides base props at runtime
  const eCode = useMemo(() => {
    const extra: AnyCfg = {}
    if (eState !== "idle") extra.state = eState
    if (Object.keys(eStates).length) extra.states = eStates
    if (Object.keys(eThemes).length) extra.themes = eThemes
    if (eFade !== 320) extra.transitionMs = eFade
    return genCode("Ethereal", { ...extra, ...eOv })
  }, [eOv, eState, eStates, eThemes, eFade])
  const hCode = useMemo(() => genCode("EventHorizon", hOv as AnyCfg), [hOv])
  const dCode = useMemo(() => genCode("EtherealDither", dOv as AnyCfg), [dOv])

  return (
    // app shell at lg+: the page itself never scrolls, each column scrolls on
    // its own so the preview stays put. Below lg the grid is one column and
    // nested scroll containers are worse than plain page scroll, so the
    // height cap and every overflow rule are gated to lg.
    <main className="relative flex min-h-svh flex-col lg:h-svh lg:min-h-0 lg:overflow-hidden">
      <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 pt-24 pb-10 lg:pb-6">
        <header className="mb-8 lg:mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Playground</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Tune all three effects live, copy the exact JSX, and share the URL —
            the current configuration is encoded in the link.
          </p>
        </header>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList
            variant="line"
            className="mb-6 w-full shrink-0 justify-start gap-4 border-b border-white/10 lg:mb-4"
          >
            <TabsTrigger
              value="ethereal"
              className="flex-none rounded-sm px-1 font-mono text-xs after:bottom-[-1px]"
            >
              Ethereal
            </TabsTrigger>
            <TabsTrigger
              value="eh"
              className="flex-none rounded-sm px-1 font-mono text-xs after:bottom-[-1px]"
            >
              Event Horizon
            </TabsTrigger>
            <TabsTrigger
              value="dither"
              className="flex-none rounded-sm px-1 font-mono text-xs after:bottom-[-1px]"
            >
              Dither
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="ethereal"
            className="flex min-h-0 flex-1 flex-col"
          >
            <EffectSection
              kind="ethereal"
              cfg={eCfg}
              controls={ETHEREAL_CONTROLS}
              presetNames={Object.keys(ETHEREAL_PRESETS)}
              presetGroups={ETHEREAL_PRESET_GROUPS}
              presets={ETHEREAL_PRESETS}
              defaultCfg={ETHEREAL}
              derive={deriveEtherealState}
              presetValue={ePreset}
              onPreset={(n) => {
                // a preset owns BOTH cells — picking one must replace the dark
                // branch too, or the previous preset's dark overrides survive
                // on top of the new base and you get a config nobody authored
                const { themes, ...flat } = ETHEREAL_PRESETS[n] ?? {}
                setECfg({ ...ETHEREAL, ...flat })
                setEThemes(themes?.dark ? { dark: themes.dark } : {})
              }}
              onControl={setEControl}
              onReset={() => {
                setECfg({ ...ETHEREAL })
                setEState("idle")
                setEStates({})
                setEThemes({})
              }}
              onCopyLink={copyLink}
              linkCopied={linkCopied}
              code={eCode}
              preview={
                <Ethereal
                  state={eState}
                  states={eStates}
                  themes={eThemes}
                  transitionMs={eFade}
                  theme={theme}
                  {...eCfg}
                />
              }
              label="Get started"
              stateValue={eState}
              stateOptions={ETHEREAL_STATE_OPTIONS}
              onState={setEState}
              statesMap={eStates}
              onStatesChange={setEStates}
              themes={eThemes}
              onThemesChange={setEThemes}
              stateFade={eFade}
              onStateFade={setEFade}
              previewTheme={theme}
              onPreviewTheme={setTheme}
            />
          </TabsContent>

          <TabsContent value="eh" className="flex min-h-0 flex-1 flex-col">
            <EffectSection
              kind="eh"
              cfg={hCfg}
              controls={EH_CONTROLS}
              presetNames={Object.keys(EH_PRESETS)}
              presets={EH_PRESETS}
              defaultCfg={EVENT_HORIZON}
              presetValue={hPreset}
              onPreset={(n) => setHCfg({ ...EVENT_HORIZON, ...EH_PRESETS[n] })}
              onControl={setHControl}
              onReset={() => setHCfg({ ...EVENT_HORIZON })}
              onCopyLink={copyLink}
              linkCopied={linkCopied}
              code={hCode}
              preview={<EventHorizon theme={theme} {...hCfg} />}
              label="Enter the void"
              previewTheme={theme}
              onPreviewTheme={setTheme}
            />
          </TabsContent>

          <TabsContent value="dither" className="flex min-h-0 flex-1 flex-col">
            <EffectSection
              kind="dither"
              cfg={dCfg}
              controls={DITHER_CONTROLS}
              presetNames={Object.keys(DITHER_PRESETS)}
              presets={DITHER_PRESETS}
              defaultCfg={ETHEREAL_DITHER}
              presetValue={dPreset}
              onPreset={(n) =>
                setDCfg({ ...ETHEREAL_DITHER, ...DITHER_PRESETS[n] })
              }
              onControl={setDControl}
              onReset={() => setDCfg({ ...ETHEREAL_DITHER })}
              onCopyLink={copyLink}
              linkCopied={linkCopied}
              code={dCode}
              preview={<EtherealDither theme={theme} {...dCfg} />}
              label="Insert coin"
              presetGroups={DITHER_PRESET_GROUPS}
              previewTheme={theme}
              onPreviewTheme={setTheme}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}

function EffectSection({
  kind,
  cfg,
  controls,
  presetNames,
  presetValue,
  onPreset,
  onControl,
  onReset,
  onCopyLink,
  linkCopied,
  code,
  preview,
  label,
  presetGroups,
  presets,
  defaultCfg,
  derive,
  stateValue,
  stateOptions,
  onState,
  statesMap,
  onStatesChange,
  themes,
  onThemesChange,
  stateFade,
  onStateFade,
  previewTheme,
  onPreviewTheme,
}: {
  kind: Tab
  cfg: AnyCfg
  controls: ControlDef<string>[]
  presetNames: string[]
  presetValue: string
  onPreset: (name: string) => void
  onControl: (key: string, value: unknown) => void
  onReset: () => void
  onCopyLink: () => void
  linkCopied: boolean
  code: string
  preview: React.ReactNode
  label: string
  presetGroups?: { label: string; names: string[] }[]
  /** the preset CONFIGS behind `presetNames` — the states editor writes one
   *  into a state, so it needs the override sets, not just the labels */
  presets?: Record<string, PresetOverrides>
  /** the package defaults those overrides are expressed against */
  defaultCfg?: AnyCfg
  /** the effect's derived-state rule, so the states editor can show what an
   *  empty state renders as and when there is a derived look to return to */
  derive?: (cfg: EtherealCfg, state: string) => Partial<EtherealCfg>
  stateValue?: string
  stateOptions?: { value: string; label: string }[]
  onState?: (v: string) => void
  statesMap?: StateMap
  onStatesChange?: (next: StateMap) => void
  themes?: ThemeConfig<EtherealCfg>
  onThemesChange?: (next: ThemeConfig<EtherealCfg>) => void
  stateFade?: number
  onStateFade?: (v: number) => void
  previewTheme: "light" | "dark"
  onPreviewTheme: (t: "light" | "dark") => void
}) {
  const presetItems =
    presetValue === "Custom" ? ["Custom", ...presetNames] : presetNames
  const activeNamedState =
    stateValue && stateValue !== "idle" ? stateValue : null
  const resetEditor = () => {
    if (activeNamedState && statesMap && onStatesChange) {
      onStatesChange(withoutState(statesMap, activeNamedState))
      // A custom state disappears when its entry is removed; built-ins remain
      // active and fall back to their derived variation.
      if (!stateOptions?.some((option) => option.value === activeNamedState))
        onState?.("idle")
      return
    }
    onReset()
  }
  const sections = useMemo(() => splitSections(controls), [controls])
  // which control section is expanded, owned HERE rather than by each cell:
  // switching theme, slot or state swaps the rendered editor, and a per-cell
  // accordion would snap back to `color` every time — you lose your place
  // mid-tweak, which is exactly when you are switching.
  const [openSections, setOpenSections] = useState<string[]>(() => [
    sections[0]?.title ?? "",
  ])
  // chat is the demo that sells the effect — a composer-sized host shows the
  // travelling light as product chrome, where the tiny button reads as a toy
  const [host, setHost] = useState<PreviewHostKind>("chat")
  // pausing is process-wide (see setPaused), so this mirrors it rather than
  // owning it — remount must not silently leave the loop frozen
  const [frozen, setFrozen] = useState(() => isPaused())
  useEffect(() => () => setPaused(false), [])
  // the backdrop IS the effect's theme — one control: light surface previews
  // the light variant, dark the dark one
  const backdrop = previewTheme
  const setBackdrop = onPreviewTheme
  // the interaction slot pinned into the preview so hover/press treatments
  // stay visible while the pointer is over the control panel — no forcing
  // API in the package, just merging the active state's variant into the
  // props the preview element already receives.
  //
  const [pinned, setPinned] = useState<InteractionSlot>("base")
  // resolved in pinned-state.ts, which mirrors mergeConfig's layer order — see
  // that file for why this cascade cannot simply be spread over state/states
  const pinnedOver = pinnedStateOverride({
    slot: pinned,
    stateName: stateValue ?? "idle",
    theme: previewTheme,
    cfg,
    // the tab's own package defaults; ETHEREAL only stands in for the tabs
    // that have no states editor yet, where nothing reads it
    defaults: (defaultCfg ?? ETHEREAL) as EtherealCfg,
    themes,
    builtIns: ETHEREAL_STATES,
    custom: statesMap,
    derive,
  })
  const pinnedPreview =
    pinned !== "base" && preview
      ? cloneElement(preview as ReactElement, pinnedOver)
      : preview

  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_22rem]">
      {/* preview + code — its own scroll container at lg+, so a long code
          block scrolls without moving the controls beside it */}
      {/* min-w-0: a grid item's default min-width is min-content, and the
          generated-JSX <pre> below has a very wide min-content — a long
          `themes` prop physically pushed this whole column off the page
          before the cap. overflow-auto on the <pre> cannot fix that on its
          own; the ancestor has to be allowed to be narrower than its content. */}
      <div className="flex min-h-0 min-w-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
        <div
          className={cn(
            // pt clears the absolutely-positioned host/theme toolbars; the
            // narrower padding below sm is what keeps the 18rem-wide `card`
            // host from being clipped on a phone
            // longhand on both sides on purpose — mixing `pt-16` with a
            // `sm:p-8` shorthand makes the override depend on Tailwind's
            // property sort order rather than on the breakpoint
            // lg:flex-1 lets the preview absorb the leftover column height
            // instead of leaving dead space under the code block
            "relative flex min-h-[20rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl border px-4 pt-16 pb-8 sm:min-h-[22rem] sm:px-8 sm:pt-8 sm:pb-8 lg:flex-1",
            backdrop === "dark"
              ? "border-white/5 bg-[radial-gradient(120%_120%_at_50%_0%,#12131a_0%,#0a0a0f_55%,#050507_100%)]"
              : "border-black/10 bg-[radial-gradient(120%_120%_at_50%_0%,#ffffff_0%,#f3f4f8_60%,#e8eaf1_100%)]"
          )}
        >
          {backdrop === "dark" && <StarField />}
          <PerfHud />
          {/* freeze the animation to inspect or tune a single frame. Process-
              wide, because the loop is — which is fine here, every effect on
              this page is the one being tuned. */}
          <button
            type="button"
            onClick={() => {
              const next = !frozen
              setPaused(next)
              setFrozen(next)
            }}
            aria-pressed={frozen}
            aria-label={frozen ? "resume the animation" : "pause the animation"}
            title={frozen ? "resume" : "pause — tweak a frozen frame"}
            className="hit-44 absolute bottom-3 left-3 z-20 flex size-7 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
          >
            {frozen ? (
              <Play className="size-3.5" />
            ) : (
              <Pause className="size-3.5" />
            )}
          </button>
          {/* backdrop toggle — preview the glow on a light surface */}
          <div className="absolute top-3 right-3 z-20 flex rounded-lg border border-white/10 bg-black/50 p-0.5 backdrop-blur-sm">
            {(["dark", "light"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setBackdrop(m)}
                aria-pressed={backdrop === m}
                aria-label={`${m} backdrop`}
                className={cn(
                  "hit-44-tight flex size-6 items-center justify-center rounded-md transition-colors",
                  backdrop === m
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "dark" ? (
                  <Moon className="size-3.5" />
                ) : (
                  <Sun className="size-3.5" />
                )}
              </button>
            ))}
          </div>
          {/* preview host selector — try the effect on different elements */}
          <div className="absolute top-3 left-3 z-20 flex rounded-lg border border-white/10 bg-black/50 p-0.5 backdrop-blur-sm">
            {(["button", "chat", "card", "pill"] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHost(h)}
                aria-pressed={host === h}
                aria-label={`${h} preview host`}
                className={cn(
                  "hit-44-tight rounded-md px-2 py-1 text-[10px] font-medium capitalize transition-colors sm:px-2.5 sm:text-[11px]",
                  host === h
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {h}
              </button>
            ))}
          </div>
          <PreviewHost
            host={host}
            kind={kind}
            label={label}
            preview={pinnedPreview}
            light={backdrop === "light"}
          />
          {pinned !== "base" && (
            <button
              type="button"
              onClick={() => setPinned("base")}
              // the whole chip stays clickable — the X is an affordance, not
              // the only target, so a mis-aimed click still releases
              aria-label={`release pinned ${pinned === "whileHover" ? "hover" : "click"} preview`}
              title="click to release"
              // the chip sits ON the preview surface, which the backdrop
              // toggle flips — amber-200 on a translucent amber fill is legible
              // over near-black and vanishes over near-white, so the palette
              // has to follow the backdrop rather than the app theme
              className={cn(
                "group absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-2.5 text-[11px] font-medium transition-colors",
                backdrop === "light"
                  ? "border-amber-600/40 bg-amber-400/25 text-amber-900 hover:bg-amber-400/40"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
              )}
            >
              <Pin className="size-3" />
              pinned: {pinned === "whileHover" ? "hover" : "click"}
              <span
                aria-hidden
                className={cn(
                  "ml-0.5 flex size-4 items-center justify-center rounded-full transition-colors",
                  backdrop === "light"
                    ? "text-amber-900/60 group-hover:bg-amber-500/30 group-hover:text-amber-950"
                    : "text-amber-200/60 group-hover:bg-amber-400/20 group-hover:text-amber-100"
                )}
              >
                <X className="size-3" />
              </span>
            </button>
          )}
        </div>

        {/* shrink-0: the preview above takes lg:flex-1, so without this the
            code panel is the thing that gives — on a short viewport its header
            (and both copy buttons) got squeezed past the bottom edge, out of
            reach, instead of the column scrolling */}
        <div className="min-w-0 shrink-0 overflow-hidden rounded-xl border border-white/5 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <span className="font-mono text-xs text-muted-foreground">JSX</span>
            <div className="flex items-center gap-1.5">
              <CopyForAi
                code={code}
                effect={COMPONENT_OF[kind]}
                host={host}
                label={label}
                kind={kind}
                light={backdrop === "light"}
              />
              <CopyButton value={code} className="size-7" />
            </div>
          </div>
          {/* capped and scrollable: the generated JSX grows a line per override,
              and with the preview on lg:flex-1 in the same column every added
              prop stole height from the preview — the effect visibly resized
              while you were tuning it */}
          <pre className="max-h-56 overflow-auto p-4 text-xs leading-relaxed text-foreground/80">
            <code>{code}</code>
          </pre>
        </div>
      </div>

      {/* controls — the long column, and the one that actually needs to
          scroll independently */}
      <div className="flex min-h-0 flex-col gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-3 sm:p-4 lg:overflow-y-auto">
        <div className="grid grid-cols-[4.25rem_1fr] items-center gap-3 sm:grid-cols-[5.5rem_1fr]">
          <span className="font-mono text-xs text-muted-foreground">
            preset
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={presetValue}
              onValueChange={(v) => v && v !== "Custom" && onPreset(String(v))}
            >
              <SelectTrigger
                className="min-h-11 w-full"
                aria-label="main preset"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presetValue === "Custom" && (
                  <SelectItem value="Custom" disabled>
                    Custom
                  </SelectItem>
                )}
                {presetGroups
                  ? presetGroups.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.names.map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  : presetItems
                      .filter((n) => n !== "Custom")
                      .map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={resetEditor}
              title={
                activeNamedState
                  ? `reset ${activeNamedState} state`
                  : "reset the whole effect"
              }
              aria-label={
                activeNamedState
                  ? `reset ${activeNamedState} state`
                  : "reset the whole effect"
              }
              className="hit-44 flex size-8 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
        </div>

        {stateOptions && onState && statesMap && onStatesChange ? (
          <StatesEditor
            controls={controls as never}
            baseSlot={
              <ControlSections
                sections={sections}
                valueOf={(key) => (cfg as Record<string, unknown>)[key]}
                onChange={(key, v) => onControl(key, v)}
                open={openSections}
                onOpenChange={setOpenSections}
              />
            }
            states={statesMap}
            active={stateValue ?? "idle"}
            baseCfg={cfg as never}
            onActive={onState}
            onChange={onStatesChange}
            themes={themes ?? {}}
            onThemes={onThemesChange}
            fade={stateFade}
            onFade={onStateFade}
            previewTheme={previewTheme}
            onPreviewTheme={onPreviewTheme}
            pinned={pinned}
            onPinned={setPinned}
            openSections={openSections}
            onOpenSections={setOpenSections}
            // a state can start from any preset this tab offers — same list,
            // same grouping as the picker at the top of this panel
            presets={presets}
            presetGroups={presetGroups}
            defaultCfg={defaultCfg as never}
            derive={derive}
          />
        ) : (
          <>
            <ControlSections
              sections={sections}
              valueOf={(key) => (cfg as Record<string, unknown>)[key]}
              onChange={(key, v) => onControl(key, v)}
              open={openSections}
              onOpenChange={setOpenSections}
            />
          </>
        )}

        <div className="h-px bg-white/5" />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopyLink}
            className="hit-44-tight inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 text-xs text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
          >
            {linkCopied ? (
              <Check className="size-3.5 text-emerald-400" />
            ) : (
              <Link2 className="size-3.5" />
            )}{" "}
            {linkCopied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  )
}

// alternate demo hosts — the effect element renders INSIDE each host, so
// switching hosts remounts the effect on a different element shape
function PreviewHost({
  host,
  kind,
  label,
  preview,
  light,
}: {
  host: PreviewHostKind
  kind: Tab
  label: string
  preview: React.ReactNode
  light?: boolean
}) {
  // the demo-content re-tint is playground-only: it targets the site's own
  // utility classes, which a user's app does not have, so it stays here
  // rather than in the shared surfaceClass the snippet also uses
  const surface = cn(
    surfaceClass(kind, !!light),
    light &&
      "[&_.text-foreground]:text-zinc-900 [&_.text-muted-foreground]:text-zinc-500"
  )
  if (host === "chat") {
    return (
      <div data-fx-host="" className={cn(HOST_CLASS.chat, surface)}>
        {/* This is only a visual host preview, not a working chat composer.
            Keep its decorative controls out of the accessibility tree. */}
        <span
          aria-hidden="true"
          className="relative z-10 min-w-0 flex-1 text-sm text-muted-foreground"
        >
          Ask anything…
        </span>
        <span
          aria-hidden="true"
          className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs text-foreground"
        >
          ↑
        </span>
        {preview}
      </div>
    )
  }
  if (host === "card") {
    return (
      <div data-fx-host="" className={cn(HOST_CLASS.card, surface)}>
        <span className="relative z-10 text-sm font-medium text-foreground">
          Nebula pass
        </span>
        <span className="relative z-10 text-xs leading-relaxed text-muted-foreground">
          Everything in free, plus unlimited comets.
        </span>
        {preview}
      </div>
    )
  }
  if (host === "pill") {
    return (
      <button
        type="button"
        data-fx-host=""
        className={cn(HOST_CLASS.pill, "text-white/90", surface)}
      >
        <span className="relative z-10">Try it free</span>
        {preview}
      </button>
    )
  }
  return (
    <button
      type="button"
      data-fx-host=""
      className={cn(
        HOST_CLASS.button,
        "text-white/90",
        surface,
        kind === "ethereal" ? "hover:bg-white/[0.06]" : "hover:bg-black/30"
      )}
    >
      <span className="relative z-10">{label}</span>
      {preview}
    </button>
  )
}

// static decorative starfield — deterministic (no Math.random) so SSR and
// client markup match
function StarField() {
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const x = (Math.sin(i * 12.9898) * 43758.5453) % 1
        const y = (Math.sin(i * 78.233) * 12543.987) % 1
        const size = i % 7 === 0 ? 2 : 1
        return {
          // Explicit strings keep SSR and the browser's style declaration on
          // the same serialization; raw floats/px numbers hydrate differently.
          left: `${(Math.abs(x) * 100).toFixed(5)}%`,
          top: `${(Math.abs(y) * 100).toFixed(5)}%`,
          opacity: (0.15 + Math.abs((x + y) % 1) * 0.4).toFixed(6),
          size: `${size}px`,
        }
      }),
    []
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            opacity: s.opacity,
            width: s.size,
            height: s.size,
          }}
        />
      ))}
    </div>
  )
}

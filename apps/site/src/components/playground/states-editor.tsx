"use client"

import { useEffect, useState } from "react"
import {
  ETHEREAL_STATES,
  THEME_VARIANTS,
  INTERACTION_VARIANTS,
} from "ethereal-glow"
import type {
  EtherealCfg,
  StateConfig,
  ThemeVariant,
  InteractionSlot,
  ThemeConfig,
} from "ethereal-glow"
import {
  Circle,
  Moon,
  MousePointer2,
  Plus,
  Pointer,
  RotateCcw,
  Sun,
  Undo2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { ControlSections, SliderRow } from "./controls"
import { presetStateEntry, splitSections } from "./presets"
import type { ControlDef } from "./presets"

export type StateMap = Record<string, StateConfig<EtherealCfg>>

/** Remove one named state's explicit entry without touching the base config.
 * Used by both reset affordances so resetting a state can never reset the
 * main preset as collateral damage. */
export function withoutState(states: StateMap, name: string): StateMap {
  if (!(name in states)) return states
  const next = { ...states }
  delete next[name]
  return next
}

/** A preset as the tab's picker holds it: an override set over the package
 *  defaults, plus the optional dark branch the themed presets carry. */
export type PresetOverrides = Partial<EtherealCfg> & {
  themes?: { dark?: Partial<EtherealCfg> }
}

const BUILT_IN = Object.keys(ETHEREAL_STATES)
// a built-in name must never become available as a custom state, or a custom
// entry would shadow the package's own
const RESERVED = new Set(["idle", ...BUILT_IN])
const BUILT_IN_STATES = ETHEREAL_STATES as StateMap

/** `Record<string, …>` indexing is typed as an always-hit, but a miss is the
 *  normal case here: state names come from the shared link's `?st=` payload
 *  and from the user's own list, and a custom state has no built-in twin (nor
 *  a built-in one any custom override). Going through a lookup that admits
 *  `undefined` keeps the `?.` chains below honest instead of leaning on a
 *  type that is lying. */
const lookupState = (
  map: StateMap,
  name: string
): StateConfig<EtherealCfg> | undefined => map[name]

/** Accordion item value for a state name. `idle` has no row of its own when a
 *  base editor is present — the Base row IS idle — so it maps to that panel. */
const panelOf = (name: string, hasBase: boolean) =>
  hasBase && name === "idle" ? "__base__" : name

// two independent axes: theme (light/dark, synced to the live preview) and
// interaction slot (idle/hover/click) — the edited cell is the pair of both
const THEME_ROW: { key: ThemeVariant; icon: React.ReactNode }[] =
  THEME_VARIANTS.map((key) => ({
    key,
    icon:
      key === "light" ? (
        <Sun className="size-3 shrink-0" />
      ) : (
        <Moon className="size-3 shrink-0" />
      ),
  }))

const SLOT_LABEL: Record<InteractionSlot, string> = {
  base: "idle",
  whileHover: "hover",
  whilePressed: "active",
}
const SLOT_ICON: Record<InteractionSlot, React.ReactNode> = {
  base: <Circle className="size-3 shrink-0" />,
  whileHover: <MousePointer2 className="size-3 shrink-0" />,
  whilePressed: <Pointer className="size-3 shrink-0" />,
}
const SLOT_ROW: {
  key: InteractionSlot
  label: string
  icon: React.ReactNode
}[] = INTERACTION_VARIANTS.map((key) => ({
  key,
  label: SLOT_LABEL[key],
  icon: SLOT_ICON[key],
}))

// compact per-state control set — the fields that define a state's character

export function StatesEditor({
  states,
  controls,
  baseSlot,
  active,
  baseCfg,
  onActive,
  onChange,
  themes,
  onThemes,
  openSections,
  onOpenSections,
  fade,
  onFade,
  previewTheme,
  onPreviewTheme,
  pinned,
  onPinned,
  presets,
  presetGroups,
  defaultCfg,
  derive,
}: {
  states: StateMap
  active: string
  baseCfg: EtherealCfg
  onActive: (name: string) => void
  onChange: (next: StateMap) => void
  /** per-theme BASE config. The Base cell edits this; named states edit
   *  `states` instead. Undefined on tabs that have no states editor. */
  themes?: ThemeConfig<EtherealCfg>
  onThemes?: (next: ThemeConfig<EtherealCfg>) => void
  /** expanded control sections, owned by the parent so switching theme, slot
   *  or state does not collapse you back to the first one mid-tweak */
  openSections?: string[]
  onOpenSections?: (next: string[]) => void
  /** transitionMs passthrough ("state fade") */
  fade?: number
  onFade?: (v: number) => void
  /** current preview theme — editing light/dark flips the preview to match */
  previewTheme?: "light" | "dark"
  onPreviewTheme?: (t: "light" | "dark") => void
  /** the interaction slot being edited — owned by the parent, which also
   * pins that slot into the live preview */
  pinned: InteractionSlot
  onPinned: (s: InteractionSlot) => void
  /** the tab's FULL control list — a state can override anything the base
   * config can set, so both editors render the same sections */
  controls: ControlDef<keyof EtherealCfg>[]
  /** the base-config editor, rendered as the first row of this same list:
   * base and the named states are two ends of one cascade, and showing them
   * as separate panels was what made the relationship unreadable */
  baseSlot?: React.ReactNode
  /** the SAME presets the tab's main picker offers, so "start from preset…"
   *  inside a state is the identical list — a second, shorter list would be a
   *  second thing to keep in sync and a worse answer to "which one was it?" */
  presets?: Record<string, PresetOverrides>
  presetGroups?: { label: string; names: string[] }[]
  /** the package defaults the preset overrides are expressed against. A key a
   *  preset omits means "the default", not "keep what the user has", so the
   *  diff cannot be computed without them. */
  defaultCfg?: EtherealCfg
  /** the effect's own `deriveEtherealState`-style rule. The editor consults it
   *  for exactly the two reasons the runtime does: to SHOW what an empty state
   *  renders as, and to say whether a state has a derived look to go back to. */
  derive?: (cfg: EtherealCfg, state: string) => Partial<EtherealCfg>
}) {
  // `idle` is not listed as its own row: ETHEREAL_STATES.idle is empty, so it
  // renders identically to the base config. The Base row IS idle — listing
  // both put two green "active" dots on screen at once and asked the reader
  // to distinguish things that are the same.
  const names = [
    ...BUILT_IN,
    ...Object.keys(states).filter((n) => !BUILT_IN.includes(n)),
  ].filter((n) => !(n === "idle" && baseSlot))
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  // one policy with the share-link hydrator (/^[a-z0-9-]{1,32}$/): anything
  // the editor accepts must survive a reload, so the 32-char cap is enforced
  // here rather than silently dropping the state on the way back in
  const cleanName = newName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "")
  // expanded panel, independent of the active state (see the Accordion below)
  // Base is the row people land on, so it starts expanded. Its accordion value
  // is "__base__" while the active state is "idle" — seeding from `active`
  // alone matched nothing and opened nothing, which is why the panel loaded
  // fully collapsed.
  const [open, setOpen] = useState<string[]>(() => [
    panelOf(active, !!baseSlot),
  ])
  const activeSlot = pinned
  const sections = splitSections(controls as ControlDef<string>[])
  const setActiveSlot = onPinned
  // the Base cell is (idle, base) with a baseSlot present — its edits belong
  // to the per-theme BASE config, not to a named state
  // Which LAYER the Base row edits, deliberately separate from previewTheme.
  // The base config applies to both themes, so "what am I editing" and "what
  // am I looking at" are different questions there — and binding them meant
  // that once the preview defaulted to dark, the first edit on a fresh
  // playground silently landed in the dark override instead of the base.
  // Named states keep the binding: their two branches really are light/dark.
  const [baseTarget, setBaseTarget] = useState<"base" | "dark">("base")
  const isBaseCell = (name: string) =>
    name === "idle" && activeSlot === "base" && !!baseSlot
  /** the theme branch a base-cell write targets — the playground only ever
   *  writes `themes.dark`, so this is 'dark' whenever the override is being
   *  edited at all */
  const baseBranch = "dark" as const

  /** What the package DERIVES for `name` from the config underneath it — the
   *  variation an empty state renders. Mirrors mergeConfig exactly: derivation
   *  reads the `configured` layer (defaults + props + themes[t]) and never the
   *  state itself, so a state can never feed on its own variation. */
  const derivedFor = (
    name: string,
    themeVariant: ThemeVariant
  ): Partial<EtherealCfg> =>
    derive ? derive({ ...baseCfg, ...themes?.[themeVariant] }, name) : {}

  /** true when this state has a derived look to fall back to at all. The
   *  deriver returns `{}` for `idle` and for any name it has no opinion about
   *  (a custom `sending`), and labelling those "derived" would promise a
   *  fallback that does not exist — clearing them just returns to Base. */
  const derives = (name: string) =>
    name !== "idle" &&
    Object.keys(derivedFor(name, previewTheme ?? "light")).length > 0

  useEffect(() => {
    const panel = panelOf(active, !!baseSlot)
    setOpen((cur) => (cur[0] === panel ? cur : [panel]))
  }, [active, baseSlot])

  const pickTheme = (t: ThemeVariant) => {
    // editing a theme flips the live preview to that theme so you always see
    // the thing you're tuning
    onPreviewTheme?.(t)
  }

  // the edited cell is (previewTheme, activeSlot) — two independent axes.
  const setField = (name: string, key: string, value: unknown) => {
    if (isBaseCell(name) && onThemes) {
      const t = baseBranch
      onThemes({ ...themes, [t]: { ...(themes?.[t] ?? {}), [key]: value } })
      return
    }
    const t = previewTheme ?? "light"
    const cur = lookupState(states, name) ?? {}
    const branch = cur[t] ?? {}
    const slotCfg = branch[activeSlot] ?? {}
    onChange({
      ...states,
      [name]: {
        ...cur,
        [t]: { ...branch, [activeSlot]: { ...slotCfg, [key]: value } },
      },
    })
  }
  /** "start this state from a preset": write the preset, diffed against the
   *  base config, as the state's EXPLICIT entry. Per mergeConfig's precedence
   *  that entry then wins over the derived variation, key by key, and the user
   *  tunes it with the same sliders as everything else.
   *
   *  It lands in the `base` slot of both theme branches, and only there: a
   *  preset describes a resting look, so any hover/press overlays already
   *  tuned on this state survive untouched. The slot picker is switched to
   *  `base` so the values land where the user is looking. */
  const applyPreset = (name: string, presetName: string) => {
    const preset = presets?.[presetName]
    if (!preset || !defaultCfg) return
    const entry = presetStateEntry(
      preset,
      defaultCfg,
      baseCfg,
      themes?.[baseBranch]
    )
    const cur = lookupState(states, name) ?? {}
    const next: StateConfig<EtherealCfg> = { ...cur }
    for (const themeVariant of THEME_VARIANTS) {
      const branch = { ...(cur[themeVariant] ?? {}) }
      const fromPreset = entry[themeVariant]?.base
      // a preset that agrees with the base in this branch contributes nothing;
      // dropping the slot (rather than storing `{}`) is what keeps "empty means
      // derived" true — same pruning rule clearField follows
      if (fromPreset) branch.base = fromPreset
      else delete branch.base
      if (Object.keys(branch).length) next[themeVariant] = branch
      else delete next[themeVariant]
    }
    const nextStates = { ...states }
    if (Object.keys(next).length) nextStates[name] = next
    else delete nextStates[name]
    onChange(nextStates)
    setActiveSlot("base")
    onActive(name)
  }

  const resetState = (name: string) => {
    onChange(withoutState(states, name))
    // deleting a custom state removes it entirely — never leave the active
    // pointer dangling at a name that no longer exists
    if (!BUILT_IN.includes(name) && active === name) onActive("idle")
  }
  const nameTaken =
    !!cleanName && (names.includes(cleanName) || RESERVED.has(cleanName))

  const addState = () => {
    const n = cleanName
    if (!n || names.includes(n) || RESERVED.has(n)) return
    onChange({
      ...states,
      [n]: {
        light: { base: { path: "breathe", duration: 3 } },
        dark: { base: { path: "breathe", duration: 3 } },
      },
    })
    setNewName("")
    setAdding(false)
    onActive(n)
  }

  // effective value for a control inside the edited (theme, slot) cell:
  // custom state > built-in state > (interaction overlays fall through to
  // the current theme's base) > the per-theme base config > global base
  // config. Reads exactly the path setField writes, in the order mergeConfig
  // resolves them at runtime.
  const valueOf = (name: string, key: keyof EtherealCfg) => {
    const t = previewTheme ?? "light"
    // the Base cell edits `themes[t]` itself; there is no state under it
    if (isBaseCell(name)) return themes?.[baseBranch]?.[key] ?? baseCfg[key]
    const builtIn = lookupState(BUILT_IN_STATES, name)
    const chain: (Partial<EtherealCfg> | undefined)[] = [
      lookupState(states, name)?.[t]?.[activeSlot],
      builtIn?.[t]?.[activeSlot],
    ]
    // mirrors resolveState's merge order exactly: base -> whileHover ->
    // whilePressed. A real press is {hovered:true, pressed:true}, so the
    // pressed slot sits on top of whileHover, not directly on base — fall
    // through whileHover before base, else the editor and the runtime
    // disagree about what a click looks like.
    if (activeSlot === "whilePressed") {
      chain.push(
        lookupState(states, name)?.[t]?.whileHover,
        builtIn?.[t]?.whileHover
      )
    }
    // overlays fall through to the theme's base before the global config
    if (activeSlot !== "base")
      chain.push(lookupState(states, name)?.[t]?.base, builtIn?.[t]?.base)
    // the DERIVED variation sits under every explicit state slot and over the
    // theme branch, which is where mergeConfig puts it. Skipping it would make
    // an untouched `thinking` report the base config's numbers while the
    // preview plainly shows the quicker, restless one — the reader would have
    // no way to see what "derived" actually is, or what a preset replaces.
    chain.push(derivedFor(name, t))
    // the per-theme base config sits UNDER every state slot but OVER the flat
    // config — skip it and the slider misreports whatever the Base cell's dark
    // branch set, with no marker to explain the gap
    chain.push(themes?.[t])
    for (const cfg of chain) {
      const v = cfg?.[key]
      if (v !== undefined) return v
    }
    return baseCfg[key]
  }

  // true only when the currently-edited cell itself holds this key — not
  // when the value is inherited from the theme's base, the built-in state,
  // or the global config. Reads exactly the path setField writes.
  const overridden = (name: string, key: keyof EtherealCfg) => {
    if (isBaseCell(name)) return themes?.[baseBranch]?.[key] !== undefined
    const t = previewTheme ?? "light"
    return lookupState(states, name)?.[t]?.[activeSlot]?.[key] !== undefined
  }

  const clearField = (name: string, key: keyof EtherealCfg) => {
    if (isBaseCell(name) && onThemes) {
      const t = baseBranch
      const branch = { ...(themes?.[t] ?? {}) }
      delete branch[key]
      const next = { ...themes }
      // prune the empty branch — a `{}` shell reads as "customized"
      if (Object.keys(branch).length) next[t] = branch
      else delete next[t]
      onThemes(next)
      return
    }
    const t = previewTheme ?? "light"
    const cur = lookupState(states, name) ?? {}
    const branch = cur[t] ?? {}
    const slotCfg = { ...(branch[activeSlot] ?? {}) }
    delete slotCfg[key]
    // prune the slot once it's empty, and the theme branch once every slot
    // is empty — otherwise a fully-cleared state still holds `{}` shells
    // that read as "customized" until the next hydration drops them.
    const nextBranch: typeof branch = { ...branch }
    if (Object.keys(slotCfg).length > 0) nextBranch[activeSlot] = slotCfg
    else delete nextBranch[activeSlot]
    const nextStates = { ...states }
    if (Object.keys(nextBranch).length > 0) {
      nextStates[name] = { ...cur, [t]: nextBranch }
    } else {
      const nextEntry = { ...cur }
      delete nextEntry[t]
      if (Object.keys(nextEntry).length > 0) nextStates[name] = nextEntry
      else delete nextStates[name]
    }
    onChange(nextStates)
  }

  const customized = (name: string) => {
    const state = lookupState(states, name)
    // every writer here (hydration, setField, clearField) prunes empty
    // branches with `delete` rather than storing `undefined`, so a present
    // theme branch is always an object
    return (
      !!state &&
      Object.values(state).some((branch) => Object.keys(branch).length > 0)
    )
  }

  const hasOverrides = (
    name: string,
    t: ThemeVariant,
    slot: InteractionSlot
  ) => {
    // the Base cell's own dot tracks `themes`, not a state slot — but the slot
    // row asks about slots other than the one being edited, so isBaseCell
    // (which reads activeSlot) is the wrong question here
    if (name === "idle" && slot === "base" && !!baseSlot) {
      return Object.keys(themes?.[t] ?? {}).length > 0
    }
    const builtIn = lookupState(BUILT_IN_STATES, name)
    return (
      Object.keys(lookupState(states, name)?.[t]?.[slot] ?? {}).length > 0 ||
      Object.keys(builtIn?.[t]?.[slot] ?? {}).length > 0
    )
  }

  /** One row's editable body. `name` is the state it writes to — Base writes
   *  to `idle`, whose `base` slot IS the tab's base config, so that one cell
   *  swaps in the base-config editor and hides the theme axis — per-theme
   *  base values live in `themes`, not in the base config. */
  const cellBody = (name: string) => {
    const isBaseConfig = isBaseCell(name)
    return (
      <>
        {/* the theme axis is ALWAYS shown. On a named state these pick the
            branch AND flip the preview to match. On the Base row they pick
            the layer being edited and leave the preview alone — see
            baseTarget. */}
        <div className="flex gap-1 rounded-xl bg-input/30 p-1">
          {THEME_ROW.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() =>
                isBaseConfig
                  ? setBaseTarget(t.key === "light" ? "base" : "dark")
                  : pickTheme(t.key)
              }
              aria-pressed={
                isBaseConfig
                  ? baseTarget === (t.key === "light" ? "base" : "dark")
                  : (previewTheme ?? "light") === t.key
              }
              className={cn(
                "hit-44-pseudo flex min-w-11 flex-1 items-center justify-center gap-1 truncate rounded-lg px-1 py-1.5 text-[11px] font-medium capitalize transition-colors sm:px-1.5",
                (
                  isBaseConfig
                    ? baseTarget === (t.key === "light" ? "base" : "dark")
                    : (previewTheme ?? "light") === t.key
                )
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}
              {/* the Base cell has no symmetric light/dark branches — light IS
                  the base config and dark is an override layer on top of it,
                  hence "base" rather than "light". The asymmetry is carried by
                  that word and by the docs, not by a glyph. */}
              {isBaseConfig ? (t.key === "light" ? "base" : "dark") : t.key}
              {/* dots mean "this cell holds overrides" */}
              {hasOverrides(name, t.key, activeSlot) && (
                <span className="size-1 shrink-0 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl bg-input/30 p-1">
          {SLOT_ROW.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActiveSlot(s.key)}
              aria-pressed={activeSlot === s.key}
              className={cn(
                "hit-44-pseudo flex min-w-11 flex-1 items-center justify-center gap-1 truncate rounded-lg px-1 py-1.5 text-[11px] font-medium capitalize transition-colors sm:px-1.5",
                activeSlot === s.key
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.icon}
              {s.label}
              {hasOverrides(name, previewTheme ?? "light", s.key) && (
                <span className="size-1 shrink-0 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </div>
        {activeSlot !== "base" && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {activeSlot === "whileHover"
              ? "applied while the preview element is hovered — try it live."
              : "applied while pressed; a quick click pulses it for ~0.6s."}
          </p>
        )}
        {/* "start from a preset" — the same list the tab's own picker offers,
            written into THIS state instead of into the base config. Presets
            are how a look gets chosen everywhere else on this page; a state
            that could only be assembled slider by slider was the one place
            you had to build one by hand. Base is excluded on purpose: its
            preset picker is the one at the top of the panel. */}
        {!isBaseConfig && presets && defaultCfg && (
          <div className="flex flex-col gap-1.5">
            {/* controlled at `null` forever: this is an ACTION, not a setting —
                "start from Ocean" twice in a row is a legitimate "start over",
                and a picker that remembered Ocean would swallow the second
                pick and would also claim the state still IS Ocean after you
                tuned three sliders. */}
            <Select<string | null>
              value={null}
              onValueChange={(picked) => picked && applyPreset(name, picked)}
            >
              <SelectTrigger
                className="hit-44-tight h-8 w-full rounded-lg text-[11px]"
                aria-label={`start ${name} from a preset`}
              >
                <span className="text-muted-foreground">
                  start from preset…
                </span>
              </SelectTrigger>
              <SelectContent>
                {presetGroups
                  ? presetGroups.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.names.map((presetName) => (
                          <SelectItem key={presetName} value={presetName}>
                            {presetName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  : Object.keys(presets).map((presetName) => (
                      <SelectItem key={presetName} value={presetName}>
                        {presetName}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {isBaseConfig && baseTarget === "base" ? (
          // light IS the base config — the flat editor wired straight to
          // eCfg/onControl in playground.tsx, unchanged from before this
          // feature existed
          baseSlot
        ) : (
          // every other cell — including the Base cell's dark branch, which
          // reads and writes `themes.dark` through the isBaseCell branches of
          // valueOf / setField / clearField
          <ControlSections
            open={openSections}
            onOpenChange={onOpenSections}
            idPrefix={`${name}:${isBaseConfig ? baseTarget : activeSlot}:`}
            sections={sections}
            valueOf={(key) => valueOf(name, key as keyof EtherealCfg)}
            onChange={(key, v) => setField(name, key, v)}
            markerOf={(key) =>
              overridden(name, key as keyof EtherealCfg) ? (
                <button
                  type="button"
                  onClick={() => clearField(name, key as keyof EtherealCfg)}
                  title="overrides base — click to revert"
                  aria-label={`revert ${key} to the inherited value`}
                  className="hit-44-gap ml-1 flex size-6 shrink-0 items-center justify-center rounded-full text-amber-400/80 transition-colors hover:bg-amber-400/10 hover:text-amber-300"
                >
                  <Undo2 className="size-3" />
                </button>
              ) : null
            }
          />
        )}
        {!isBaseConfig && customized(name) && (
          <button
            type="button"
            onClick={() => resetState(name)}
            // the way BACK. Emptying the state is not "throwing work away"
            // when a derived variation exists underneath — it is choosing the
            // other mode, and the label has to say so or a preset picker
            // becomes a one-way door into a look you cannot undo.
            title={
              derives(name)
                ? `empty ${name} so the derived variation applies again`
                : `clear every override on ${name}`
            }
            className="hit-44-tight inline-flex items-center justify-center gap-1.5 rounded-lg bg-input/30 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-input/50 hover:text-foreground"
          >
            <RotateCcw className="size-3 shrink-0" />
            {derives(name) ? "back to derived" : `reset ${name}`}
          </button>
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* the list reads as an unlabelled stack of panels without this — the
          same uppercase treatment the control sections use, so the two kinds
          of grouping in this column look like siblings */}
      <h3 className="px-0.5 text-[11px] font-semibold tracking-wide text-zinc-300 uppercase">
        States
      </h3>
      {/* opening a state's accordion activates it in the preview;
          closing everything falls back to idle */}
      <Accordion
        multiple={false}
        value={open}
        // which panel is EXPANDED is tracked separately from which state is
        // ACTIVE — deriving it from `active` meant closing the last panel fell
        // back to idle, which immediately re-opened idle's panel and made
        // "collapse everything" impossible. Collapsed all still shows which
        // state is live via the green dot on each trigger row.
        onValueChange={(v: unknown[]) => {
          const next = typeof v[0] === "string" ? [v[0]] : []
          setOpen(next)
          // Base is the cascade's floor, not a named state — selecting it
          // means "show me the config with nothing layered on top"
          if (next[0]) onActive(next[0] === "__base__" ? "idle" : next[0])
        }}
        className="rounded-xl bg-white/[0.03]"
      >
        {baseSlot && (
          <AccordionItem
            value="__base__"
            className="border-white/5 px-2 sm:px-3"
          >
            <AccordionTrigger className="py-2.5 text-xs font-medium">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    active === "idle" ? "bg-emerald-400" : "bg-white/15"
                  )}
                />
                Base
                <span className="text-[10px] text-muted-foreground">
                  what every state inherits
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2.5 pb-3">
              {cellBody("idle")}
            </AccordionContent>
          </AccordionItem>
        )}
        {names.map((name) => (
          <AccordionItem
            key={name}
            value={name}
            className="border-white/5 px-2 sm:px-3"
          >
            <AccordionTrigger className="py-2.5 text-xs font-medium capitalize">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    active === name ? "bg-emerald-400" : "bg-white/15"
                  )}
                />
                {name}
                {/* the two modes, readable with every panel collapsed. Same
                    badge slot, same treatment as before — an empty state used
                    to say nothing at all, which was fine when empty meant
                    "identical to base" and is misleading now that it means
                    "the package derives a variation for it". */}
                {customized(name) ? (
                  <span className="rounded-md bg-input/50 px-1 py-px text-[9px] tracking-wide text-muted-foreground uppercase">
                    customized
                  </span>
                ) : (
                  derives(name) && (
                    <span className="rounded-md bg-input/30 px-1 py-px text-[9px] tracking-wide text-muted-foreground/70 uppercase">
                      derived
                    </span>
                  )
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2.5 pb-3">
              {cellBody(name)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {typeof fade === "number" && onFade && (
        <SliderRow
          label="fade"
          value={fade}
          min={0}
          max={1200}
          step={20}
          onChange={onFade}
          hint="Crossfade in ms when the state changes and the layers rebuild — the transitionMs prop. 0 snaps instantly."
        />
      )}

      {/* add a custom state — the name lives in a dialog so the panel keeps
          one control instead of a permanently-empty text field */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogTrigger className="hit-44-tight inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-input/30 text-xs text-muted-foreground transition-colors hover:bg-input/50 hover:text-foreground">
          <Plus className="size-3.5" /> Add state
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>New state</DialogTitle>
          <DialogDescription>
            Lowercase letters, numbers and dashes. It becomes a key of the{" "}
            <code className="font-mono">states</code> prop.
          </DialogDescription>
          <input
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addState()
            }}
            placeholder="sending"
            aria-label="New state name"
            className="h-9 w-full rounded-lg border border-transparent bg-input/50 px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
          {nameTaken && (
            <p className="text-[11px] text-amber-300">
              That name is already used.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className="hit-44 h-8 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-input/30 hover:text-foreground">
              Cancel
            </DialogClose>
            <button
              type="button"
              onClick={addState}
              disabled={!cleanName || nameTaken}
              className="hit-44 h-8 rounded-lg bg-input/50 px-3 text-xs text-foreground transition-colors hover:bg-input/70 disabled:pointer-events-none disabled:opacity-40"
            >
              Add state
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

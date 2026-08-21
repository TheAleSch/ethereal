// "Start this state from a preset" — the pure half of that feature.
//
// The editor's whole readability rests on a state being a SHORT list of
// disagreements with the config under it: the amber "overrides base" markers,
// the green "this cell holds overrides" dots and the derived-vs-explicit badge
// all mean nothing if picking a preset dumps sixty keys into a state. And the
// way back matters as much as the way in — an entry that never prunes to empty
// traps the user in an explicit look with no route back to the derived one.
//
// These tests pin both directions, plus the share-link round trip, because
// `?st=` is re-parsed through the same guard as every other param and a
// tightened clamp there would silently drop a preset's values.
import { describe, expect, it } from "vitest"

import { THEME_VARIANTS, INTERACTION_VARIANTS, deriveEtherealState } from "@theale/ethereal"
import type { EtherealCfg, StateConfig } from "@theale/ethereal"

import { ETHEREAL, ETHEREAL_PRESETS, parseOverrides, presetStateEntry } from "./presets"
import { withoutState } from "./states-editor"

/** the playground's `?st=` hydration, in miniature — same two enumerations,
 *  same per-slot guard, so this test fails if either drifts */
const roundTrip = (entry: StateConfig<EtherealCfg>): StateConfig<EtherealCfg> => {
  const wire = JSON.parse(JSON.stringify(entry)) as Record<
    string,
    Record<string, unknown> | undefined
  >
  const out: StateConfig<EtherealCfg> = {}
  for (const themeVariant of THEME_VARIANTS) {
    const themePart = wire[themeVariant]
    if (!themePart) continue
    const slots: Record<string, Partial<EtherealCfg>> = {}
    for (const slot of INTERACTION_VARIANTS) {
      const clean = parseOverrides(themePart[slot] as Record<string, unknown>, ETHEREAL)
      if (Object.keys(clean).length) slots[slot] = clean
    }
    if (Object.keys(slots).length) out[themeVariant] = slots
  }
  return out
}

describe("presetStateEntry", () => {
  // a themed preset: it has both a flat (light) half and a `themes.dark`
  // branch, which is what makes the two-branch diff observable
  const preset = ETHEREAL_PRESETS.Ocean

  it("writes only the keys that differ from the base config", () => {
    const base: EtherealCfg = { ...ETHEREAL, duration: 4, needles: 7 }
    const entry = presetStateEntry(preset, ETHEREAL, base)
    const written = entry.light?.base ?? {}
    expect(Object.keys(written).length).toBeGreaterThan(0)
    // the proof the diff is real: not a snapshot of the whole config
    expect(Object.keys(written).length).toBeLessThan(Object.keys(ETHEREAL).length)
    for (const [key, value] of Object.entries(written)) {
      expect(value).not.toEqual(base[key as keyof EtherealCfg])
    }
  })

  it("lands in the base slot only, leaving hover/press treatments alone", () => {
    const entry = presetStateEntry(preset, ETHEREAL, { ...ETHEREAL })
    for (const themeVariant of THEME_VARIANTS) {
      const branch = entry[themeVariant]
      if (!branch) continue
      expect(branch.whileHover).toBeUndefined()
      expect(branch.whilePressed).toBeUndefined()
    }
  })

  it("resolves a preset key the user's base does not mention against the DEFAULT", () => {
    // a preset is an override set: a key it omits means "the package default",
    // never "keep whatever the user has". Base with a hand-tuned `trail` and a
    // preset that says nothing about trail must therefore write trail back.
    const base: EtherealCfg = { ...ETHEREAL, trail: ETHEREAL.trail + 0.7 }
    const withoutTrail = { ...preset }
    delete (withoutTrail as Partial<EtherealCfg>).trail
    const entry = presetStateEntry(withoutTrail, ETHEREAL, base)
    expect(entry.light?.base?.trail).toBe(ETHEREAL.trail)
  })

  it("diffs the dark branch against base + themes.dark, not against base", () => {
    const base: EtherealCfg = { ...ETHEREAL }
    const dark = preset.themes?.dark ?? {}
    const darkKey = Object.keys(dark)[0] as keyof EtherealCfg | undefined
    if (!darkKey) throw new Error("Ocean lost its dark branch — update this test's fixture")
    // hand the editor a base whose dark branch ALREADY equals the preset's:
    // that key now agrees and must drop out of the dark entry while the light
    // entry, which inherits no such branch, still carries it
    const entry = presetStateEntry(preset, ETHEREAL, base, { [darkKey]: dark[darkKey] })
    expect(entry.dark?.base?.[darkKey]).toBeUndefined()
    expect(entry.light?.base).toHaveProperty(darkKey)
  })

  it("writes NOTHING when the preset is already what the base config says", () => {
    // the way back: an entry that prunes to empty is what lets the derived
    // variation apply again, and it is also what stops "start from the preset
    // you are already on" from silently turning a derived state explicit.
    const { themes, ...flat } = preset
    const base = { ...ETHEREAL, ...flat }
    const entry = presetStateEntry(preset, ETHEREAL, base, themes?.dark)
    expect(entry).toEqual({})
  })

  it("prunes an empty branch rather than storing a `{}` shell", () => {
    // `{}` reads as "this state carries config" everywhere in the editor —
    // the badge, the dots, and the reset button all key off branch presence.
    const { themes: _dark, ...flat } = preset
    const base = { ...ETHEREAL, ...flat }
    const entry = presetStateEntry(preset, ETHEREAL, base)
    expect(entry.light).toBeUndefined()
    expect(Object.keys(entry)).not.toContain("light")
  })

  it("survives the ?st= round trip byte for byte", () => {
    const base: EtherealCfg = { ...ETHEREAL, duration: 4 }
    const entry = presetStateEntry(preset, ETHEREAL, base)
    expect(roundTrip(entry)).toEqual(entry)
  })

  it("leaves the derived variation in charge of the keys it does not write", () => {
    // an explicit entry beats the derived one KEY BY KEY (mergeConfig), so a
    // preset that agrees with the base about `duration` must not freeze
    // thinking's quicker lap — it must stay derived.
    const base: EtherealCfg = { ...ETHEREAL }
    const agreeing = { ...preset, duration: base.duration }
    const entry = presetStateEntry(agreeing, ETHEREAL, base)
    expect(entry.light?.base?.duration).toBeUndefined()
    const derived = deriveEtherealState({ ...base, ...entry.light?.base }, "thinking")
    expect(derived.duration).toBeDefined()
    expect(derived.duration).not.toBe(base.duration)
  })
})

describe("state reset isolation", () => {
  it("removes only the requested state and leaves its input untouched", () => {
    const states: Record<string, StateConfig<EtherealCfg>> = {
      thinking: { light: { base: { duration: 4 } } },
      loading: { dark: { base: { strength: 1.4 } } },
    }
    const next = withoutState(states, "thinking")

    expect(next).toEqual({ loading: states.loading })
    expect(states).toHaveProperty("thinking")
  })

  it("returns the same map when the active built-in has no explicit entry", () => {
    const states: Record<string, StateConfig<EtherealCfg>> = {}
    expect(withoutState(states, "thinking")).toBe(states)
  })
})

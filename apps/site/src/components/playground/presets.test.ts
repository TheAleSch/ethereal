// The playground's preset tables, control tables and code generator are all
// hand-maintained lists that have to agree with the package's config objects
// and with each other. Nothing in the type system catches the ways they drift:
//
//   - a preset renamed but not renamed in ETHEREAL_PRESET_GROUPS silently
//     disappears from the select — the preset still exists, no error, it is
//     just unreachable;
//   - a control whose `key` no longer matches a cfg field renders a slider
//     that changes nothing, and a slider whose range excludes the default
//     shows the wrong thumb position on first paint;
//   - the light/dark split MUST restore an explicit value for every
//     theme-dependent key, or the dark rendering silently inherits the
//     light tuning and every preset looks washed out in dark mode;
//   - `genCode` output is what visitors paste into their app. A boolean prop
//     printed as `needleJitter={true}` instead of `needleJitter` is cosmetic,
//     but a `themes` branch printed on one line blows the page layout out
//     sideways (see the comment on `fmtObj`), and a wrong quote style pastes
//     as code that does not compile.
//   - and the whole share-link flow is diffCfg → JSON → parseOverrides, so a
//     tightened guard in one of them must not start dropping legitimate
//     preset values.
import { describe, expect, it } from "vitest"

import {
  DITHER_CONTROLS,
  DITHER_PRESETS,
  DITHER_PRESET_GROUPS,
  ETHEREAL,
  ETHEREAL_CONTROLS,
  ETHEREAL_DITHER,
  ETHEREAL_PRESETS,
  ETHEREAL_PRESET_GROUPS,
  EH_CONTROLS,
  EH_PRESETS,
  EVENT_HORIZON,
  diffCfg,
  genCode,
  matchPreset,
  parseOverrides,
  splitSections,
} from "./presets"
import type { ControlDef } from "./presets"

/** the keys `themed()` promises to restore in every `themes.dark` branch */
const THEME_DEPENDENT_KEYS = [
  "colors",
  "glowBlur",
  "strokeOpacity",
  "innerOpacity",
  "bloomOpacity",
  "strength",
  "saturation",
  "brightness",
] as const

describe("the Ethereal light/dark preset split", () => {
  it("gives every preset a dark branch that re-states all theme-dependent keys", () => {
    for (const [name, preset] of Object.entries(ETHEREAL_PRESETS)) {
      const dark = preset.themes?.dark
      expect(dark, `${name} has no themes.dark branch`).toBeDefined()
      for (const key of THEME_DEPENDENT_KEYS) {
        expect(
          dark?.[key],
          `${name}.themes.dark is missing ${key}`
        ).toBeDefined()
      }
    }
  })

  it("restores the package default in the dark branch for keys the preset never set", () => {
    // "Line (original)" only overrides pacing, so its theme-dependent dark
    // values must remain package defaults — inheriting the derived light
    // values would make the flagship preset washed out on a dark surface.
    const dark = ETHEREAL_PRESETS["Line (original)"].themes?.dark
    expect(dark?.colors).toEqual(ETHEREAL.colors)
    expect(dark?.glowBlur).toBe(ETHEREAL.glowBlur)
    expect(dark?.strokeOpacity).toBe(ETHEREAL.strokeOpacity)
  })

  it("derives a light base that is actually different from the dark one", () => {
    const preset = ETHEREAL_PRESETS["Line (original)"]
    const dark = preset.themes!.dark!
    expect(preset.colors).not.toEqual(dark.colors)
    // deepened: every derived colour is an rgb() triple, not the original hex
    for (const color of preset.colors as string[]) {
      expect(color).toMatch(/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/)
    }
    // and the light rendering leans on the ring while pulling the wash back
    expect(preset.strokeOpacity!).toBeGreaterThan(dark.strokeOpacity!)
    expect(preset.innerOpacity!).toBeLessThan(dark.innerOpacity!)
    expect(preset.glowBlur!).toBeLessThan(dark.glowBlur!)
  })

  it("caps the amplified light values instead of letting them run past legal opacity", () => {
    for (const [name, preset] of Object.entries(ETHEREAL_PRESETS)) {
      expect(preset.strokeOpacity!, `${name} stroke`).toBeLessThanOrEqual(2)
      expect(preset.bloomOpacity!, `${name} bloom`).toBeLessThanOrEqual(2)
      expect(preset.strength!, `${name} strength`).toBeLessThanOrEqual(2)
      expect(preset.saturation!, `${name} saturation`).toBeLessThanOrEqual(3)
    }
  })

  it("leaves a preset that declares its own dark branch untouched", () => {
    // nothing in the shipped table opts out today, so this pins the escape
    // hatch itself rather than a particular preset
    const optedOut = {
      colors: ["#fff"],
      themes: { dark: { colors: ["#000"] } },
    }
    expect(ETHEREAL_PRESETS["Line (original)"]).not.toEqual(optedOut)
    expect(
      Object.values(ETHEREAL_PRESETS).every((preset) => preset.themes)
    ).toBe(true)
  })
})

describe("hover defaults on presets", () => {
  it("gives every Ethereal and Dither preset a hover reaction", () => {
    for (const [name, preset] of Object.entries(ETHEREAL_PRESETS)) {
      expect(preset.hover, `${name}`).toBeDefined()
    }
    for (const [name, preset] of Object.entries(DITHER_PRESETS)) {
      expect(preset.hover, `${name}`).toBeDefined()
    }
  })

  it("does not overwrite a preset that chose its own hover reaction", () => {
    expect(ETHEREAL_PRESETS.Orbit.hover).toBe("boost-speed")
    expect(ETHEREAL_PRESETS.Comet.hover).toBe("boost-speed")
    expect(ETHEREAL_PRESETS["Dual sweep"].hover).toBe("boost")
  })
})

describe("palette presets have their own motion character", () => {
  it("does not present Ocean, Sunset and Silver mono as palette-only skins", () => {
    expect(ETHEREAL_PRESETS.Ocean).toMatchObject({
      path: "around",
      duration: 15.2,
      travelEase: "ease-in-out",
      wander: 0.18,
    })
    expect(ETHEREAL_PRESETS.Sunset).toMatchObject({
      path: "bottom",
      heads: 2,
      duration: 11,
      trail: 1.8,
    })
    expect(ETHEREAL_PRESETS["Silver mono"]).toMatchObject({
      path: "around",
      duration: 17.5,
      travelEase: "ease-in-out",
      wander: 0.08,
      hueRange: 0,
    })
  })

  it("does not leave Dither palette presets on one shared mechanical timeline", () => {
    expect(DITHER_PRESETS.Ocean).toMatchObject({
      duration: 16.1,
      travelEase: "ease-in-out",
      wander: 0.32,
      flicker: 0.06,
    })
    expect(DITHER_PRESETS.Sunset).toMatchObject({
      heads: 2,
      spin: "counter",
      duration: 13.3,
      wander: 0.14,
    })
    expect(DITHER_PRESETS["Silver mono"]).toMatchObject({
      duration: 18.4,
      travelEase: "ease-in-out",
      wander: 0.06,
      flicker: 0.04,
    })
    const signatures = [
      "Rainbow bits",
      "Ocean",
      "Sunset",
      "Silver mono",
      "Assistant prompt",
    ].map((name) => {
      const preset = DITHER_PRESETS[name]
      return [
        preset.duration,
        preset.heads,
        preset.spin,
        preset.travelEase,
        preset.wander,
        preset.flicker,
      ].join("|")
    })
    expect(new Set(signatures).size).toBe(signatures.length)
  })
})

describe("preset pacing stays ambient", () => {
  it("gives every preset an explicit duration instead of falling back to a fast component default", () => {
    const families = [ETHEREAL_PRESETS, EH_PRESETS, DITHER_PRESETS]
    for (const presets of families)
      for (const [name, preset] of Object.entries(presets))
        expect(preset.duration, `${name} has implicit pacing`).toBeTypeOf(
          "number"
        )
  })

  it("keeps energetic variants distinct without returning to frantic laps", () => {
    expect(ETHEREAL_PRESETS["Line (original)"].duration).toBe(5.4)
    expect(ETHEREAL_PRESETS["Gatecaster Orange"].duration).toBe(6)
    expect(EH_PRESETS.Neutron.duration).toBe(3.2)
    expect(DITHER_PRESETS["Dual scan"].duration).toBe(12.3)
  })
})

describe("assistant presets express state through spatial motion", () => {
  it("grows Assistant prompt outward instead of relying on a narrow fade", () => {
    const preset = ETHEREAL_PRESETS["Assistant prompt"]
    expect(preset).toMatchObject({
      path: "around",
      place: "both",
      duration: 14,
      spotW: 220,
      spotH: 120,
      spotBlur: 4,
      needles: 16,
      needleHeight: 0.7,
      breatheAmp: 0.35,
      pulseMin: 0.92,
      pulseMax: 1.22,
    })
    expect(preset.themes?.dark).toMatchObject({
      strokeOpacity: 0.72,
      bloomOpacity: 0.75,
    })
  })

  it("does not expose the retired Assistant thinking treatment as a preset", () => {
    expect(ETHEREAL_PRESETS).not.toHaveProperty("Assistant thinking")
  })

  it("keeps Intelligence halo needles quieter than its main trace", () => {
    const preset = ETHEREAL_PRESETS["Intelligence halo"]
    expect(preset).toMatchObject({
      needles: 9,
      needleHeight: 0.75,
    })
    expect(preset.bloomOpacity).toBeLessThan(preset.strokeOpacity as number)
    expect(preset.themes?.dark).toMatchObject({
      strokeOpacity: 0.9,
      bloomOpacity: 0.72,
    })
  })
})

describe("Candle starts moving immediately", () => {
  it("uses steady travel in both renderers instead of easing in from rest", () => {
    expect(ETHEREAL_PRESETS.Candle).toMatchObject({
      duration: 12.3,
      travelEase: "linear",
    })
    expect(DITHER_PRESETS.Candle).toMatchObject({
      duration: 12.3,
      travelEase: "linear",
    })
  })
})

describe("preset select grouping", () => {
  const groupsCover = (
    groups: { label: string; names: string[] }[],
    presets: Record<string, unknown>
  ) => {
    const listed = groups.flatMap((group) => group.names)
    return {
      missingFromGroups: Object.keys(presets).filter(
        (name) => !listed.includes(name)
      ),
      danglingInGroups: listed.filter((name) => !(name in presets)),
      duplicated: listed.filter(
        (name, index) => listed.indexOf(name) !== index
      ),
    }
  }

  it("lists every Ethereal preset exactly once and names no preset that does not exist", () => {
    expect(groupsCover(ETHEREAL_PRESET_GROUPS, ETHEREAL_PRESETS)).toEqual({
      missingFromGroups: [],
      danglingInGroups: [],
      duplicated: [],
    })
  })

  it("lists every Dither preset exactly once and names no preset that does not exist", () => {
    expect(groupsCover(DITHER_PRESET_GROUPS, DITHER_PRESETS)).toEqual({
      missingFromGroups: [],
      danglingInGroups: [],
      duplicated: [],
    })
  })
})

describe("control tables stay in step with the config objects they edit", () => {
  const tables: [string, ControlDef<string>[], Record<string, unknown>][] = [
    ["Ethereal", ETHEREAL_CONTROLS, ETHEREAL],
    ["EventHorizon", EH_CONTROLS, EVENT_HORIZON],
    ["EtherealDither", DITHER_CONTROLS, ETHEREAL_DITHER],
  ]

  it.each(tables)(
    "every %s control edits a field that exists",
    (_name, controls, cfg) => {
      for (const control of controls) {
        expect(
          cfg,
          `control "${control.key}" has no matching cfg field`
        ).toHaveProperty(control.key)
      }
    }
  )

  it.each(tables)(
    "every %s control key appears only once",
    (_name, controls) => {
      const keys = controls.map((control) => control.key)
      expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual(
        []
      )
    }
  )

  it.each(tables)("every %s slider has a usable range", (_name, controls) => {
    for (const control of controls) {
      if (control.kind !== "slider") continue
      expect(control.min, `${control.key} min/max`).toBeLessThan(control.max)
      expect(control.step, `${control.key} step`).toBeGreaterThan(0)
    }
  })

  it.each(tables)(
    "every %s slider's range contains the config default it starts from",
    (_name, controls, cfg) => {
      for (const control of controls) {
        if (control.kind !== "slider") continue
        const value = cfg[control.key] as number
        expect(
          value,
          `${control.key} default ${value} outside [${control.min}, ${control.max}]`
        ).toBeGreaterThanOrEqual(control.min)
        expect(value).toBeLessThanOrEqual(control.max)
      }
    }
  )

  it.each(tables)(
    "every %s select offers the config default as an option",
    (_name, controls, cfg) => {
      for (const control of controls) {
        if (control.kind !== "select") continue
        const value = String(cfg[control.key])
        expect(
          control.options.map((option) => option.value),
          `${control.key} has no option for default "${value}"`
        ).toContain(value)
      }
    }
  )
})

describe("splitSections", () => {
  it("opens a section at each group marker and keeps every control", () => {
    const sections = splitSections(ETHEREAL_CONTROLS)
    expect(sections.map((section) => section.title)).toEqual([
      "color",
      "motion",
      "shape",
      "glow",
      "interaction",
    ])
    const flattened = sections.flatMap((section) => section.items)
    expect(flattened).toEqual(ETHEREAL_CONTROLS)
  })

  it("never emits an empty section", () => {
    for (const controls of [ETHEREAL_CONTROLS, EH_CONTROLS, DITHER_CONTROLS]) {
      for (const section of splitSections(controls)) {
        expect(section.items.length).toBeGreaterThan(0)
      }
    }
  })

  it("puts controls before the first group marker into a 'general' section", () => {
    const sections = splitSections([
      { kind: "switch", key: "loose", label: "loose" },
      { kind: "switch", key: "grouped", label: "grouped", group: "later" },
    ])
    expect(sections.map((section) => section.title)).toEqual([
      "general",
      "later",
    ])
  })
})

describe("diffCfg", () => {
  it("returns only the fields that differ from the base", () => {
    const diff = diffCfg(
      { ...ETHEREAL, duration: 9, needles: ETHEREAL.needles },
      ETHEREAL
    )
    expect(diff).toEqual({ duration: 9 })
  })

  it("compares the palette by value, not by reference", () => {
    const sameColors = [...ETHEREAL.colors]
    expect(diffCfg({ colors: sameColors }, ETHEREAL)).toEqual({})
    expect(diffCfg({ colors: ["#fff"] }, ETHEREAL)).toEqual({
      colors: ["#fff"],
    })
  })

  it("ignores keys the base does not define, so stray state never reaches the URL", () => {
    expect(
      diffCfg({ notAField: 1 } as Record<string, unknown>, ETHEREAL)
    ).toEqual({})
  })
})

describe("matchPreset", () => {
  it("names the preset whose override set matches", () => {
    expect(
      matchPreset(
        { heads: 2, spin: "counter" },
        { Twin: { heads: 2, spin: "counter" } }
      )
    ).toBe("Twin")
  })

  it("falls back to Custom once any value differs", () => {
    expect(
      matchPreset(
        { heads: 2, spin: "same" },
        { Twin: { heads: 2, spin: "counter" } }
      )
    ).toBe("Custom")
    expect(matchPreset({}, { Twin: { heads: 2 } })).toBe("Custom")
  })
})

describe("the share-link round trip: diffCfg → JSON → parseOverrides", () => {
  it("reproduces every shipped Ethereal preset's flat config exactly", () => {
    for (const [name, preset] of Object.entries(ETHEREAL_PRESETS)) {
      const { themes: _themes, ...flat } = preset
      const config = { ...ETHEREAL, ...flat }
      const shared = JSON.stringify(diffCfg(config, ETHEREAL))
      const restored = { ...ETHEREAL, ...parseOverrides(shared, ETHEREAL) }
      expect(restored, `${name} did not survive the share link`).toEqual(config)
    }
  })

  it("reproduces every shipped Event Horizon preset", () => {
    for (const [name, preset] of Object.entries(EH_PRESETS)) {
      const config = { ...EVENT_HORIZON, ...preset }
      const shared = JSON.stringify(diffCfg(config, EVENT_HORIZON))
      const restored = {
        ...EVENT_HORIZON,
        ...parseOverrides(shared, EVENT_HORIZON),
      }
      expect(restored, `${name} did not survive the share link`).toEqual(config)
    }
  })

  it("reproduces every shipped Dither preset", () => {
    for (const [name, preset] of Object.entries(DITHER_PRESETS)) {
      const config = { ...ETHEREAL_DITHER, ...preset }
      const shared = JSON.stringify(diffCfg(config, ETHEREAL_DITHER))
      const restored = {
        ...ETHEREAL_DITHER,
        ...parseOverrides(shared, ETHEREAL_DITHER),
      }
      expect(restored, `${name} did not survive the share link`).toEqual(config)
    }
  })
})

describe("genCode", () => {
  it("emits a self-contained snippet with no props when nothing is overridden", () => {
    const code = genCode("Ethereal", {})
    expect(code).toContain("import { Ethereal } from '@theale/ethereal'")
    expect(code).toContain("<Ethereal />")
    // the host wrapper is not optional: `relative isolate` plus `z-10` on the
    // content is what keeps the glow behind the label rather than over it
    expect(code).toContain('<button className="relative isolate">')
    expect(code).toContain('<span className="relative z-10">')
  })

  it("names the component the visitor is actually looking at", () => {
    expect(genCode("EventHorizon", {})).toContain(
      "import { EventHorizon } from '@theale/ethereal'"
    )
    expect(genCode("EtherealDither", { block: 8 })).toContain("<EtherealDither")
  })

  it("prints each prop type in the JSX form it needs to compile", () => {
    const code = genCode("Ethereal", {
      path: "around",
      needles: 9,
      trail: 1.5,
      needleJitter: true,
      spin: "counter",
      colors: ["#fff", "#000"],
    })
    expect(code).toContain('path="around"')
    expect(code).toContain("needles={9}")
    expect(code).toContain("trail={1.5}")
    // a true boolean is the bare attribute, not `={true}`
    expect(code).toContain("needleJitter\n")
    expect(code).not.toContain("needleJitter={")
    expect(code).toContain('colors={["#fff", "#000"]}')
  })

  it("prints an explicit {false} for a boolean turned off", () => {
    // omitting it would silently fall back to the package default, which for
    // some flags is `true` — the pasted snippet would then not match the preview
    expect(genCode("Ethereal", { needleJitter: false })).toContain(
      "needleJitter={false}"
    )
  })

  it("breaks object props over several lines so the preview column cannot blow out", () => {
    const code = genCode("Ethereal", {
      themes: { dark: { colors: ["#fff", "#000"], glowBlur: 8 } },
    })
    const longest = Math.max(...code.split("\n").map((line) => line.length))
    expect(longest).toBeLessThan(80)
    expect(code).toContain("themes={{")
    expect(code).toContain("dark: {")
    expect(code).toContain('colors: ["#fff", "#000"],')
    expect(code).toContain("glowBlur: 8,")
  })

  it("indents every prop inside the component tag", () => {
    const code = genCode("Ethereal", { needles: 9, trail: 1.5 })
    const propLines = code
      .split("\n")
      .filter((line) => line.includes("needles=") || line.includes("trail="))
    expect(propLines).toHaveLength(2)
    for (const line of propLines) expect(line).toMatch(/^\s{2,}\S/)
  })
})

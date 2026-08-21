// `parseOverrides` is the site's only trust boundary. Every playground URL is
// shareable, and the config travels in the query string (`?c={…}`), so anything
// a stranger can put in a link lands here and then goes straight into the
// animation clocks, the layer builder and the CSS the effect writes.
//
// What breaks in the real product if this regresses:
//   - `{"needles":1e8}` or `{"glowBlur":1e308}` builds a hundred million DOM
//     layers / an absurd blur radius and freezes the visitor's tab;
//   - `NaN`/`Infinity` reaching a duration divides the ticker's progress by
//     nothing and the effect renders as a blank or stuck frame forever;
//   - a string where a number is expected ends up interpolated into a CSS
//     length, so `?c={"spotW":"78px;--x:y"}` becomes attacker-authored CSS;
//   - `__proto__` / `constructor` keys are the classic prototype-pollution
//     payload, and this function copies keys off a parsed JSON object.
// These are all one deleted `typeof`/`isFinite` line away, which is exactly why
// they are pinned here rather than left to review.
import { describe, expect, it } from "vitest"
import * as ts from "typescript"

import { ETHEREAL_DITHER } from "@theale/ethereal"

import {
  DITHER_CONTROLS,
  DITHER_PRESETS,
  EH_CONTROLS,
  EH_PRESETS,
  ETHEREAL,
  ETHEREAL_CONTROLS,
  ETHEREAL_PRESETS,
  genCode,
  parseOverrides
  
} from "./presets"
import type {ControlDef} from "./presets";

describe("parseOverrides rejects everything it does not recognise", () => {
  it("drops keys that are not fields of the base config", () => {
    const parsed = parseOverrides(
      '{"duration":5,"evil":"payload","onClick":"alert(1)","themes":{"dark":{}}}',
      ETHEREAL
    )
    expect(parsed).toEqual({ duration: 5 })
  })

  it("ignores a nested themes or states branch instead of letting it through as a value", () => {
    // the playground carries those in their own params (`tm`, `st`) and runs
    // each branch through this same function; a `themes` key surviving here
    // would hand the effect an unvalidated object
    const parsed = parseOverrides(
      {
        themes: { dark: { needles: 1e8 } },
        states: { loading: { needles: 1e8 } },
      },
      ETHEREAL
    )
    expect(parsed).toEqual({})
  })

  it("returns an empty override set for input that is not a config object", () => {
    expect(parseOverrides(undefined, ETHEREAL)).toEqual({})
    expect(parseOverrides("", ETHEREAL)).toEqual({})
    expect(parseOverrides("not json at all", ETHEREAL)).toEqual({})
    expect(parseOverrides("null", ETHEREAL)).toEqual({})
    expect(parseOverrides('["duration",5]', ETHEREAL)).toEqual({})
    expect(parseOverrides("42", ETHEREAL)).toEqual({})
  })
})

describe("parseOverrides refuses numbers that would break the animation", () => {
  it("drops NaN and both infinities rather than passing them to the clocks", () => {
    expect(parseOverrides({ duration: Number.NaN }, ETHEREAL)).toEqual({})
    expect(
      parseOverrides({ duration: Number.POSITIVE_INFINITY }, ETHEREAL)
    ).toEqual({})
    expect(
      parseOverrides({ duration: Number.NEGATIVE_INFINITY }, ETHEREAL)
    ).toEqual({})
  })

  it("clamps absurd magnitudes to each control's real range instead of dropping them", () => {
    expect(parseOverrides({ needles: 1e8 }, ETHEREAL)).toEqual({
      needles: 24,
    })
    expect(parseOverrides({ glowBlur: 1e308 }, ETHEREAL)).toEqual({
      glowBlur: 24,
    })
    expect(parseOverrides({ spotOffset: -1e308 }, ETHEREAL)).toEqual({
      spotOffset: -30,
    })
    expect(
      parseOverrides({ duration: Number.MAX_SAFE_INTEGER }, ETHEREAL)
    ).toEqual({
      duration: 20,
    })
    // breatheAmp beyond its slider produced negative gradient radii mid-cycle
    expect(parseOverrides({ breatheAmp: 1000 }, ETHEREAL)).toEqual({
      breatheAmp: 0.8,
    })
  })

  it("caps the dither grid controls so one link cannot allocate a 100+ MiB grid", () => {
    expect(
      parseOverrides({ band: 1000, block: 2 }, ETHEREAL_DITHER)
    ).toEqual({ band: 64, block: 2 })
    expect(parseOverrides({ bleed: 1000 }, ETHEREAL_DITHER)).toEqual({
      bleed: 48,
    })
    expect(parseOverrides({ reach: 1e6 }, ETHEREAL_DITHER)).toEqual({
      reach: 320,
    })
  })

  it("leaves in-range numbers, including negatives and zero, exactly as sent", () => {
    expect(
      parseOverrides({ duration: 7.25, spotOffset: -12, hueRange: 0 }, ETHEREAL)
    ).toEqual({
      duration: 7.25,
      spotOffset: -12,
      hueRange: 0,
    })
  })
})

describe("parseOverrides enforces the base config's type for each field", () => {
  it("never coerces a string into a number field", () => {
    // the danger is CSS injection: these values are interpolated into
    // custom properties, so "78px;--evil:1" must not survive
    expect(parseOverrides({ spotW: "78" }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ spotW: "78px;--evil:1" }, ETHEREAL)).toEqual({})
  })

  it("rejects booleans, null, objects and arrays offered as numbers", () => {
    expect(parseOverrides({ needles: true }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ needles: null }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ needles: { valueOf: 9 } }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ needles: [9] }, ETHEREAL)).toEqual({})
  })

  it("rejects non-strings for string fields and non-booleans for boolean fields", () => {
    expect(parseOverrides({ path: 3 }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ path: ["around"] }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ path: null }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ needleJitter: "true" }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ needleJitter: 1 }, ETHEREAL)).toEqual({})
  })

  it("keeps well-typed strings and booleans", () => {
    expect(
      parseOverrides({ path: "around", needleJitter: true }, ETHEREAL)
    ).toEqual({
      path: "around",
      needleJitter: true,
    })
  })
})

describe("parseOverrides enforces each select's option list, not just its type", () => {
  it("drops enum strings that are not one of the control's options", () => {
    // "bogus" is a string, so a type check alone would pass it; runtime then
    // silently falls through to different behavior while the copied TSX
    // fails typechecking
    expect(parseOverrides({ path: "bogus" }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ spin: "sideways" }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ gamut: "cmyk" }, ETHEREAL)).toEqual({})
  })

  it("drops numeric-select values outside the option list", () => {
    expect(parseOverrides({ heads: 3 }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ heads: 0 }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ heads: 2 }, ETHEREAL)).toEqual({ heads: 2 })
  })
})

describe("parseOverrides guards the palette array", () => {
  it("caps a huge palette at the editor's 12 entries so a link cannot build unbounded layers", () => {
    const enormous = Array.from(
      { length: 5000 },
      (_unused, index) => `#00000${index % 10}`
    )
    const parsed = parseOverrides({ colors: enormous }, ETHEREAL)
    expect(parsed.colors).toHaveLength(12)
    expect(parsed.colors?.[0]).toBe("#000000")
  })

  it("drops the whole palette if any entry is not a string", () => {
    expect(parseOverrides({ colors: ["#fff", 0] }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ colors: ["#fff", null] }, ETHEREAL)).toEqual({})
    expect(parseOverrides({ colors: ["#fff", ["#000"]] }, ETHEREAL)).toEqual({})
  })

  it("drops the whole palette if any entry is not a parseable CSS color", () => {
    // `background` (and any future shorthand use) accepts url(...) images —
    // a hostile palette entry was a zero-click cross-origin tracking request
    expect(
      parseOverrides({ colors: ["url(https://evil.example/p.png)"] }, ETHEREAL)
    ).toEqual({})
    expect(
      parseOverrides(
        { colors: ["red, url(https://evil.example/p.png)"] },
        ETHEREAL
      )
    ).toEqual({})
    expect(
      parseOverrides({ colors: ["#fff; background-image: url(x)"] }, ETHEREAL)
    ).toEqual({})
    expect(parseOverrides({ colors: ["var(--anything)"] }, ETHEREAL)).toEqual(
      {}
    )
    const oversized = `#ff0000${" ".repeat(80)}`
    expect(parseOverrides({ colors: [oversized] }, ETHEREAL)).toEqual({})
  })

  it("keeps every CSS color form the picker and presets emit", () => {
    const palette = [
      "#7dd3fc",
      "rgb(0,108,97)",
      "rgba(255, 255, 255, 0.5)",
      "oklch(70% 0.1 200)",
      "hsl(200 80% 60%)",
      "transparent",
      "rebeccapurple",
    ]
    expect(parseOverrides({ colors: palette }, ETHEREAL)).toEqual({
      colors: palette,
    })
  })

  it("rejects a non-array offered for the palette", () => {
    expect(parseOverrides({ colors: "#fff" }, ETHEREAL)).toEqual({})
    expect(
      parseOverrides({ colors: { 0: "#fff", length: 1 } }, ETHEREAL)
    ).toEqual({})
  })

  it("accepts an empty palette, which is a legitimate override", () => {
    expect(parseOverrides({ colors: [] }, ETHEREAL)).toEqual({ colors: [] })
  })
})

describe("parseOverrides cannot be used to pollute Object.prototype", () => {
  it("ignores a __proto__ payload and leaves the prototype untouched", () => {
    // JSON.parse creates __proto__ as an OWN property, so the payload really
    // does arrive on the parsed object — what saves us is iterating the base
    // config's keys rather than the attacker's
    const parsed = parseOverrides(
      '{"__proto__":{"polluted":"yes"},"duration":4}',
      ETHEREAL
    )
    expect(parsed).toEqual({ duration: 4 })
    expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(
      false
    )
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(
      (ETHEREAL as unknown as Record<string, unknown>).polluted
    ).toBeUndefined()
  })

  it("ignores constructor and prototype payloads", () => {
    const parsed = parseOverrides(
      '{"constructor":{"prototype":{"polluted":"yes"}},"prototype":{"polluted":"yes"}}',
      ETHEREAL
    )
    expect(parsed).toEqual({})
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it("does not inherit base fields it was never given", () => {
    const parsed = parseOverrides("{}", ETHEREAL)
    expect(Object.keys(parsed)).toEqual([])
    expect(parsed.duration).toBeUndefined()
  })
})

describe("parseOverrides survives deliberately hostile shapes", () => {
  it("returns an empty set for a deeply nested object rather than recursing into it", () => {
    let nested: Record<string, unknown> = { needles: 1e8 }
    for (let depth = 0; depth < 500; depth += 1) nested = { themes: nested }
    expect(parseOverrides(nested, ETHEREAL)).toEqual({})
  })

  it("still extracts the valid fields from a mixed valid/hostile payload", () => {
    const parsed = parseOverrides(
      {
        duration: 6,
        needles: Number.POSITIVE_INFINITY,
        glowBlur: 1e9,
        path: "around",
        spotW: "12",
        colors: ["#fff", "#000"],
        unknownKey: 1,
      },
      ETHEREAL
    )
    expect(parsed).toEqual({
      duration: 6,
      glowBlur: 24,
      path: "around",
      colors: ["#fff", "#000"],
    })
  })
})

// Every preset must survive its own share link byte-for-byte: the parser
// clamps to each control's domain, so a preset value outside its slider's
// range would silently change on reload and stop matching in the preset
// picker. This is the guard that keeps control ranges and preset tuning
// from drifting apart again.
describe("every preset value sits inside its control's domain", () => {
  const tables: [
    string,
    ControlDef<string>[],
    Record<string, Record<string, unknown>>,
  ][] = [
    ["Ethereal", ETHEREAL_CONTROLS, ETHEREAL_PRESETS],
    ["EventHorizon", EH_CONTROLS, EH_PRESETS],
    [
      "EtherealDither",
      DITHER_CONTROLS,
      DITHER_PRESETS,
    ],
  ]
  it("keeps sliders in range and selects inside their option lists", () => {
    for (const [componentName, controls, presets] of tables) {
      const byKey = new Map(controls.map((ctl) => [String(ctl.key), ctl]))
      const check = (overrides: Record<string, unknown>, where: string) => {
        for (const [key, value] of Object.entries(overrides)) {
          if (key === "themes") {
            const themes = value as { dark?: Record<string, unknown> }
            if (themes.dark) check(themes.dark, `${where}.themes.dark`)
            continue
          }
          const ctl = byKey.get(key)
          expect(ctl, `${where}.${key} has no control`).toBeDefined()
          if (ctl?.kind === "slider") {
            expect(value, `${where}.${key}`).toBeGreaterThanOrEqual(ctl.min)
            expect(value, `${where}.${key}`).toBeLessThanOrEqual(ctl.max)
          }
          if (ctl?.kind === "select")
            expect(
              ctl.options.some((option) => option.value === String(value)),
              `${where}.${key} = ${String(value)} not an option`
            ).toBe(true)
        }
      }
      for (const [presetName, overrides] of Object.entries(presets))
        check(overrides, `${componentName}:${presetName}`)
    }
  })
})

describe("genCode emits a snippet that compiles", () => {
  it("quotes state names that are not bare identifiers, so the snippet compiles", () => {
    // `error-state` and `2fa` are legal state names (and legal map keys) but
    // ILLEGAL bare object keys — unquoted they broke every pasted snippet
    const code = genCode("Ethereal", {
      states: {
        "error-state": { light: { base: { duration: 5 } } },
        "2fa": { dark: { base: { needles: 9 } } },
        loading: { light: { base: { flicker: 0.5 } } },
      },
    })
    expect(code).toContain('"error-state": {')
    expect(code).toContain('"2fa": {')
    // identifier-safe names stay bare — quoting everything reads as noise
    expect(code).toContain("loading: {")
    const compiled = ts.transpileModule(code, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: "states-snippet.tsx",
      reportDiagnostics: true,
    })
    expect(
      compiled.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
      )
    ).toEqual([])
  })
})

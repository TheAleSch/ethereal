// This cascade is a MIRROR of the package's `mergeConfig`, and a mirror is
// only worth having if something notices when it stops matching. It already
// drifted once: derivation landed in mergeConfig, this resolver kept its old
// layer list, and pinning a hover slot on `thinking` silently previewed the
// plain base config — the pinned preview lying about what the state looks like
// is the entire failure mode this file exists to prevent.
//
// So the important tests here do not assert hand-written expectations: they
// assert AGREEMENT with `mergeConfig` itself.
import { describe, expect, it } from "vitest"
import { ETHEREAL, ETHEREAL_STATES, deriveEtherealState, mergeConfig } from "@theale/ethereal"
import type { EtherealCfg, StateConfig } from "@theale/ethereal"

import { pinnedStateOverride } from "./pinned-state"

const builtIns = ETHEREAL_STATES as unknown as Record<string, StateConfig<EtherealCfg>>

/** what the component actually renders: the flat config with the pinned
 *  override spread on top, the same way `cloneElement` applies it */
const rendered = (cfg: Partial<EtherealCfg>, over: Record<string, unknown>) => ({
  ...ETHEREAL,
  ...cfg,
  ...over,
})

/** what <Ethereal> itself would resolve for that state and interaction */
const merged = (
  cfg: Partial<EtherealCfg>,
  state: string,
  interaction: { hovered: boolean; pressed: boolean },
  custom?: Record<string, StateConfig<EtherealCfg>>,
  themes?: { light?: Partial<EtherealCfg>; dark?: Partial<EtherealCfg> }
) =>
  mergeConfig<EtherealCfg>({
    defaults: ETHEREAL,
    props: cfg,
    themes,
    state,
    builtIns,
    states: custom,
    derive: deriveEtherealState,
    theme: "dark",
    interaction,
    componentName: "ethereal",
  })

/** the config keys both paths are expected to agree on — the override carries
 *  three control props (`state`/`states`/`themes`) that are not config */
const configKeys = Object.keys(ETHEREAL) as (keyof EtherealCfg)[]
const configOnly = (source: Record<string, unknown>) =>
  Object.fromEntries(configKeys.map((key) => [key, source[key]]))

describe("pinnedStateOverride", () => {
  it("pins nothing for the base slot", () => {
    expect(
      pinnedStateOverride({
        slot: "base",
        stateName: "thinking",
        theme: "dark",
        cfg: { duration: 8 },
        defaults: ETHEREAL,
        builtIns,
        derive: deriveEtherealState,
      })
    ).toEqual({})
  })

  it("suppresses state/states/themes so the component cannot re-resolve them", () => {
    // `state: null` and not `undefined`: mergeConfig reads undefined as 'idle'
    // and would run resolveState on the REAL pointer state, spreading its
    // result after these props and undoing them
    const over = pinnedStateOverride({
      slot: "whileHover",
      stateName: "thinking",
      theme: "dark",
      cfg: { duration: 8 },
      defaults: ETHEREAL,
      builtIns,
      derive: deriveEtherealState,
    })
    expect(over.state).toBeNull()
    expect(over.states).toBeUndefined()
    expect(over.themes).toBeUndefined()
  })

  it("carries the DERIVED variation — a pinned slot must not drop the state's character", () => {
    const cfg = { duration: 8, wander: 0 } as Partial<EtherealCfg>
    const over = pinnedStateOverride({
      slot: "whileHover",
      stateName: "thinking",
      theme: "dark",
      cfg,
      defaults: ETHEREAL,
      builtIns,
      derive: deriveEtherealState,
    })
    // 8 * 0.7 — the value the deriver produces, not the base 8
    expect(over.duration).toBe(deriveEtherealState({ ...ETHEREAL, ...cfg }, "thinking").duration)
    expect(over.duration).not.toBe(8)
  })

  it("agrees with mergeConfig for a pinned hover on a derived state", () => {
    const cfg = { duration: 8, wander: 0.2, needles: 4 } as Partial<EtherealCfg>
    const over = pinnedStateOverride({
      slot: "whileHover",
      stateName: "thinking",
      theme: "dark",
      cfg,
      defaults: ETHEREAL,
      builtIns,
      derive: deriveEtherealState,
    })
    expect(configOnly(rendered(cfg, over))).toEqual(
      configOnly(merged(cfg, "thinking", { hovered: true, pressed: false }) as unknown as Record<string, unknown>)
    )
  })

  it("agrees with mergeConfig for a pinned press, which sits on top of hover", () => {
    const cfg = { duration: 6 } as Partial<EtherealCfg>
    const custom: Record<string, StateConfig<EtherealCfg>> = {
      thinking: {
        dark: {
          base: { strength: 2 },
          whileHover: { strength: 3, needles: 9 },
          whilePressed: { strength: 4 },
        },
      },
    }
    const over = pinnedStateOverride({
      slot: "whilePressed",
      stateName: "thinking",
      theme: "dark",
      cfg,
      defaults: ETHEREAL,
      builtIns,
      custom,
      derive: deriveEtherealState,
    })
    // a real press is hovered AND pressed, so the hover treatment's `needles`
    // survives underneath the press treatment's `strength`
    expect(over.strength).toBe(4)
    expect(over.needles).toBe(9)
    expect(configOnly(rendered(cfg, over))).toEqual(
      configOnly(merged(cfg, "thinking", { hovered: true, pressed: true }, custom) as unknown as Record<string, unknown>)
    )
  })

  it("agrees with mergeConfig when a theme branch is in play", () => {
    const cfg = { duration: 5 } as Partial<EtherealCfg>
    const themes = { dark: { duration: 9, strength: 1.5 } } as {
      dark: Partial<EtherealCfg>
    }
    const over = pinnedStateOverride({
      slot: "whileHover",
      stateName: "audio",
      theme: "dark",
      cfg,
      defaults: ETHEREAL,
      themes,
      builtIns,
      derive: deriveEtherealState,
    })
    // the derived duration must come from the THEME's 9, not the flat 5 —
    // derivation reads the config as the caller expressed it, themes included
    expect(over.duration).toBe(deriveEtherealState({ ...ETHEREAL, ...cfg, ...themes.dark }, "audio").duration)
    expect(configOnly(rendered(cfg, over))).toEqual(
      configOnly(
        merged(cfg, "audio", { hovered: true, pressed: false }, undefined, themes) as unknown as Record<
          string,
          unknown
        >
      )
    )
  })

  it("lets an explicit state entry beat the derived variation, as mergeConfig does", () => {
    const cfg = { duration: 8 } as Partial<EtherealCfg>
    const custom: Record<string, StateConfig<EtherealCfg>> = {
      thinking: { dark: { base: { duration: 2 }, whileHover: { strength: 3 } } },
    }
    const over = pinnedStateOverride({
      slot: "whileHover",
      stateName: "thinking",
      theme: "dark",
      cfg,
      defaults: ETHEREAL,
      builtIns,
      custom,
      derive: deriveEtherealState,
    })
    expect(over.duration).toBe(2)
  })

  it("derives nothing for idle, which renders as no state at all", () => {
    const cfg = { duration: 8 } as Partial<EtherealCfg>
    const over = pinnedStateOverride({
      slot: "whileHover",
      stateName: "idle",
      theme: "dark",
      cfg,
      defaults: ETHEREAL,
      builtIns,
      derive: deriveEtherealState,
    })
    expect(over.duration).toBeUndefined()
    expect(configOnly(rendered(cfg, over))).toEqual(
      configOnly(merged(cfg, "idle", { hovered: true, pressed: false }) as unknown as Record<string, unknown>)
    )
  })

  it("works for an effect with no deriver at all", () => {
    const custom: Record<string, StateConfig<EtherealCfg>> = {
      busy: { dark: { whileHover: { strength: 2 } } },
    }
    const over = pinnedStateOverride({
      slot: "whileHover",
      stateName: "busy",
      theme: "dark",
      cfg: { duration: 4 },
      defaults: ETHEREAL,
      builtIns,
      custom,
    })
    expect(over.strength).toBe(2)
    expect(over.duration).toBeUndefined()
  })
})

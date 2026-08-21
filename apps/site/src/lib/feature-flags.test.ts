import { describe, expect, it } from "vitest"

import { featureEnabled } from "./feature-flags"

describe("featureEnabled", () => {
  it("is strict and disabled by default", () => {
    expect(featureEnabled(undefined)).toBe(false)
    expect(featureEnabled(false)).toBe(false)
    expect(featureEnabled("1")).toBe(false)
    expect(featureEnabled("false")).toBe(false)
  })

  it("enables only an explicit true string", () => {
    expect(featureEnabled("true")).toBe(true)
  })
})

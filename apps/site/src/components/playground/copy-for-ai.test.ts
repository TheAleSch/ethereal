import { describe, expect, it } from "vitest"

import { aiPayload } from "./copy-for-ai"
import { genCode } from "./presets"

describe("Copy for AI snippets", () => {
  it.each(["button", "chat", "card", "pill"] as const)(
    "swaps the generic host for the %s preview host, keeping the import",
    (host) => {
      const payload = aiPayload(
        genCode("Ethereal", { needles: 12 }),
        "<Ethereal>",
        host,
        "Get started",
        "ethereal",
        false
      )

      expect(payload).toContain("import { Ethereal } from 'ethereal-glow'")
      expect(payload).toContain("needles={12}")
      if (host === "chat") {
        expect(payload).toMatch(/<input\s+type="text"/)
      } else if (host === "card") {
        expect(payload).toContain("Nebula pass")
      } else if (host === "pill") {
        expect(payload).toContain("Try it free")
      } else {
        expect(payload).toContain("Get started")
      }
    }
  )
})

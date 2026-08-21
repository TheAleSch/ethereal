import { describe, expect, it } from "vitest"

import { aiPayload } from "./copy-for-ai"
import { genCode } from "./presets"

describe("Copy for AI audio snippets", () => {
  it.each(["button", "chat", "card", "pill"] as const)(
    "keeps the %s preview host while preserving the audio ref lifecycle",
    (host) => {
      const payload = aiPayload(
        genCode("Ethereal", { needles: 12 }, { hotspot: 0.5 }),
        "<Ethereal>",
        host,
        "Get started",
        "ethereal",
        false
      )

      expect(payload).toContain("export function AudioReactiveExample")
      expect(payload).toContain("ref={hostRef}")
      expect(payload).toContain("attachMicAudio(host")
      expect(payload).toContain("detach?.()")
      if (host === "chat") {
        expect(payload).toMatch(/<input\s+type="text"/)
        expect(payload).toContain(
          '<div ref={hostRef} className="relative isolate'
        )
        expect(payload).toContain("useRef<HTMLDivElement>")
      } else if (host === "card") {
        expect(payload).toContain("Nebula pass")
        expect(payload).toContain(
          '<div ref={hostRef} className="relative isolate'
        )
        expect(payload).toContain("useRef<HTMLDivElement>")
      } else if (host === "pill") {
        expect(payload).toContain("Try it free")
        expect(payload).toContain('<button ref={hostRef} type="button"')
      } else {
        expect(payload).toContain("Get started")
        expect(payload).toContain('<button ref={hostRef} type="button"')
      }
    }
  )
})

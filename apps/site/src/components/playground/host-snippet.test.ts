// `hostSnippet` builds the JSX a visitor copies out of the playground (and
// that "Copy for AI" hands to an assistant). It is only useful if the pasted
// result looks like what was on screen and actually compiles, and both of those
// depend on details nothing else checks:
//
//   - the host needs `relative isolate` and the content needs `relative z-10`.
//     Drop either and the glow paints OVER the label instead of behind it —
//     the single most common way people misuse this package, which is exactly
//     why the snippet ships the wrapper at all.
//   - the chat host's effect must be a child of the wrapping <div>, never of
//     the <input>: an input is a replaced element and cannot have children,
//     so that mistake pastes as JSX that does not render.
//   - `surfaceClass` is shared with the live PreviewHost. If the snippet
//     stopped using it, the copied component would render as an unstyled box
//     and no longer resemble the preview it was copied from.
//   - the effect JSX is multi-line and must be re-indented to sit inside the
//     host; a lost indent is what turns tidy output into something people
//     reformat by hand.
import { describe, expect, it } from "vitest"

import { HOST_CLASS, hostSnippet, surfaceClass  } from "./host-snippet"
import type {PreviewKind} from "./host-snippet";
import type { PreviewHostKind } from "./preview-host-kind"

const ALL_HOSTS: PreviewHostKind[] = ["button", "chat", "card", "pill"]
const ALL_KINDS: PreviewKind[] = ["ethereal", "eh", "dither"]

const EFFECT = `<Ethereal
  path="around"
  needles={9}
/>`

describe("surfaceClass", () => {
  it("uses one light surface for every effect, and a darker fill for Event Horizon", () => {
    for (const kind of ALL_KINDS) {
      expect(surfaceClass(kind, true)).toBe("border-black/15 bg-white/70 text-zinc-900")
    }
    // the black-hole effect needs a genuinely dark plate to read against;
    // the glow effects sit on a near-transparent one
    expect(surfaceClass("eh", false)).toBe("border-white/10 bg-black/40")
    expect(surfaceClass("ethereal", false)).toBe("border-white/12 bg-white/[0.03]")
    expect(surfaceClass("dither", false)).toBe(surfaceClass("ethereal", false))
  })

  it("always names a border and a fill, in both themes", () => {
    for (const kind of ALL_KINDS) {
      for (const light of [true, false]) {
        const classes = surfaceClass(kind, light)
        expect(classes).toMatch(/\bborder-/)
        expect(classes).toMatch(/\bbg-/)
      }
    }
  })
})

describe("hostSnippet layers the effect correctly for every host", () => {
  it.each(ALL_HOSTS)("gives the %s host isolation and its content a stacking context", (host) => {
    const snippet = hostSnippet(host, EFFECT, "Get started", "ethereal", false)
    expect(snippet).toContain("relative isolate")
    expect(snippet).toContain("relative z-10")
  })

  it.each(ALL_HOSTS)("styles the %s host with the shared surface classes", (host) => {
    for (const light of [true, false]) {
      const snippet = hostSnippet(host, EFFECT, "Get started", "eh", light)
      expect(snippet).toContain(surfaceClass("eh", light))
    }
  })

  it.each(ALL_HOSTS)("reuses the live preview's own layout classes for the %s host", (host) => {
    const snippet = hostSnippet(host, EFFECT, "Get started", "ethereal", false)
    expect(snippet).toContain(HOST_CLASS[host])
  })

  it.each(ALL_HOSTS)("closes every tag it opens for the %s host", (host) => {
    const snippet = hostSnippet(host, EFFECT, "Get started", "ethereal", false)
    const opened = (snippet.match(/<(div|button|span)[\s>]/g) ?? []).length
    const closed = (snippet.match(/<\/(div|button|span)>/g) ?? []).length
    expect(closed).toBe(opened)
  })
})

describe("hostSnippet per-host shape", () => {
  it("uses the caller's label for the button host and nothing else does", () => {
    expect(hostSnippet("button", EFFECT, "Launch console", "ethereal", false)).toContain(
      ">Launch console<"
    )
    expect(hostSnippet("pill", EFFECT, "Launch console", "ethereal", false)).not.toContain(
      "Launch console"
    )
  })

  it("keeps the chat effect a sibling of the input rather than a child of it", () => {
    const snippet = hostSnippet("chat", EFFECT, "Send", "ethereal", false)
    const inputEnd = snippet.indexOf("/>", snippet.indexOf("<input"))
    expect(inputEnd).toBeGreaterThan(-1)
    // the effect appears after the input closes, and the input is
    // self-closing, so it cannot be wrapping anything
    expect(snippet.indexOf("<Ethereal")).toBeGreaterThan(inputEnd)
    expect(snippet.trimEnd().endsWith("</div>")).toBe(true)
  })

  it("wraps the card host around content, not around a bare effect", () => {
    const snippet = hostSnippet("card", EFFECT, "unused", "ethereal", false)
    expect(snippet).toContain("Nebula pass")
    expect(snippet.startsWith("<div ")).toBe(true)
  })
})

describe("hostSnippet indentation", () => {
  it("indents every line of the effect by two spaces so it nests inside the host", () => {
    const snippet = hostSnippet("button", EFFECT, "Go", "ethereal", false)
    expect(snippet).toContain("\n  <Ethereal\n    path=\"around\"\n    needles={9}\n  />\n")
  })

  it("leaves blank lines blank instead of filling them with trailing whitespace", () => {
    const snippet = hostSnippet("button", "<Ethereal />\n\n<Ethereal />", "Go", "ethereal", false)
    expect(snippet).not.toMatch(/^ +$/m)
  })
})

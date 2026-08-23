import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { EtherealButton } from "../../../../registry/ethereal/ethereal-button"

describe("registry EtherealButton", () => {
  it("keeps its host and touch invariants after conflicting caller classes and styles", () => {
    const html = renderToStaticMarkup(
      <EtherealButton
        className="static isolation-auto contents min-h-0 min-w-0"
        style={{
          position: "static",
          isolation: "auto",
          display: "contents",
          minHeight: 1,
        }}
      >
        <svg aria-hidden="true" />
        <span>Launch</span>
      </EtherealButton>
    )

    expect(html).toContain("relative isolate inline-flex min-h-11 min-w-11")
    expect(html).not.toMatch(
      /class="[^"]*\b(?:static|isolation-auto|contents|min-h-0|min-w-0)\b/
    )
    expect(html).toContain(
      'style="position:relative;isolation:isolate;display:inline-flex;min-height:44px;min-width:44px"'
    )
    expect(html).toContain(
      'class="relative z-10 inline-flex items-center gap-2"'
    )
  })
})

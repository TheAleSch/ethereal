// @vitest-environment jsdom
import { act, createRef } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { installControlledObservers } from "../../../../packages/ethereal/src/test-observers"

import { EtherealButton } from "../../../../registry/ethereal/ethereal-button"

// Same jsdom shims the package's own render tests use: Ethereal's mount
// effect touches matchMedia and rAF, which jsdom does not provide.
const globals = globalThis as Record<string, unknown>
globals.IS_REACT_ACT_ENVIRONMENT = true
globals.requestAnimationFrame = () => 1
globals.cancelAnimationFrame = () => {}
globals.matchMedia = (media: string) => ({
  media,
  matches: false,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})
installControlledObservers()

describe("registry EtherealButton", () => {
  it("keeps the host contract after conflicting caller classes and styles", () => {
    const html = renderToStaticMarkup(
      <EtherealButton
        className="static isolation-auto"
        style={{ position: "static", isolation: "auto" }}
      >
        <svg aria-hidden="true" />
        <span>Launch</span>
      </EtherealButton>
    )

    expect(html).toContain("relative isolate")
    expect(html).not.toMatch(/class="[^"]*\b(?:static|isolation-auto)\b/)
    expect(html).toContain('style="position:relative;isolation:isolate"')
    expect(html).toContain(
      'class="relative z-10 inline-flex items-center gap-2"'
    )
  })

  it("lets callers hide the button with the hidden utility or an inline display", () => {
    const hiddenByClass = renderToStaticMarkup(
      <EtherealButton className="hidden">Launch</EtherealButton>
    )
    const buttonClass =
      hiddenByClass.match(/^<button[^>]*class="([^"]*)"/)?.[1] ?? ""
    expect(buttonClass).toContain("hidden")
    expect(buttonClass).not.toContain("inline-flex")

    const hiddenByStyle = renderToStaticMarkup(
      <EtherealButton style={{ display: "none" }}>Launch</EtherealButton>
    )
    expect(hiddenByStyle).toContain("display:none")
  })

  it("forwards its ref to the underlying button", async () => {
    // forwardRef is what makes the ref reach the DOM node under React 18,
    // where ref-as-prop does not exist; assert the wrapping survives.
    expect((EtherealButton as { $$typeof?: symbol }).$$typeof).toBe(
      Symbol.for("react.forward_ref")
    )

    const host = document.createElement("div")
    const root = createRoot(host)
    const ref = createRef<HTMLButtonElement>()
    await act(async () => {
      root.render(<EtherealButton ref={ref}>Launch</EtherealButton>)
    })
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    await act(async () => {
      root.unmount()
    })
  })
})

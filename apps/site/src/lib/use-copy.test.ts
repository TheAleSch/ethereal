// @vitest-environment jsdom
//
// `useCopy` backs every copy button on the site (share link, code snippet,
// "copy for AI"). Its rules exist because each of them was got wrong once:
//
//   - a REJECTED clipboard write must never show "Copied". Clipboard writes
//     fail routinely — insecure origins, a document without focus, a denied
//     permission — and a false confirmation makes the visitor paste whatever
//     was in their clipboard beforehand and never notice.
//   - `navigator.clipboard` is simply ABSENT on insecure origins whatever the
//     DOM types claim, so touching it throws synchronously; that path has to
//     land in the same error state, not crash the button's onClick.
//   - the flash must fall back to idle on its own, and the timeout must be
//     cleared on unmount — the share-link button used to copy, navigate, and
//     leave a timer firing into a component that no longer existed.
import { act, createElement, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { COPY_FLASH_MS, useCopy } from "./use-copy"
import type { CopySource, CopyState } from "./use-copy"

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

type Harness = {
  /** every state the hook has rendered, in order — so we can prove that
   *  "copied" was never shown even for a single frame */
  rendered: CopyState[]
  copy: (text: CopySource) => Promise<void>
  unmount: () => void
}

function mountCopyButton(flashMs?: number): Harness {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const rendered: CopyState[] = []
  let latestCopy: Harness["copy"] = async () => {}

  const Probe = () => {
    const { state, copy } = useCopy(flashMs)
    rendered.push(state)
    latestCopy = copy
    return null
  }

  const root = createRoot(container)
  act(() => root.render(createElement(Probe)))
  return {
    rendered,
    copy: (text) => latestCopy(text),
    unmount: () => act(() => root.unmount()),
  }
}

/** run the hook's async `copy` and flush the state update it schedules */
const runCopy = async (
  harness: Harness,
  text: Parameters<Harness["copy"]>[0]
) =>
  act(async () => {
    await harness.copy(text)
  })

let writeText: ReturnType<typeof vi.fn>
let active: Harness | null = null

beforeEach(() => {
  vi.useFakeTimers()
  writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  active?.unmount()
  active = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("useCopy on the happy path", () => {
  it("writes the text and confirms with a copied state", async () => {
    active = mountCopyButton()
    expect(active.rendered.at(-1)).toBe("idle")
    await runCopy(active, "https://example.test/playground?c=%7B%7D")
    expect(writeText).toHaveBeenCalledWith(
      "https://example.test/playground?c=%7B%7D"
    )
    expect(active.rendered.at(-1)).toBe("copied")
  })

  it("falls back to idle after the flash window and not before", async () => {
    active = mountCopyButton()
    await runCopy(active, "text")
    act(() => void vi.advanceTimersByTime(COPY_FLASH_MS - 1))
    expect(active.rendered.at(-1)).toBe("copied")
    act(() => void vi.advanceTimersByTime(1))
    expect(active.rendered.at(-1)).toBe("idle")
  })

  it("honours a caller-supplied flash duration", async () => {
    active = mountCopyButton(50)
    await runCopy(active, "text")
    act(() => void vi.advanceTimersByTime(50))
    expect(active.rendered.at(-1)).toBe("idle")
  })

  it("restarts the flash on a second copy instead of expiring on the first one's clock", async () => {
    active = mountCopyButton()
    await runCopy(active, "first")
    act(() => void vi.advanceTimersByTime(COPY_FLASH_MS - 100))
    await runCopy(active, "second")
    act(() => void vi.advanceTimersByTime(COPY_FLASH_MS - 100))
    expect(active.rendered.at(-1)).toBe("copied")
    act(() => void vi.advanceTimersByTime(100))
    expect(active.rendered.at(-1)).toBe("idle")
  })

  it("resolves a lazy text producer at copy time, not at render time", async () => {
    active = mountCopyButton()
    const produce = vi.fn(() => "computed at click")
    expect(produce).not.toHaveBeenCalled()
    await runCopy(active, produce)
    expect(produce).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith("computed at click")
  })

  it("awaits an async text producer before writing", async () => {
    // This assertion is about awaiting the producer, not the flash timer.
    // Real timers keep React's async `act` scheduling independent from the
    // fake clock used by the timer-specific tests above.
    vi.useRealTimers()
    active = mountCopyButton(60_000)
    let resolveText!: (text: string) => void
    const text = new Promise<string>((resolve) => {
      resolveText = resolve
    })
    const pending = active.copy(() => text)
    expect(writeText).not.toHaveBeenCalled()
    await act(async () => {
      resolveText("fetched at click")
      await pending
    })
    expect(writeText).toHaveBeenCalledWith("fetched at click")
    expect(active.rendered.at(-1)).toBe("copied")
  })
})

describe("useCopy never claims success it did not have", () => {
  it("shows error, and never copied, when the clipboard write rejects", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"))
    active = mountCopyButton()
    await runCopy(active, "text")
    expect(active.rendered.at(-1)).toBe("error")
    expect(active.rendered).not.toContain("copied")
  })

  it("shows error, and never copied, when the Clipboard API is missing entirely", async () => {
    // insecure origins: `navigator.clipboard` is undefined and reading
    // through it throws synchronously inside the hook
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    })
    active = mountCopyButton()
    await runCopy(active, "text")
    expect(active.rendered.at(-1)).toBe("error")
    expect(active.rendered).not.toContain("copied")
  })

  it("shows error when an async text producer rejects", async () => {
    vi.useRealTimers()
    active = mountCopyButton(60_000)
    await runCopy(active, async () => {
      throw new Error("fetch failed")
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(active.rendered.at(-1)).toBe("error")
    expect(active.rendered).not.toContain("copied")
  })

  it("still falls back to idle after a failure, so the button becomes usable again", async () => {
    writeText.mockRejectedValue(new Error("nope"))
    active = mountCopyButton()
    await runCopy(active, "text")
    act(() => void vi.advanceTimersByTime(COPY_FLASH_MS))
    expect(active.rendered.at(-1)).toBe("idle")
  })

  it("does nothing at all when the lazy producer has nothing to copy", async () => {
    active = mountCopyButton()
    await runCopy(active, () => null)
    await runCopy(active, () => undefined)
    expect(writeText).not.toHaveBeenCalled()
    expect(active.rendered.at(-1)).toBe("idle")
    // and no flash timer was armed, so nothing will flip state later
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("useCopy cleans up after itself", () => {
  it("clears the pending flash timeout when the component unmounts", async () => {
    const harness = mountCopyButton()
    await runCopy(harness, "text")
    expect(vi.getTimerCount()).toBe(1)
    harness.unmount()
    expect(vi.getTimerCount()).toBe(0)
    // nothing left to fire into the unmounted tree
    act(() => void vi.advanceTimersByTime(COPY_FLASH_MS * 2))
    expect(harness.rendered.at(-1)).toBe("copied")
  })

  it("keeps the same copy callback across renders so consumers can memoize on it", () => {
    const seen: Array<(text: string) => Promise<void>> = []
    const container = document.createElement("div")
    document.body.appendChild(container)
    let forceRender = () => {}
    const Probe = () => {
      const [, setTick] = useState(0)
      const { copy } = useCopy()
      seen.push(copy)
      forceRender = () => setTick((tick) => tick + 1)
      return null
    }
    const root = createRoot(container)
    act(() => root.render(createElement(Probe)))
    act(() => forceRender())
    expect(seen.length).toBeGreaterThan(1)
    expect(seen[0]).toBe(seen.at(-1))
    act(() => root.unmount())
  })
})

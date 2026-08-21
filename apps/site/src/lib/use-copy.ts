"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** how long the confirmation state stays up before falling back to idle */
export const COPY_FLASH_MS = 1600

export type CopyState = "idle" | "copied" | "error"

/**
 * Clipboard write + the "Copied" flash that follows it, in one place.
 *
 * Three copy buttons had grown their own version of this, each with its own
 * 1600ms timer, and one of them (the share-link button) never cleared its
 * timeout — a copy immediately followed by a navigation set state on an
 * unmounted component. The failure path matters too: a rejected write must
 * NEVER show "Copied", or the user pastes whatever was in the clipboard
 * before.
 */
export function useCopy(flashMs: number = COPY_FLASH_MS) {
  const [state, setState] = useState<CopyState>("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copy = useCallback(
    async (text: string | (() => string | null | undefined)) => {
      const value = typeof text === "function" ? text() : text
      if (value == null) return
      try {
        // the Clipboard API is absent on insecure origins, whatever the DOM
        // types claim — reading through it there throws, which lands in the
        // catch below as an error state rather than a false "Copied"
        await navigator.clipboard.writeText(value)
        setState("copied")
      } catch {
        setState("error")
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState("idle"), flashMs)
    },
    [flashMs]
  )

  return { state, copied: state === "copied", copy }
}

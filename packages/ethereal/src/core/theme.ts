import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

export type Theme = 'light' | 'dark'

export function detectTheme(host: HTMLElement | null, explicit?: Theme): Theme {
  if (explicit) return explicit
  if (!host) return 'light'
  // Shadcn, Base UI, Radix: data-theme attribute
  const dataTheme = host.getAttribute('data-theme')
  if (dataTheme === 'dark' || dataTheme === 'light') return dataTheme
  // Shadcn, Tailwind: .dark class
  if (host.classList.contains('dark')) return 'dark'
  if (host.classList.contains('light')) return 'light'
  // check parent for theme
  let ancestor = host.parentElement
  while (ancestor) {
    if (ancestor.getAttribute('data-theme') === 'dark') return 'dark'
    if (ancestor.getAttribute('data-theme') === 'light') return 'light'
    if (ancestor.classList.contains('dark')) return 'dark'
    if (ancestor.classList.contains('light')) return 'light'
    ancestor = ancestor.parentElement
  }
  // CSS media query
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

/* ------------------------------------------------------------------ watcher */

/**
 * ONE document-wide watcher shared by every mounted effect, instead of one
 * MutationObserver per ancestor per instance. The previous shape cost
 * O(instances x tree depth) observers and re-detected on any class change
 * anywhere above a host; this is O(1) and strictly wider coverage — a
 * `.dark` toggled on a mid-tree wrapper is caught too, which the old
 * host-and-ancestors walk only caught because it re-read the whole chain.
 */
const subscribers = new Set<() => void>()
let observer: MutationObserver | null = null
let mql: MediaQueryList | null = null
let queued = false

function notify() {
  // coalesce: a theme switch usually rewrites `class` and `data-theme` in the
  // same task, and every subscriber re-reads the same DOM
  if (queued) return
  queued = true
  queueMicrotask(() => {
    queued = false
    subscribers.forEach((fn) => fn())
  })
}

const THEME_CLASS = /(^|\s)(dark|light)(\s|$)/
const hasThemeClass = (classNames: string | null) => !!classNames && THEME_CLASS.test(classNames)

function start() {
  if (typeof document !== 'undefined' && !observer) {
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'data-theme') return notify()
        // subtree:true means every class change on the page lands here — only
        // wake the effects when dark/light membership actually moved
        if (
          record.attributeName === 'class' &&
          (hasThemeClass((record.target as Element).getAttribute('class')) || hasThemeClass(record.oldValue))
        )
          return notify()
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
      attributeOldValue: true,
      subtree: true,
    })
  }
  // the OS scheme is the last resort in detectTheme, and nothing was watching
  // it — an app with no .dark/data-theme anywhere never saw the user flip
  // their system appearance
  if (typeof window !== 'undefined' && !mql && window.matchMedia) {
    mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', notify)
  }
}

function stop() {
  observer?.disconnect()
  observer = null
  mql?.removeEventListener('change', notify)
  mql = null
}

/** Subscribe to any change that could flip a resolved theme. Returns an
 *  unsubscribe; the shared observer is torn down with the last subscriber. */
export function subscribeTheme(fn: () => void): () => void {
  subscribers.add(fn)
  start()
  return () => {
    subscribers.delete(fn)
    if (subscribers.size === 0) stop()
  }
}

// layout effect on the client so the resolved theme is in before paint — a
// passive effect left dark pages showing one frame of the light config
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Resolve the theme for an effect mounted inside `ref`'s parent, and keep it
 * current. `explicit` pins the value outright; `detector` replaces the whole
 * resolution chain (both opt out of watching, since the caller owns the value).
 */
export function useTheme(
  ref: RefObject<Element | null>,
  explicit?: Theme,
  detector?: (host: HTMLElement | null) => Theme,
): Theme {
  const [theme, setTheme] = useState<Theme>(explicit ?? 'light')

  useIsoLayoutEffect(() => {
    const host = ref.current?.parentElement ?? null
    if (detector) {
      setTheme(detector(host))
      return
    }
    if (explicit) {
      setTheme(explicit)
      return
    }
    const read = () => detectTheme(host, undefined)
    setTheme(read())
    return subscribeTheme(() => setTheme(read()))
    // `ref` is stable; an inline `detector` re-runs this, but with a detector
    // the body is a single read and no subscription, so that is cheap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explicit, detector])

  // an explicit theme needs no round-trip through state
  return explicit ?? theme
}

/** Track the OS/browser motion preference for the lifetime of a mounted
 * effect. Reading it only inside a renderer effect freezes the value at mount;
 * users who enable Reduce Motion while the page is open must be able to stop
 * the animation immediately without reloading. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useIsoLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () => setReduced(query.matches)
    read()
    if (query.addEventListener) {
      query.addEventListener('change', read)
      return () => query.removeEventListener('change', read)
    }
    query.addListener(read)
    return () => query.removeListener(read)
  }, [])

  return reduced
}

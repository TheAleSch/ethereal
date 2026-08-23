import type { PreviewHostKind } from "./preview-host-kind"

export type PreviewKind = "ethereal" | "eh" | "dither"

/** The host element's own classes, per preview shape.
 *
 *  Shared with `PreviewHost` rather than retyped, because these strings exist
 *  twice for two different audiences — once to render the preview, once to
 *  hand an assistant something that reproduces it — and a copy that silently
 *  drifts is worse than no copy at all. The fill and border live in
 *  `surfaceClass` below, for the same reason. */
export const HOST_CLASS: Record<PreviewHostKind, string> = {
  button:
    "relative isolate z-10 rounded-2xl border px-7 py-3.5 text-sm font-medium tracking-tight transition-colors",
  chat: "relative isolate z-10 flex w-full max-w-md items-center gap-2 rounded-2xl border px-4 py-3",
  card: "relative isolate z-10 flex aspect-[4/3] w-full max-w-72 flex-col justify-end gap-1 rounded-2xl border p-5",
  pill: "relative isolate z-10 rounded-full border px-5 py-2 text-xs font-medium",
}

/** The host's fill and border, which is what makes the pasted component look
 *  like the preview rather than an unstyled box. Shared with `PreviewHost` for
 *  the same reason the layout classes are.
 *
 *  The playground additionally applies `[&_.text-muted-foreground]:…`
 *  descendant overrides in light mode; those are a playground device for
 *  re-tinting its own demo content and are deliberately left out of the
 *  snippet, where they would target classes the user's app does not have. */
export function surfaceClass(kind: PreviewKind, light: boolean) {
  if (light) return "border-black/15 bg-white/70 text-zinc-900"
  return kind === "eh"
    ? "border-white/10 bg-black/40"
    : "border-white/12 bg-white/[0.03]"
}

/** Wrap the effect JSX in the host the playground is previewing it on.
 *
 *  The bare effect snippet is unusable on its own: `relative isolate` on the
 *  host and `relative z-10` on the content are what make the glow paint behind
 *  the content rather than over it, and neither is visible in the effect tag.
 *  Indented to sit inside the host, so the result pastes as valid JSX. */
export function hostSnippet(
  host: PreviewHostKind,
  effect: string,
  label: string,
  kind: PreviewKind,
  light: boolean
) {
  const surface = surfaceClass(kind, light)
  const cls = (base: string) => `${base} ${surface}`
  const indented = effect
    .split("\n")
    .map((l) => (l ? `  ${l}` : l))
    .join("\n")

  if (host === "chat") {
    return `<div className="${cls(HOST_CLASS.chat)}">
  {/* an <input> is a replaced element and can never contain the effect —
      the host is this div, so the effect stays a child of it */}
  <input
    type="text"
    placeholder="Ask anything…"
    className="relative z-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
  />
  <button type="button" aria-label="Send" className="relative z-10 size-7 shrink-0 rounded-lg">
    ↑
  </button>
${indented}
</div>`
  }
  if (host === "card") {
    return `<div className="${cls(HOST_CLASS.card)}">
  <span className="relative z-10 text-sm font-medium">Nebula pass</span>
  <span className="relative z-10 text-xs leading-relaxed">
    Everything in free, plus unlimited comets.
  </span>
${indented}
</div>`
  }
  if (host === "pill") {
    return `<button type="button" className="${cls(HOST_CLASS.pill)}">
  <span className="relative z-10">Try it free</span>
${indented}
</button>`
  }
  return `<button type="button" className="${cls(HOST_CLASS.button)}">
  <span className="relative z-10">${label}</span>
${indented}
</button>`
}

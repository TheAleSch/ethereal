"use client"

import { lazy, Suspense, useState } from "react"

import { useCopy } from "@/lib/use-copy"
import { Check, Copy, Info } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { ControlDef } from "./presets"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** The picker (and its culori dependency) is editor-only UI that nothing on
 *  first paint needs, so it loads on the first popover open instead of riding
 *  along in the playground chunk. Base UI's PopoverPortal renders null until
 *  the popover is mounted, so the lazy boundary below never resolves during
 *  prerender or hydration. */
const ColorPickerPanel = lazy(() => import("./color-picker-panel"))

/** Label cell shared by every control row: name, optional override marker,
 *  optional ⓘ explainer. A Popover rather than a Tooltip on purpose — a
 *  hover-only affordance is unreachable on touch, and these hints are the
 *  only place a name like "sat ×" is ever spelled out. */
export function RowLabel({
  label,
  marker,
  hint,
  className,
}: {
  label: string
  marker?: React.ReactNode
  hint?: string
  className?: string
}) {
  return (
    <span className={cn("flex min-w-0 items-center", className)}>
      <Label className="truncate font-mono text-xs text-muted-foreground">
        {label}
      </Label>
      {marker}
      {hint && (
        <Popover>
          <PopoverTrigger
            aria-label={`what does ${label} do?`}
            className="hit-44-gap ml-1 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Info className="size-3" />
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-60 p-3">
            <p className="font-mono text-[11px] text-foreground/70">{label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {hint}
            </p>
          </PopoverContent>
        </Popover>
      )}
    </span>
  )
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  marker,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  /** optional indicator rendered next to the label (e.g. an override marker) */
  marker?: React.ReactNode
  hint?: string
}) {
  // editable readout: type a value, Enter/blur commits (clamped)
  const [draft, setDraft] = useState<string | null>(null)
  const shown =
    draft ?? (Number.isInteger(step) ? String(value) : value.toFixed(2))
  const commit = () => {
    if (draft === null) return
    const n = parseFloat(draft)
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
    setDraft(null)
  }
  return (
    <div className="grid grid-cols-[7rem_1fr_2.75rem] items-center gap-3 sm:grid-cols-[9rem_1fr_3.25rem]">
      <RowLabel label={label} marker={marker} hint={hint} />
      {/* click anywhere on the rail to jump there (Base UI only drags) */}
      <div
        // Capture before the thumb's 44px pseudo hit area handles the event;
        // otherwise nearby rail presses are swallowed and appear inert.
        onPointerDownCapture={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
          const raw = min + frac * (max - min)
          // min-anchored so steps land on the same grid the slider uses
          const snapped = Math.min(
            max,
            Math.max(min, min + Math.round((raw - min) / step) * step)
          )
          onChange(Number(snapped.toFixed(4)))
        }}
      >
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          ariaLabel={label}
          onValueChange={(v) => onChange(typeof v === "number" ? v : v[0])}
        />
      </div>
      <input
        value={shown}
        inputMode="decimal"
        aria-label={`${label} value`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setDraft(null)
        }}
        className="min-h-11 w-full min-w-11 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-xs text-foreground/80 tabular-nums focus:border-white/15 focus:bg-black/30 focus:outline-none"
      />
    </div>
  )
}

export function SelectRow({
  label,
  value,
  options,
  onChange,
  marker,
  hint,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  /** optional indicator rendered next to the label (e.g. an override marker) */
  marker?: React.ReactNode
  hint?: string
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr]">
      <RowLabel label={label} marker={marker} hint={hint} />
      <Select
        value={value}
        onValueChange={(v) => v != null && onChange(String(v))}
      >
        <SelectTrigger className="min-h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function SwitchRow({
  label,
  checked,
  onChange,
  marker,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  /** optional indicator rendered next to the label (e.g. an override marker) */
  marker?: React.ReactNode
  hint?: string
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr]">
      <RowLabel label={label} marker={marker} hint={hint} />
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function CopyButton({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const { copied, copy } = useCopy()

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      aria-label={copied ? "Copied" : "Copy code"}
      className={cn(
        "hit-44 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      {copied ? (
        <Check className="size-4 text-emerald-400" />
      ) : (
        <Copy className="size-4" />
      )}
    </button>
  )
}

export function ColorsRow({
  label,
  colors,
  min = 1,
  max = 12,
  onChange,
  marker,
  hint,
}: {
  label: string
  colors: string[]
  min?: number
  max?: number
  onChange: (colors: string[]) => void
  marker?: React.ReactNode
  hint?: string
}) {
  const [openColor, setOpenColor] = useState<number | null>(null)

  return (
    <div className="grid grid-cols-[7rem_1fr] items-start gap-3 sm:grid-cols-[9rem_1fr]">
      <RowLabel label={label} marker={marker} hint={hint} className="mt-1" />
      <div className="flex flex-wrap items-center gap-1.5">
        {colors.map((c, i) => (
          <span key={i} className="relative">
            <Popover
              open={openColor === i}
              onOpenChange={(open) => setOpenColor(open ? i : null)}
            >
              <PopoverTrigger
                aria-label={`color ${i + 1}`}
                className="block size-11 cursor-pointer rounded-md border border-white/15 p-2"
              >
                {/* backgroundColor, never the `background` shorthand — the
                    shorthand accepts url(...) images, which would turn a
                    hostile shared palette into cross-origin requests */}
                <span
                  className="block h-full w-full rounded"
                  style={{ backgroundColor: c }}
                />
              </PopoverTrigger>
              {/* the popover is a POSITIONER only — ColorPicker.Root paints its
                  own bordered, padded, shadowed panel, so leaving PopoverContent's
                  chrome on nests two surfaces inside each other */}
              <PopoverContent
                side="bottom"
                align="start"
                className="w-auto border-0 bg-transparent p-0 shadow-none"
              >
                <div className="flex w-[17.5rem] flex-col gap-2">
                  <Suspense
                    fallback={
                      <div
                        aria-hidden
                        className="h-[13.5rem] w-[17.5rem] rounded-lg border border-border bg-popover shadow-sm"
                      />
                    }
                  >
                    <ColorPickerPanel
                      value={c}
                      onHexChange={(hex) =>
                        onChange(colors.map((x, j) => (j === i ? hex : x)))
                      }
                    />
                  </Suspense>
                  {colors.length > min && (
                    <button
                      type="button"
                      aria-label={`remove color ${i + 1}`}
                      onClick={() => {
                        setOpenColor(null)
                        onChange(colors.filter((_, j) => j !== i))
                      }}
                      className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-popover px-3 text-xs text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      Remove color
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </span>
        ))}
        {colors.length < max && (
          <button
            type="button"
            aria-label="add color"
            onClick={() =>
              onChange([...colors, colors[colors.length - 1] ?? "#ffffff"])
            }
            className="flex size-11 items-center justify-center rounded-md border border-dashed border-white/20 text-sm text-muted-foreground transition-colors hover:border-white/40 hover:text-foreground"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}

/** One control row, rendered from its definition. Shared by the base-config
 *  editor and the per-state editor so the two can never drift apart — the
 *  whole point of folding base into the same list as the states. */
export function ControlRow({
  ctl,
  value,
  onChange,
  marker,
}: {
  ctl: ControlDef<string>
  value: unknown
  onChange: (v: unknown) => void
  marker?: React.ReactNode
}) {
  if (ctl.kind === "slider")
    return (
      <SliderRow
        label={ctl.label}
        value={Number(value ?? 0)}
        min={ctl.min}
        max={ctl.max}
        step={ctl.step}
        onChange={onChange}
        marker={marker}
        hint={ctl.hint}
      />
    )
  if (ctl.kind === "switch")
    return (
      <SwitchRow
        label={ctl.label}
        checked={Boolean(value)}
        onChange={onChange}
        marker={marker}
        hint={ctl.hint}
      />
    )
  if (ctl.kind === "colors")
    return (
      <ColorsRow
        label={ctl.label}
        colors={(value as string[] | undefined) ?? []}
        min={ctl.min}
        max={ctl.max}
        onChange={onChange}
        marker={marker}
        hint={ctl.hint}
      />
    )
  return (
    <SelectRow
      label={ctl.label}
      value={String(value)}
      options={ctl.options}
      onChange={(v) => onChange(ctl.numeric ? Number(v) : v)}
      marker={marker}
      hint={ctl.hint}
    />
  )
}

/** The five-section control accordion (color · motion · shape · glow ·
 *  interaction). Rendered identically for the base config and for a state's
 *  (theme, slot) cell — only the value/onChange/marker resolvers differ.
 *
 *  `open` is by SECTION TITLE, not by the prefixed item value: the prefix
 *  makes item values unique per cell, so an uncontrolled accordion collapses
 *  back to the first section every time you switch theme, slot or state —
 *  right when you are mid-tweak and want the panel to stay put. Lift `open`
 *  to whatever owns all the cells and they scroll as one. */
export function ControlSections({
  sections,
  valueOf,
  onChange,
  markerOf,
  idPrefix = "",
  open,
  onOpenChange,
}: {
  sections: { title: string; items: ControlDef<string>[] }[]
  valueOf: (key: string) => unknown
  onChange: (key: string, v: unknown) => void
  markerOf?: (key: string) => React.ReactNode
  idPrefix?: string
  /** open section titles, unprefixed. Omit for an uncontrolled accordion. */
  open?: string[]
  onOpenChange?: (next: string[]) => void
}) {
  const controlled = open !== undefined
  return (
    <Accordion
      multiple
      {...(controlled
        ? {
            value: open.map((t) => idPrefix + t),
            onValueChange: (v: unknown[]) =>
              onOpenChange?.(
                v
                  .filter((x): x is string => typeof x === "string")
                  .map((x) => x.slice(idPrefix.length))
              ),
          }
        : { defaultValue: [idPrefix + (sections[0]?.title ?? "")] })}
      className="rounded-lg border border-white/10"
    >
      {sections.map((sec) => (
        <AccordionItem
          key={sec.title}
          value={idPrefix + sec.title}
          className="border-white/5 px-2 sm:px-3"
        >
          <AccordionTrigger className="py-2.5 text-[11px] font-semibold tracking-wide text-zinc-300 uppercase">
            {sec.title}
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3 pb-3">
            {sec.items.map((ctl, i) => {
              // a subtitle opens whenever the cluster changes; the first one
              // gets no rule above it, since the section header already is one
              const sub = ctl.subgroup
              const started = sub && sub !== sec.items[i - 1]?.subgroup
              return (
                <div key={String(ctl.key)} className="contents">
                  {started && (
                    <p
                      className={cn(
                        "font-mono text-[10px] tracking-wide text-muted-foreground/70 uppercase",
                        i > 0 && "mt-1 border-t border-white/5 pt-3"
                      )}
                    >
                      {sub}
                    </p>
                  )}
                  <ControlRow
                    ctl={ctl}
                    value={valueOf(String(ctl.key))}
                    onChange={(v) => onChange(String(ctl.key), v)}
                    marker={markerOf?.(String(ctl.key))}
                  />
                </div>
              )
            })}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

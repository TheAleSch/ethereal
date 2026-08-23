"use client"

import {
  ColorPickerArea,
  ColorPickerCssInput,
  ColorPickerEyeDropper,
  ColorPickerHue,
  ColorPickerPreview,
  ColorPickerRoot,
  parseColor,
} from "@/components/ui/fill-picker/compact-color-picker"

/** The amplo picker panel, split into its own module so React.lazy can keep it
 *  — and culori, which it pulls in — out of the initial playground chunk. It is
 *  only ever rendered inside an open color-chip popover, so the download starts
 *  on the first click rather than on page load. Default export because that is
 *  what React.lazy resolves. */
export default function ColorPickerPanel({
  value,
  onHexChange,
}: {
  value: string
  onHexChange: (hex: string) => void
}) {
  return (
    /* amplo — OKLCH-native, gamut-aware picker (amplo.ale.design) */
    <ColorPickerRoot
      // culori parses every CSS form the config can carry, so
      // the color goes in as written — no hex round-trip
      value={parseColor(value) ?? undefined}
      backgroundColor="#0a0a0b"
      onValueChange={(_next, _formatted, formats) => onHexChange(formats.hex)}
      className="flex flex-col gap-2"
    >
      <ColorPickerArea mode="oklch-cl" className="h-32 w-full rounded-md" />
      <ColorPickerHue className="w-full" />
      <div className="flex items-center gap-2">
        <ColorPickerPreview className="size-6 shrink-0 rounded" />
        <ColorPickerCssInput className="h-7 flex-1 rounded border border-white/10 bg-black/30 px-2 font-mono text-[11px]" />
        <ColorPickerEyeDropper className="size-6 shrink-0" />
      </div>
    </ColorPickerRoot>
  )
}

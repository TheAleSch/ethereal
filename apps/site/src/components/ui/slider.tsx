import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ariaLabel,
  ...props
}: SliderPrimitive.Root.Props & { ariaLabel?: string }) {
  // Base UI accepts either a scalar (one thumb) or an array (range). Keep the
  // rendered Thumb count in lockstep with that shape. Falling back to
  // `[min, max]` made every scalar playground slider mount two overlapping
  // thumbs at index 0, so pointer drags fought over the same value.
  const _values = Array.isArray(value)
    ? value
    : value !== undefined
      ? [value]
      : Array.isArray(defaultValue)
        ? defaultValue
        : defaultValue !== undefined
          ? [defaultValue]
          : [min]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex min-h-11 w-full cursor-pointer touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:min-w-11 data-vertical:flex-col"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-white/15 select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            getAriaLabel={ariaLabel ? () => ariaLabel : undefined}
            // focus lands on the hidden input INSIDE the thumb, so the
            // visible ring must key off focus-within, not focus-visible
            className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 focus-within:ring-3 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

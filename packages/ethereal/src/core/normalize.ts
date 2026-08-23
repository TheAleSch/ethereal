/** Runtime boundary helpers. Public TypeScript types are not a security or
 * resource boundary: JavaScript, `any`, and deserialized configs can still
 * supply strings, objects, infinities, or enormous arrays. */
export const MAX_PALETTE_COLORS = 12
export const MAX_COLOR_LENGTH = 256
const MAX_PALETTE_INPUTS = 48

export function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(finiteNumber(value, fallback, min, max))
}

export function boundedPalette(value: unknown, fallback: readonly string[]): string[] {
  const colors: string[] = []
  if (Array.isArray(value)) {
    let inspected = 0
    for (const color of value) {
      if (++inspected > MAX_PALETTE_INPUTS) break
      if (typeof color === 'string' && color.length <= MAX_COLOR_LENGTH) colors.push(color)
      if (colors.length === MAX_PALETTE_COLORS) break
    }
  }
  return colors.length ? colors : [...fallback]
}

/** Dependency signature for the fixed-shape renderer configs. Invalid object,
 * bigint, symbol, and circular runtime values all normalize to the same
 * fallback class instead of making JSON.stringify throw before guards run. */
export function runtimeConfigSignature(config: Record<string, unknown>, palette: readonly string[]): string {
  return Object.keys(config)
    .map((key) => {
      if (key === 'colors') return `${key}:${JSON.stringify(palette)}`
      const value = config[key]
      if (typeof value === 'number') return `${key}:${Number.isFinite(value) ? value : 'nonfinite'}`
      if (typeof value === 'string' || typeof value === 'boolean' || value == null)
        return `${key}:${JSON.stringify(value)}`
      return `${key}:invalid-${typeof value}`
    })
    .join('|')
}

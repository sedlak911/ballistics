import { MOA_PER_MIL, type AngleUnit } from './units'

/** Distance from a known size and how many angle units it spans: d = size × 1000 / mils. */
export function rangeFromReading(sizeM: number, reading: number, unit: AngleUnit): number | null {
  if (!(reading > 0) || !(sizeM > 0)) return null
  const mils = unit === 'mil' ? reading : reading / MOA_PER_MIL
  return (sizeM * 1000) / mils
}

/**
 * A slider scale for a reading between `lo` (far) and `hi` (near) that is even in log: equal travel for an equal
 * ratio of distance, so 1000 → 500 m gets as much of the slider as 100 → 50 m.
 */
export function readingScale(lo: number, hi: number): { max: number; toPos: (r: number) => number; fromPos: (p: number) => number } {
  const max = 1000
  const span = Math.log(hi / lo)
  return {
    max,
    toPos: (r) => (max * Math.log(r / lo)) / span,
    fromPos: (p) => lo * Math.exp((p / max) * span),
  }
}

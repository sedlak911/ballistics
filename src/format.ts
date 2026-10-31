import { toDisplay, type UnitSystem } from './engine/units'

/** A no-break space: a figure and its unit never split across lines (DESIGN.md, Figures and units). */
export const NBSP = '\u00a0'

export function fmtDistance(m: number, sys: UnitSystem): string {
  const d = toDisplay(m, 'distance', sys)
  return `${Math.round(d.value)}${NBSP}${d.unit}`
}

/** Magnitude only: callers show the direction with an arrow. */
export function fmtLength(m: number, sys: UnitSystem): string {
  const a = Math.abs(m)
  if (sys === 'metric' && a >= 1) return `${a.toFixed(2)}${NBSP}m`
  const d = toDisplay(a, 'length', sys)
  return `${Math.round(d.value)}${NBSP}${d.unit}`
}

export function fmtSpeed(ms: number, sys: UnitSystem): string {
  const d = toDisplay(ms, 'speed', sys)
  return `${Math.round(d.value)}${NBSP}${d.unit}`
}

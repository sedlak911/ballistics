/** The MV hint (Ruling 15): what a barrel of another length does to a round's muzzle velocity. */

/** Metres per second per inch of barrel: the research's estimate from general experience (§4.3), not a measurement. */
export const MV_MS_PER_IN = 7.5
/** The hint's step, and the smallest change worth a hint. */
const STEP_MS = 5
const MM_PER_IN = 25.4

/** A built-in rifle's barrel as the preset gives it (`27″`, `16.5″`, `475 mm`), in inches; null for `—` or anything else. */
export function barrelLengthIn(barrel: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(″|mm)\s*$/.exec(barrel)
  if (m === null) return null
  const v = Number(m[1])
  return m[2] === 'mm' ? Math.round((v / MM_PER_IN) * 100) / 100 : v
}

/** The MV for a barrel of `toIn` when it is `mvMs` for `fromIn`: the change rounded to the nearest 5 m/s (a tie away from zero), null when that is 0 (a change under 2.5 m/s). */
export function mvForBarrel(mvMs: number, fromIn: number, toIn: number): { deltaMs: number; mvMs: number } | null {
  const steps = ((toIn - fromIn) * MV_MS_PER_IN) / STEP_MS
  // Half away from zero, so a tie gives the same size either way (Math.round sends x.5 upward).
  const deltaMs = Math.sign(steps) * Math.round(Math.abs(steps)) * STEP_MS
  if (deltaMs === 0) return null
  return { deltaMs, mvMs: mvMs + deltaMs }
}

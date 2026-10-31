import { angleOfOffset, MOA_PER_MIL, type AngleUnit } from '../engine/units'

// Positions are SVG px in the scope's 440×440 viewBox (DESIGN.md, Scope view).
export const SCOPE_SIZE = 440
export const C = SCOPE_SIZE / 2
export const LENS_R = 196
export const PX_PER_MIL = 17
/** The mark's ring and ticks (13 px) stay inside the lens. */
export const MARK_MAX_PX = 175
/** In a 2D normal spread, 68 % of shots fall within 1.51σ and 95 % within 2.45σ. */
export const SPREAD_68 = 1.51
export const SPREAD_95 = 2.45

const pxPerUnit = (unit: AngleUnit) => (unit === 'mil' ? PX_PER_MIL : PX_PER_MIL / MOA_PER_MIL)

/**
 * The reticle point you put on the target. With a hash reticle you hold over by placing a mark *below*
 * the centre on the target, and lead by placing a mark *behind* the direction of travel on it.
 * A point outside the view is pulled in to the lens edge along the same bearing and flagged as not to scale.
 */
export function aimMark(holdover: number, lead: number, direction: 1 | -1, unit: AngleUnit): { x: number; y: number; clamped: boolean } {
  const px = pxPerUnit(unit)
  const dx = -direction * lead * px
  const dy = holdover * px
  const r = Math.hypot(dx, dy)
  const k = r > MARK_MAX_PX ? MARK_MAX_PX / r : 1
  return { x: C + dx * k, y: C + dy * k, clamped: k < 1 }
}

export function targetHeightPx(distanceM: number, targetHeightM = 1.8): number {
  return angleOfOffset(targetHeightM, distanceM, 'mil') * PX_PER_MIL
}

/** The 68 % and 95 % ellipses for a 1σ spread given in angle units; null when the spread is unknown. */
export function spreadEllipses(sigma: { x: number; y: number } | null, unit: AngleUnit):
  { r68: { rx: number; ry: number }; r95: { rx: number; ry: number } } | null {
  if (!sigma) return null
  const px = pxPerUnit(unit)
  const ring = (k: number) => ({ rx: sigma.x * px * k, ry: sigma.y * px * k })
  return { r68: ring(SPREAD_68), r95: ring(SPREAD_95) }
}

/** Hashes along one arm of the reticle: every MIL out to 7 (numbered 2, 4, 6), or every 4 MOA out to 24 (8, 16, 24). */
export function reticleTicks(unit: AngleUnit): { offsetPx: number; major: boolean; label: string | null }[] {
  const [step, count, every] = unit === 'mil' ? [1, 7, 2] : [4, 6, 8]
  return Array.from({ length: count }, (_, i) => {
    const v = (i + 1) * step
    const major = v % every === 0 && v <= 3 * every
    return { offsetPx: v * pxPerUnit(unit), major, label: major ? String(v) : null }
  })
}

/** A rectangle in viewBox px, x0 ≤ x1 and y0 ≤ y1. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Geist Mono advances 0.6 em per character; its digits stand about 0.72 em tall. */
export const MONO_ADVANCE = 0.6
const MONO_CAP = 0.72

/**
 * Hash numbers: above the horizontal axis on both sides, and right of the vertical axis below the centre, in
 * `fontSize` viewBox px. A number within a label's box (40 × 16 px around a point in `avoid`) or touching a box in
 * `avoid` (a plate, the figure) is left out, so nothing sits on it.
 */
export function reticleLabels(unit: AngleUnit, avoid: ({ x: number; y: number } | Box)[], fontSize = 9): { x: number; y: number; text: string }[] {
  const out: { x: number; y: number; text: string }[] = []
  for (const t of reticleTicks(unit)) {
    if (!t.label) continue
    out.push({ x: C - t.offsetPx, y: C - 9, text: t.label }, { x: C + t.offsetPx, y: C - 9, text: t.label })
    out.push({ x: C + 12, y: C + t.offsetPx + 0.35 * fontSize, text: t.label })
  }
  const M = 2
  return out.filter((l) => {
    // Above the axis a number is centred on its hash; right of the vertical axis it starts at its x.
    const w = l.text.length * MONO_ADVANCE * fontSize
    const x0 = l.y < C ? l.x - w / 2 : l.x
    const own = { x0, x1: x0 + w, y0: l.y - MONO_CAP * fontSize, y1: l.y }
    return !avoid.some((a) => 'x0' in a
      ? own.x0 < a.x1 + M && own.x1 > a.x0 - M && own.y0 < a.y1 + M && own.y1 > a.y0 - M
      : Math.abs(l.x - a.x) < 40 && Math.abs(l.y - a.y) < 16)
  })
}

/** A round plate on a post: the plate's true angular size in px, and a post about 0.9 m long (and thin) under it. */
export function discGeometry(distanceM: number, diameterM: number): { diameterPx: number; postPx: number; postW: number } {
  const diameterPx = targetHeightPx(distanceM, diameterM)
  return { diameterPx, postPx: targetHeightPx(distanceM, 0.9), postW: Math.max(1.5, diameterPx * 0.12) }
}

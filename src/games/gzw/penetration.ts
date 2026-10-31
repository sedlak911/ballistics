import { NIJ_CLASSES, type GzwAmmo, type PenRating } from './types'

/** Ratings implied by "stopped by class X", the same way the wiki chart builds its own. */
export function deriveFromStoppedBy(stoppedBy: string | null): PenRating[] | null {
  if (stoppedBy === null) return null
  const cls = stoppedBy.replace(/^NIJ\s*/, '').trim()
  if (cls === '0') return NIJ_CLASSES.map(() => 0)
  const i = NIJ_CLASSES.indexOf(cls as (typeof NIJ_CLASSES)[number])
  if (i === -1) return NIJ_CLASSES.map(() => 2) // NIJ IV: no armor in the game stops it
  return NIJ_CLASSES.map((_, j) => (j < i ? 2 : j === i ? 1 : 0))
}

/** How many classes tougher armor counts at range. */
export type Shift = 0 | 1 | 2

/** The wiki chart reflects typical engagement distances; we take it to hold out to here. */
export const CHART_RANGE_M = 150

/**
 * Our estimate of the penetration a round loses with its energy: GZW models the loss but publishes no numbers.
 * The ratio is the energy at the target against the energy at CHART_RANGE_M. Below 75 % armor counts one class
 * tougher, below 50 % two (about 25 % of energy per class step, as between neighbouring real NIJ test rounds).
 */
export function energyShift(energyRatio: number): Shift {
  return energyRatio >= 0.75 ? 0 : energyRatio >= 0.5 ? 1 : 2
}

type Rated = { ratings: PenRating[]; disagree: boolean[]; source: 'chart' | 'derived' | 'none' }

function atMuzzle(ammo: GzwAmmo): Rated {
  const derived = deriveFromStoppedBy(ammo.stoppedBy)
  const chart = ammo.chart
  if (chart && derived) {
    return {
      ratings: chart.map((c, i) => Math.min(c, derived[i]) as PenRating),
      disagree: chart.map((c, i) => c !== derived[i]),
      source: 'chart',
    }
  }
  const none = NIJ_CLASSES.map(() => false)
  if (chart) return { ratings: chart, disagree: none, source: 'chart' }
  if (derived) return { ratings: derived, disagree: none, source: 'derived' }
  return { ratings: NIJ_CLASSES.map(() => 0), disagree: none, source: 'none' }
}

/**
 * Chart first, stopped_by as fallback; where both exist and disagree, the worse rating wins and is flagged. With a
 * shift, each class is rated as the one `shift` steps tougher; past III++ comes class IV, which only a round stopped
 * by IV takes on at magdump, and which an unrated round is guessed one step below its III++ rating. Past IV: 0.
 */
export function ratingsFor(ammo: GzwAmmo, shift: Shift = 0): Rated {
  const base = atMuzzle(ammo)
  if (shift === 0) return base
  const top = base.ratings[NIJ_CLASSES.length - 1]
  const iv: PenRating = ammo.stoppedBy === 'NIJ IV' ? 1 : ammo.stoppedBy === null ? (Math.max(0, top - 1) as PenRating) : 0
  const scale = [...base.ratings, iv]
  return { ...base, ratings: base.ratings.map((r, i) => Math.min(r, scale[i + shift] ?? 0) as PenRating) }
}

/** The toughest class a round usually penetrates (index into NIJ_CLASSES), or null when it usually penetrates none. */
export function topPenetratedClass(ratings: PenRating[]): number | null {
  const i = ratings.lastIndexOf(2)
  return i === -1 ? null : i
}

import { pointAt, type TrajectoryPoint } from './trajectory'
import { radFromAngle } from './units'

/** A target area as a rectangle with the same area as the real shape. */
export interface Zone {
  widthM: number
  heightM: number
}

/** Independent errors at the target, each a 1σ per-axis spread in metres. */
export interface ErrorSources {
  weaponM: number
  holdM: number
  /** From aiming for the wrong distance: lead on the horizontal axis, holdover on the vertical. */
  distanceXM: number
  distanceYM: number
  leadM: number
}

export type ErrorSource = 'weapon' | 'hold' | 'distance' | 'lead'

// The lead guess (speed class, crossing angle) is assumed to be off by this fraction, 1σ.
const LEAD_ERROR = 0.3
// Removing an error must raise the chance by more than this to be worth naming: half a point, the rounding of a
// whole-percent figure.
const MIN_GAIN = 0.005

/** Standard normal CDF via the Abramowitz–Stegun 7.1.26 erf (|error| < 1.5e-7). */
export function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-z * z)
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

const axis = (half: number, sigma: number) => (sigma > 0 ? 2 * normalCdf(half / sigma) - 1 : 1)

/** The 1σ spread of shots at the target, per axis, in metres: the errors add in quadrature. */
export function spreadSigma(e: ErrorSources): { x: number; y: number } {
  const common = e.weaponM ** 2 + e.holdM ** 2
  return { x: Math.sqrt(common + e.distanceXM ** 2 + e.leadM ** 2), y: Math.sqrt(common + e.distanceYM ** 2) }
}

/** Chance that a shot aimed at the zone's centre lands inside it. */
export function hitProbability(zone: Zone, e: ErrorSources): number {
  const s = spreadSigma(e)
  return axis(zone.widthM / 2, s.x) * axis(zone.heightM / 2, s.y)
}

/**
 * The error worth fixing first: the one whose removal raises the chance to hit `zone` the most. Null when none raises
 * it by more than half a point, so an error that is not there (an unknown weapon accuracy) never wins a tie.
 */
export function dominantSource(zone: Zone, e: ErrorSources): ErrorSource | null {
  const p = hitProbability(zone, e)
  const gains: [ErrorSource, number][] = [
    ['weapon', hitProbability(zone, { ...e, weaponM: 0 }) - p],
    ['hold', hitProbability(zone, { ...e, holdM: 0 }) - p],
    ['distance', hitProbability(zone, { ...e, distanceXM: 0, distanceYM: 0 }) - p],
    ['lead', hitProbability(zone, { ...e, leadM: 0 }) - p],
  ]
  let best: ErrorSource | null = null
  let bestGain = MIN_GAIN
  for (const [source, gain] of gains) {
    if (gain > bestGain) {
      best = source
      bestGain = gain
    }
  }
  return best
}

/**
 * The error budget for a shot at `distanceM`. Weapon accuracy is read as the full cone diameter (σ = D/4 for a
 * uniform disc); a wrong distance estimate misses by the change in hold and lead angle over ±σ.
 */
export function errorSources(
  traj: TrajectoryPoint[],
  distanceM: number,
  o: { accuracyMoa: number | null; steadinessMil: number; rangeSigmaPct: number; crossingSpeedMs: number },
): ErrorSources {
  const d = distanceM
  const groupM = o.accuracyMoa === null ? 0 : 2 * d * Math.tan(radFromAngle(o.accuracyMoa, 'moa') / 2)
  const tof = (x: number) => pointAt(traj, x).timeS
  const hold = (x: number) => -pointAt(traj, x).dropM / x
  const lead = (x: number) => (o.crossingSpeedMs * tof(x)) / x

  const sigmaD = (d * o.rangeSigmaPct) / 100
  let distanceXM = 0
  let distanceYM = 0
  if (sigmaD > 0) {
    const lo = Math.max(traj[1].distanceM, d - sigmaD)
    const hi = Math.min(traj[traj.length - 1].distanceM, d + sigmaD)
    if (hi > lo) {
      const miss = (f: (x: number) => number) => (d * Math.abs(f(hi) - f(lo)) * sigmaD) / (hi - lo)
      distanceXM = miss(lead)
      distanceYM = miss(hold)
    }
  }

  return {
    weaponM: groupM / 4,
    holdM: (o.steadinessMil * d) / 1000,
    distanceXM,
    distanceYM,
    leadM: LEAD_ERROR * o.crossingSpeedMs * tof(d),
  }
}

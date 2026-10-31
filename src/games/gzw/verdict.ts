import { dominantSource, errorSources, hitProbability, spreadSigma, type ErrorSource, type Zone } from '../../engine/hitChance'
import type { TrajectoryPoint } from '../../engine/trajectory'
import type { Posture } from '../../settings/url'
import type { AimZone } from './profile'
import { DISTANCE_M } from './ranging'

export type Verdict = 'shoot' | 'risky' | 'closeIn' | 'noGood'

/**
 * The aim zones by the target's posture, as equal-area rectangles in metres. Estimates: a ~0.18 × 0.24 m head with
 * helmet, and the plate-carrier chest. Kneeling, the thighs hide the bottom of the chest. Prone lies side-on, as the
 * scope draws it: the chest is wide and low, and the head shows less of its height.
 */
export const POSTURE_ZONES: Record<Posture, Record<AimZone, Zone>> = {
  standing: { head: { widthM: 0.16, heightM: 0.21 }, chest: { widthM: 0.32, heightM: 0.42 } },
  kneeling: { head: { widthM: 0.16, heightM: 0.21 }, chest: { widthM: 0.32, heightM: 0.34 } },
  prone: { head: { widthM: 0.16, heightM: 0.15 }, chest: { widthM: 0.4, heightM: 0.18 } },
}

// The loosest distance certainty the toolbar offers, ±%.
const LOOSEST_CERTAINTY_PCT = 20
/**
 * How far to solve the trajectory the verdict reads: past the farthest distance by the loosest certainty, so the
 * distance error's ±σ window still fits there. A window cut short at the end of the table understates the error.
 */
export const SOLVE_TO_M = (DISTANCE_M.max * (100 + LOOSEST_CERTAINTY_PCT)) / 100

export interface VerdictResult {
  head: number
  chest: number
  /** The error worth fixing first; null when none costs a meaningful chance. */
  dominant: ErrorSource | null
  verdict: Verdict
  /** The farthest distance (10 m steps) where the aim zone reaches 50 %; null when already there or never. */
  closeInM: number | null
  closer: { distanceM: number; head: number; chest: number }[]
  /** The 1σ spread of shots at the current distance, per axis, in metres. */
  sigmaM: { x: number; y: number }
}

export interface VerdictInputs {
  accuracyMoa: number | null
  steadinessMil: number
  rangeSigmaPct: number
  crossingSpeedMs: number
  zone: AimZone
  posture: Posture
}

const SHOOT = 0.5
const RISKY = 0.25
const MIN_M = 25

/** Shoot from here, or close in: judged on the aim zone (the head unless the owner picked the chest). */
export function verdictFor(traj: TrajectoryPoint[], distanceM: number, o: VerdictInputs): VerdictResult {
  const zones = POSTURE_ZONES[o.posture]
  const chances = (d: number) => {
    const e = errorSources(traj, d, o)
    return {
      head: hitProbability(zones.head, e), chest: hitProbability(zones.chest, e), dominant: dominantSource(zones[o.zone], e),
      sigmaM: spreadSigma(e),
    }
  }
  const here = chances(distanceM)
  const p = here[o.zone]

  let closeInM: number | null = null
  if (p < SHOOT) {
    const steps = []
    for (let d = Math.ceil(distanceM / 10) * 10 - 10; d > MIN_M; d -= 10) steps.push(d)
    steps.push(MIN_M)
    closeInM = steps.find((d) => d < distanceM && chances(d)[o.zone] >= SHOOT) ?? null
  }

  const closer = [...new Set([0.75, 0.5, 0.25].map((f) => Math.max(MIN_M, Math.round((distanceM * f) / 5) * 5)))]
    .filter((d) => d < distanceM)
    .map((d) => ({ distanceM: d, head: chances(d).head, chest: chances(d).chest }))

  const verdict: Verdict = p >= SHOOT ? 'shoot' : p >= RISKY ? 'risky' : closeInM !== null ? 'closeIn' : 'noGood'
  return { head: here.head, chest: here.chest, dominant: here.dominant, verdict, closeInM, closer, sigmaM: here.sigmaM }
}

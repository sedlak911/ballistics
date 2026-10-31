import { pointAt, type TrajectoryPoint } from './trajectory'
import { angleOfOffset, radFromAngle, type AngleUnit } from './units'

/** Real-world human speeds in m/s. Nobody has measured GZW's, so the UI marks these as assumptions. */
export const TARGET_SPEEDS = { standing: 0, walking: 1.5, jogging: 3, sprinting: 5.5 } as const
export type Movement = keyof typeof TARGET_SPEEDS
export type CrossingAngle = 90 | 45

const CROSSING_FACTOR: Record<CrossingAngle, number> = { 90: 1, 45: 0.71 }

export interface AimSolution {
  /** Angle units; positive = aim above the target, negative = aim below. */
  holdover: number
  /** Linear offset at the target, signed like holdover. */
  holdoverLinearM: number
  /** Angle units, always ≥ 0, in the direction of travel. */
  lead: number
  leadLinearM: number
  timeOfFlightS: number
  velocityMs: number
  /** Null when the weapon's accuracy is unknown. */
  groupDiameterM: number | null
}

/** The target's speed across the line of fire, in m/s. */
export function crossingSpeedMs(movement: Movement, crossing: CrossingAngle): number {
  return TARGET_SPEEDS[movement] * CROSSING_FACTOR[crossing]
}

/** Weapon MOA adjusted by the ammo's accuracy modifier (%), positive meaning a tighter group. */
export function effectiveMoa(baseMoa: number | null, ammoModifierPct: number | null): number | null {
  if (baseMoa === null) return null
  if (ammoModifierPct === null) return baseMoa
  return baseMoa * (1 - ammoModifierPct / 100)
}

export function aimSolution(
  traj: TrajectoryPoint[],
  distanceM: number,
  o: { movement: Movement; crossing: CrossingAngle; unit: AngleUnit; accuracyMoa: number | null },
): AimSolution {
  const p = pointAt(traj, distanceM)
  const holdoverLinearM = -p.dropM
  const leadLinearM = crossingSpeedMs(o.movement, o.crossing) * p.timeS
  return {
    holdover: angleOfOffset(holdoverLinearM, distanceM, o.unit),
    holdoverLinearM,
    lead: angleOfOffset(leadLinearM, distanceM, o.unit),
    leadLinearM,
    timeOfFlightS: p.timeS,
    velocityMs: p.velocityMs,
    groupDiameterM: o.accuracyMoa === null ? null : 2 * distanceM * Math.tan(radFromAngle(o.accuracyMoa, 'moa') / 2),
  }
}

/** The zero setting closest to the target distance on the sight's steps, or null when the scope can't zero that far. */
export function suggestedZero(distanceM: number, zero: { minM: number; maxM: number; stepM: number }): number | null {
  const z = Math.max(zero.minM, Math.round(distanceM / zero.stepM) * zero.stepM)
  return z > zero.maxM ? null : z
}

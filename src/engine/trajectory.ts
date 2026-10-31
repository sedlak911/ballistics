import { airDensity, DEFAULT_ATMOSPHERE, speedOfSound, type Atmosphere } from './atmosphere'
import type { DragModel } from './drag'
import { solveFlight } from './flight'

export interface Projectile {
  muzzleVelocityMs: number
  /** Ballistic coefficient in lb/in² for the drag model; Infinity means no drag. */
  bc: number
  dragModel: DragModel
}

export interface ShotSetup {
  projectile: Projectile
  zeroM: number
  sightHeightM: number
  atmosphere?: Atmosphere
}

export interface TrajectoryPoint {
  distanceM: number
  timeS: number
  velocityMs: number
  /** Height relative to the line of sight; positive is above it. */
  dropM: number
}

export const SIGHT_HEIGHT_M = 0.04

export function solveTrajectory(setup: ShotSetup, maxDistanceM: number, sampleEveryM = 5): TrajectoryPoint[] {
  const { projectile } = setup
  const atmo = setup.atmosphere ?? DEFAULT_ATMOSPHERE
  // A flat shot in still air: the 2D view of the 3D flight.
  const points = solveFlight(
    {
      muzzleVelocityMs: projectile.muzzleVelocityMs,
      bc: projectile.bc,
      drag: projectile.dragModel,
      sightHeightM: setup.sightHeightM,
      zeroM: setup.zeroM,
      air: { densityKgM3: airDensity(atmo), speedOfSoundMs: speedOfSound(atmo) },
    },
    maxDistanceM,
    sampleEveryM,
  )
  return points.map(({ distanceM, timeS, velocityMs, dropM }) => ({ distanceM, timeS, velocityMs, dropM }))
}

export function pointAt(traj: TrajectoryPoint[], distanceM: number): TrajectoryPoint {
  if (distanceM <= traj[0].distanceM) return traj[0]
  const last = traj[traj.length - 1]
  if (distanceM >= last.distanceM) return last
  let i = 1
  while (traj[i].distanceM < distanceM) i++
  const a = traj[i - 1]
  const b = traj[i]
  const f = (distanceM - a.distanceM) / (b.distanceM - a.distanceM)
  const lerp = (p: number, q: number) => p + (q - p) * f
  return {
    distanceM,
    timeS: lerp(a.timeS, b.timeS),
    velocityMs: lerp(a.velocityMs, b.velocityMs),
    dropM: lerp(a.dropM, b.dropM),
  }
}

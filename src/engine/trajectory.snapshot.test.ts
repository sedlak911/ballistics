import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/gzw-trajectories.json'
import { solveTrajectory, type TrajectoryPoint } from './trajectory'
import type { DragModel } from './drag'

// The GZW section must not drift. These were solved at e61f345 (bit-identical to 6ab853d) and are compared field for
// field with Object.is. If a change moves one on purpose, regenerate the fixture and say why in the commit.
// Every 50th metre to 1200 m; the inputs are in the fixture because the engine can't import from src/games/.
interface Case {
  name: string
  muzzleVelocityMs: number
  bc: number
  dragModel: string
  sightHeightM: number
  zeroM: number
  tempC: number
  altitudeM: number
  points: TrajectoryPoint[]
}

describe('frozen GZW trajectories', () => {
  for (const c of fixture as Case[]) {
    it(c.name, () => {
      const traj = solveTrajectory(
        {
          projectile: { muzzleVelocityMs: c.muzzleVelocityMs, bc: c.bc, dragModel: c.dragModel as DragModel },
          zeroM: c.zeroM,
          sightHeightM: c.sightHeightM,
          atmosphere: { tempC: c.tempC, altitudeM: c.altitudeM },
        },
        1200,
      )
      const got = traj.filter((p) => p.distanceM % 50 === 0)
      expect(got).toHaveLength(c.points.length)
      got.forEach((p, i) => {
        const want = c.points[i]
        for (const key of Object.keys(want) as (keyof TrajectoryPoint)[]) expect(p[key], `${key} at ${want.distanceM} m`).toBe(want[key])
      })
    })
  }
})

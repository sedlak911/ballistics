import { describe, expect, it } from 'vitest'
import { pointAt, solveTrajectory, type ShotSetup } from './trajectory'

const G = 9.80665

describe('solveTrajectory', () => {
  it('matches the closed-form solution when there is no drag', () => {
    const v = 800
    const h = 0.04
    const zero = 100
    const traj = solveTrajectory({ projectile: { muzzleVelocityMs: v, bc: Infinity, dragModel: 'G7' }, zeroM: zero, sightHeightM: h }, 400)

    // Solve the launch angle of the vacuum trajectory that crosses the line of sight at the zero distance.
    const y = (x: number, th: number) => x * Math.tan(th) - (G * x * x) / (2 * v * v * Math.cos(th) ** 2) - h
    let lo = 0
    let hi = 0.01
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2
      if (y(zero, mid) < 0) lo = mid
      else hi = mid
    }
    expect(pointAt(traj, 300).dropM).toBeCloseTo(y(300, lo), 3)
  })

  it('crosses the line of sight at the zero distance', () => {
    const traj = solveTrajectory({ projectile: { muzzleVelocityMs: 838, bc: 0.2, dragModel: 'G7' }, zeroM: 100, sightHeightM: 0.04 }, 300)
    expect(Math.abs(pointAt(traj, 100).dropM)).toBeLessThan(0.0005)
  })

  it('finds the zero for a subsonic round zeroed far out', () => {
    for (const muzzleVelocityMs of [276, 290]) {
      const traj = solveTrajectory({ projectile: { muzzleVelocityMs, bc: 0.09, dragModel: 'G7' }, zeroM: 1000, sightHeightM: 0.04 }, 1000)
      expect(Math.abs(pointAt(traj, 1000).dropM)).toBeLessThan(0.001)
    }
  })

  // Reference values from py-ballisticcalc 3.1.1 (https://github.com/o-murphy/py-ballisticcalc), computed 2026-10-30
  // with the same inputs: G7, sight height 4 cm, zero 100 m, 30 °C, 1013.25 hPa, sea level, 0 % humidity, no wind.
  const references: { name: string; setup: ShotSetup; at: [number, number, number][] }[] = [
    {
      name: 'M80 147 gr, G7 0.200, 838 m/s',
      setup: { projectile: { muzzleVelocityMs: 838, bc: 0.2, dragModel: 'G7' }, zeroM: 100, sightHeightM: 0.04 },
      at: [
        [300, -0.46, 629.8],
        [500, -1.926, 508.5],
        [800, -7.3151, 350.1],
      ],
    },
    {
      name: 'M855 62 gr, G7 0.151, 920 m/s',
      setup: { projectile: { muzzleVelocityMs: 920, bc: 0.151, dragModel: 'G7' }, zeroM: 100, sightHeightM: 0.04 },
      at: [
        [300, -0.4024, 635.9],
        [500, -1.8043, 476.9],
        [800, -7.7335, 314.7],
      ],
    },
  ]

  for (const r of references) {
    it(`matches the reference trajectory for ${r.name}`, () => {
      const traj = solveTrajectory(r.setup, 820)
      for (const [x, drop, vel] of r.at) {
        const p = pointAt(traj, x)
        expect(Math.abs(p.dropM - drop) / Math.abs(drop)).toBeLessThan(0.03)
        expect(Math.abs(p.velocityMs - vel) / vel).toBeLessThan(0.015)
      }
    })
  }

  it('stays finite for a slow, draggy round out to 1,000 m', () => {
    const traj = solveTrajectory({ projectile: { muzzleVelocityMs: 720, bc: 0.09, dragModel: 'G7' }, zeroM: 100, sightHeightM: 0.04 }, 1000)
    expect(traj.at(-1)!.distanceM).toBe(1000)
    for (let i = 0; i < traj.length; i++) {
      const p = traj[i]
      expect(Number.isFinite(p.dropM)).toBe(true)
      expect(Number.isFinite(p.velocityMs)).toBe(true)
      expect(p.velocityMs).toBeGreaterThan(0)
      if (i > 0) expect(p.timeS).toBeGreaterThan(traj[i - 1].timeS)
    }
  })

  it('samples every 5 m starting at the muzzle', () => {
    const traj = solveTrajectory({ projectile: { muzzleVelocityMs: 838, bc: 0.2, dragModel: 'G7' }, zeroM: 100, sightHeightM: 0.04 }, 50)
    expect(traj.map((p) => p.distanceM)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50])
    expect(traj[0].dropM).toBeCloseTo(-0.04, 6)
  })
})

describe('pointAt', () => {
  it('interpolates between samples and clamps to the range', () => {
    const traj = [
      { distanceM: 0, timeS: 0, velocityMs: 800, dropM: -0.04 },
      { distanceM: 10, timeS: 0.02, velocityMs: 790, dropM: -0.02 },
    ]
    expect(pointAt(traj, 5)).toEqual({ distanceM: 5, timeS: 0.01, velocityMs: 795, dropM: -0.03 })
    expect(pointAt(traj, 50).distanceM).toBe(10)
    expect(pointAt(traj, -5).distanceM).toBe(0)
  })
})

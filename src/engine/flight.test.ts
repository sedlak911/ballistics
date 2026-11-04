import { describe, expect, it } from 'vitest'
import { airAbove, airDensity, airState, ISA_SEA_LEVEL, speedOfSound } from './atmosphere'
import { dragCoefficient, type DragTable } from './drag'
import { boreAngle, flightAt, solveFlight, windFromClock, type FlightInput, type FlightPoint } from './flight'
import { pointAt, solveTrajectory } from './trajectory'

/** flightAt for a distance the test knows the bullet reaches. */
const reached = (points: FlightPoint[], distanceM: number): FlightPoint => flightAt(points, distanceM)!

// The research's examples (docs/superpowers/research/2026-10-31-irl-ballistics.md §6): ICAO sea level, 100 m zero, 45 mm optic.
const l338: FlightInput = {
  muzzleVelocityMs: 890,
  bc: 0.31,
  drag: 'G7',
  sightHeightM: 0.045,
  zeroM: 100,
  air: airState(ISA_SEA_LEVEL),
}
const ss109: FlightInput = { ...l338, muzzleVelocityMs: 885, bc: 0.151 }

const rad = (deg: number) => (deg * Math.PI) / 180

describe('solveFlight', () => {
  it('agrees with solveTrajectory when nothing 3D is set', () => {
    const atmosphere = { tempC: 15, altitudeM: 0 }
    const air = { densityKgM3: airDensity(atmosphere), speedOfSoundMs: speedOfSound(atmosphere) }
    const flight = solveFlight({ ...l338, air }, 1000)
    const traj = solveTrajectory(
      { projectile: { muzzleVelocityMs: 890, bc: 0.31, dragModel: 'G7' }, zeroM: 100, sightHeightM: 0.045, atmosphere },
      1000,
    )
    for (const x of [300, 600, 1000]) {
      const f = reached(flight, x)
      const t = pointAt(traj, x)
      expect(Math.abs(f.dropM - t.dropM)).toBeLessThan(1e-6)
      expect(Math.abs(f.timeS - t.timeS)).toBeLessThan(1e-9)
      expect(Math.abs(f.velocityMs - t.velocityMs)).toBeLessThan(1e-6)
      expect(f.windageM).toBe(0)
    }
  })

  it('a full crosswind drifts by the lag rule: W · (t − D/V0)', () => {
    const p = reached(solveFlight({ ...l338, wind: windFromClock(1, 9) }, 1000), 1000)
    // Within 1 mm; the solver matches to the micrometre.
    expect(Math.abs(p.windageM - 1 * (p.timeS - 1000 / 890))).toBeLessThan(0.001)
    // From 9 o'clock it blows to the right.
    expect(p.windageM).toBeGreaterThan(0)
  })

  it("wind from 3 o'clock drifts left by the same amount", () => {
    const right = reached(solveFlight({ ...l338, wind: windFromClock(1, 9) }, 1000), 1000).windageM
    const left = reached(solveFlight({ ...l338, wind: windFromClock(1, 3) }, 1000), 1000).windageM
    expect(left).toBeLessThan(0)
    expect(left).toBeCloseTo(-right, 6)
  })

  it('a 5 m/s headwind lowers the hit at 1000 m by about 7 cm', () => {
    // Research §6: −7.3 cm.
    const calm = reached(solveFlight(l338, 1000), 1000).dropM
    const head = reached(solveFlight({ ...l338, wind: windFromClock(5, 12) }, 1000), 1000).dropM
    expect(head - calm).toBeLessThan(-0.06)
    expect(head - calm).toBeGreaterThan(-0.09)
  })

  it("slope: at 1000 m, 15° uphill, the exact drop differs from the rifleman's rule by 12–22 cm", () => {
    // Research §6, which also thins the air with height: no correction +34 cm, the rifleman's rule −17 cm.
    const slope = rad(15)
    const uphill = { ...l338, lookAngleRad: slope, airAt: (dy: number) => airAbove(ISA_SEA_LEVEL, dy) }
    // Dialling the flat-range correction for a distance is zeroing at that distance on the flat range.
    const hit = (dialForM: number) => reached(solveFlight({ ...uphill, zeroM: dialForM }, 1000), 1000).dropM
    // The exact solution hits the target; the rifleman's rule dials for the horizontal distance and lands low.
    const rifleman = hit(1000 * Math.cos(slope))
    expect(rifleman).toBeLessThan(-0.12)
    expect(rifleman).toBeGreaterThan(-0.22)
    // Dialling for the slant range lands high.
    expect(hit(1000)).toBeGreaterThan(0.29)
    expect(hit(1000)).toBeLessThan(0.39)
  })

  it('reads the air along the path from airAt: thinner air uphill drops less', () => {
    const uphill = { ...l338, lookAngleRad: rad(15) }
    const still = reached(solveFlight(uphill, 1000), 1000).dropM
    const heights: number[] = []
    const thinning = reached(
      solveFlight({ ...uphill, airAt: (dy) => (heights.push(dy), airAbove(ISA_SEA_LEVEL, dy)) }, 1000),
      1000,
    ).dropM
    expect(Math.max(...heights)).toBeGreaterThan(250)
    expect(thinning).toBeGreaterThan(still)
  })

  it('a custom Cd table equal to G7 · (sd/bc) gives the same flight as G7', () => {
    // .338 LM 250 gr: sd = (250/7000 lb) / 0.338² in² (research §1.3). Every G7 breakpoint lies on a 0.025 Mach grid.
    const sd = 250 / 7000 / 0.338 ** 2
    const table: DragTable = Array.from({ length: 201 }, (_, i) => {
      const mach = i * 0.025
      return [mach, (dragCoefficient('G7', mach) * sd) / l338.bc] as const
    })
    const g7 = solveFlight(l338, 1000)
    const custom = solveFlight({ ...l338, drag: table, bc: sd }, 1000)
    for (const x of [300, 600, 1000]) {
      expect(reached(custom, x).dropM).toBeCloseTo(reached(g7, x).dropM, 6)
      expect(reached(custom, x).velocityMs).toBeCloseTo(reached(g7, x).velocityMs, 6)
    }
  })

  it('flies P1 5.56 (885 m/s, G7 0.151) to 2000 m without NaN, Mach falling', () => {
    const pts = solveFlight({ ...ss109 }, 2000, 100)
    expect(pts.at(-1)!.distanceM).toBe(2000)
    expect(pts.every((p) => Number.isFinite(p.dropM) && Number.isFinite(p.mach))).toBe(true)
    for (let i = 1; i < pts.length; i++) expect(pts[i].mach).toBeLessThan(pts[i - 1].mach)
    expect(pts.at(-1)!.mach).toBeLessThan(1)
  })
})

describe('windFromClock', () => {
  it('12 is a headwind, 6 a tailwind, 1 and 11 have half a crosswind', () => {
    expect(windFromClock(4, 12).x).toBeCloseTo(-4)
    expect(windFromClock(4, 6).x).toBeCloseTo(4)
    expect(Math.abs(windFromClock(4, 1).z)).toBeCloseTo(2)
    expect(Math.abs(windFromClock(4, 11).z)).toBeCloseTo(2)
    expect(windFromClock(4, 9).z).toBeCloseTo(4)
    expect(windFromClock(4, 3).z).toBeCloseTo(-4)
  })
})

describe('flightAt', () => {
  it('interpolates between samples and clamps below the first', () => {
    const pts = [
      { distanceM: 0, timeS: 0, velocityMs: 800, mach: 2.4, dropM: -0.04, windageM: 0 },
      { distanceM: 10, timeS: 0.02, velocityMs: 790, mach: 2.3, dropM: -0.02, windageM: 0.002 },
    ]
    const mid = flightAt(pts, 5)!
    expect(mid.timeS).toBeCloseTo(0.01, 12)
    expect(mid.velocityMs).toBeCloseTo(795, 12)
    expect(mid.mach).toBeCloseTo(2.35, 12)
    expect(mid.dropM).toBeCloseTo(-0.03, 12)
    expect(mid.windageM).toBeCloseTo(0.001, 12)
    expect(flightAt(pts, 10)!.distanceM).toBe(10)
    expect(flightAt(pts, -5)!.distanceM).toBe(0)
  })

  it('is null beyond the last sample: the bullet never got there', () => {
    const pts = [
      { distanceM: 0, timeS: 0, velocityMs: 800, mach: 2.4, dropM: -0.04, windageM: 0 },
      { distanceM: 10, timeS: 0.02, velocityMs: 790, mach: 2.3, dropM: -0.02, windageM: 0.002 },
    ]
    expect(flightAt(pts, 50)).toBeNull()
    expect(flightAt(pts, 10 + 1e-7)).not.toBeNull()
  })

  it('a slow custom round does not reach 2500 m; P2 in cold dense air does', () => {
    const slow: FlightInput = { ...l338, muzzleVelocityMs: 300, bc: 0.15, drag: 'G1' }
    expect(flightAt(solveFlight(slow, 2500), 2500)).toBeNull()
    // −20 °C, 1040 hPa: needs 14.5 s, which the old 15 s limit left 0.5 s of margin for.
    const air = airState({ tempC: -20, stationPressureHPa: 1040, humidityPct: 0 })
    const p2 = flightAt(solveFlight({ ...l338, muzzleVelocityMs: 800, air }, 2500), 2500)
    expect(p2?.distanceM).toBe(2500)
  })
})

describe('solveFlight: the last sample', () => {
  it('ends at exactly the requested distance when it is off the 5 m grid', () => {
    for (const d of [437, 1003, 1999]) {
      const grid = solveFlight(l338, d)
      const end = flightAt(grid, d)!
      const exact = solveFlight(l338, d, d).at(-1)!
      expect(grid.at(-1)!.distanceM).toBe(d)
      expect(end.distanceM).toBe(d)
      expect(Math.abs(end.dropM - exact.dropM)).toBeLessThan(1e-9)
    }
  })

  it('adds no extra sample when the end is on the grid', () => {
    const pts = solveFlight(l338, 1000)
    expect(pts).toHaveLength(201)
    expect(pts.at(-1)!.distanceM).toBe(1000)
  })
})

describe('boreAngle', () => {
  it('is what solveFlight launches at, and boreAngleRad overrides it', () => {
    const bore = boreAngle(l338)
    // 1.09 mrad above the line of sight for the research's .338 (§10).
    expect(bore).toBeGreaterThan(0.0009)
    expect(bore).toBeLessThan(0.0013)
    // Pinned to the bore of a 100 m zero, a 300 m zero's flight is the 100 m zero's.
    const pinned = solveFlight({ ...l338, zeroM: 300, boreAngleRad: bore }, 600)
    expect(reached(pinned, 600).dropM).toBe(reached(solveFlight(l338, 600), 600).dropM)
    // The whitelisted copy: the override can't leak into the zero.
    expect(boreAngle({ ...l338, boreAngleRad: 0.1 })).toBe(bore)
  })
})

describe('solveFlight: the earth', () => {
  const at1000 = (extra: Partial<FlightInput>) => reached(solveFlight({ ...l338, ...extra }, 1000), 1000)
  const north50 = (azimuthRad: number | null) => ({ coriolis: { latitudeRad: rad(50), azimuthRad } })

  it('Coriolis at 50° N drifts right about 8 cm at 1000 m, whatever the azimuth', () => {
    const without = at1000({}).windageM
    for (const azimuthRad of [null, 0, Math.PI / 2]) {
      const d = at1000(north50(azimuthRad)).windageM - without
      expect(d).toBeGreaterThan(0.07)
      expect(d).toBeLessThan(0.09)
    }
  })

  it('Eötvös: firing east is about 6.6 cm higher at 1000 m, west as much lower, north unchanged', () => {
    const without = at1000({}).dropM
    const east = at1000(north50(Math.PI / 2)).dropM - without
    const west = at1000(north50(-Math.PI / 2)).dropM - without
    const north = at1000(north50(0)).dropM - without
    expect(east).toBeGreaterThan(0.056)
    expect(east).toBeLessThan(0.076)
    expect(west).toBeCloseTo(-east, 2)
    expect(Math.abs(north)).toBeLessThan(0.002)
  })

  it('without an azimuth there is no vertical Coriolis', () => {
    expect(Math.abs(at1000(north50(null)).dropM - at1000({}).dropM)).toBeLessThan(0.002)
  })

  it('in the southern hemisphere Coriolis drifts left', () => {
    const d = at1000({ coriolis: { latitudeRad: rad(-50), azimuthRad: null } }).windageM - at1000({}).windageM
    expect(d).toBeLessThan(-0.07)
    expect(d).toBeGreaterThan(-0.09)
  })

  it("the earth's curvature moves the hit under 1 cm at 2000 m, but not zero", () => {
    const dropAt2000 = (extra: Partial<FlightInput>) => reached(solveFlight({ ...l338, ...extra }, 2000), 2000).dropM
    const d = Math.abs(dropAt2000({ earthCurvature: true }) - dropAt2000({}))
    expect(d).toBeLessThan(0.01)
    expect(d).toBeGreaterThan(0.0005)
  })
})

describe('wind by distance', () => {
  const l308: FlightInput = {
    muzzleVelocityMs: 790,
    bc: 0.243,
    drag: 'G7',
    sightHeightM: 0.045,
    zeroM: 100,
    air: airState(ISA_SEA_LEVEL),
  }
  const windageAt600 = (o: Partial<FlightInput>): number => reached(solveFlight({ ...l308, ...o }, 600), 600).windageM
  const full = { x: 0, z: 4 }
  const calm = { x: 0, z: 0 }
  const inThird = (lo: number, hi: number) => (xM: number) => (xM >= lo && xM < hi ? full : calm)

  it('equal winds in every zone are the constant wind', () => {
    const a = windageAt600({ windAt: () => windFromClock(4, 9) })
    const b = windageAt600({ wind: windFromClock(4, 9) })
    expect(Math.abs(a - b)).toBeLessThan(1e-9)
  })

  it('zone drifts add up', () => {
    const all = windageAt600({ windAt: () => full })
    const sum =
      windageAt600({ windAt: inThird(0, 200) }) +
      windageAt600({ windAt: inThird(200, 400) }) +
      windageAt600({ windAt: inThird(400, 600) })
    expect(Math.abs(sum - all) / all).toBeLessThan(0.005)
  })

  it('the near third carries about half the drift', () => {
    const share = windageAt600({ windAt: inThird(0, 200) }) / windageAt600({ windAt: () => full })
    expect(Math.abs(share - 0.48)).toBeLessThan(0.03)
  })

  it("a wind that turns doesn't cancel", () => {
    const turning = (xM: number) => ({ x: 0, z: xM < 200 ? 3 : xM < 400 ? 0 : -3 })
    const mrad = (windageAt600({ windAt: turning }) / 600) * 1000
    expect(mrad).toBeGreaterThan(0)
    expect(Math.abs(mrad - 0.38)).toBeLessThan(0.04)
  })

  it('replaces the constant wind', () => {
    const zones = (xM: number) => ({ x: xM < 300 ? -3 : 2, z: 4 })
    const a = solveFlight({ ...l308, wind: { x: 5, z: -2 }, windAt: zones }, 600)
    const b = solveFlight({ ...l308, windAt: zones }, 600)
    expect(a).toEqual(b)
  })
})

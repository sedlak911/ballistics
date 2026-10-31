import { describe, expect, it } from 'vitest'
import { M33_CD } from './__fixtures__/m33'
import { airState, ISA_SEA_LEVEL } from './atmosphere'
import { flightAt, type FlightPoint, solveFlight, trueMuzzleVelocity, windFromClock, type FlightInput } from './flight'

/** flightAt for a distance the test knows the bullet reaches. */
const reached = (points: FlightPoint[], distanceM: number): FlightPoint => flightAt(points, distanceM)!

const air = airState(ISA_SEA_LEVEL)

/** Elevation of the bullet's path below the line of sight at a distance, as an angle (small-angle: drop / distance). */
function elevationAt(input: FlightInput, distanceM: number): number {
  return -reached(solveFlight(input, distanceM, 10), distanceM).dropM / distanceM
}

const l338: FlightInput = { muzzleVelocityMs: 890, bc: 0.31, drag: 'G7', sightHeightM: 0.045, zeroM: 100, air }

describe('trueMuzzleVelocity', () => {
  it('truing recovers the MV that produced an observed dial', () => {
    const observed = elevationAt({ ...l338, muzzleVelocityMs: 900 }, 800)
    expect(trueMuzzleVelocity({ ...l338, muzzleVelocityMs: 880 }, 800, observed)).toBeCloseTo(900, 0)
  })

  it('refuses an observation 10× too large or 10× too small, not the bracket edge', () => {
    const observed = elevationAt(l338, 800)
    expect(trueMuzzleVelocity(l338, 800, observed * 10)).toBeNull()
    expect(trueMuzzleVelocity(l338, 800, observed / 10)).toBeNull()
  })

  it('refuses where the round is already transonic', () => {
    const far = 1900
    expect(reached(solveFlight(l338, far, far), far).mach).toBeLessThan(1.2)
    expect(trueMuzzleVelocity(l338, far, elevationAt(l338, far))).toBeNull()
  })

  it('refuses when the bracket does not reach the distance', () => {
    const slow: FlightInput = { ...l338, muzzleVelocityMs: 300, bc: 0.15, drag: 'G1' }
    expect(trueMuzzleVelocity(slow, 2500, 0.2)).toBeNull()
  })
})

// The Lapua .338 LM 250 gr Scenar table (research §2): 905 m/s, sight 40 mm, zero 100 m, ICAO, G7 0.322.
const LAPUA_DROP_MM: [number, number][] = [
  [300, -336],
  [600, -2164],
  [1000, -8274],
  [1200, -13721],
  [1500, -26585],
]

describe('Lapua .338 LM 250 gr Scenar table', () => {
  const lapua: FlightInput = { muzzleVelocityMs: 905, bc: 0.322, drag: 'G7', sightHeightM: 0.04, zeroM: 100, air }
  const points = solveFlight(lapua, 1500, 10)
  const mrad = (d: number, dropMm: number) => (Math.abs(reached(points, d).dropM * 1000 - dropMm) / d)

  it('stays within 0.1 mrad of the table to 1000 m', () => {
    for (const [d, drop] of LAPUA_DROP_MM.filter(([d]) => d <= 1000)) expect(mrad(d, drop), `${d} m`).toBeLessThan(0.1)
  })

  it('stays within 0.25 mrad of it at 1200 and 1500 m', () => {
    // Research measured 0.19 mrad at 1500 m.
    for (const [d, drop] of LAPUA_DROP_MM.filter(([d]) => d > 1000)) expect(mrad(d, drop), `${d} m`).toBeLessThan(0.25)
  })
})

// McCoy's M33 table (__fixtures__/m33.ts), shared with REAL's P9 test so the preset's copy can't drift from it.
const m33: FlightInput = { muzzleVelocityMs: 899, bc: 0.3564, drag: M33_CD, sightHeightM: 0.045, zeroM: 100, air }

describe('M33 on McCoy\'s Cd table', () => {
  it('crosses Mach 1 between 1440 and 1540 m at ICAO', () => {
    // Research §2: 1492 m.
    const points = solveFlight({ ...m33, sightHeightM: 0.04 }, 2000, 5)
    const crossing = points.find((p) => p.mach < 1)!
    expect(crossing.distanceM).toBeGreaterThan(1440)
    expect(crossing.distanceM).toBeLessThan(1540)
  })
})

// py-ballisticcalc 3.1.1 (https://github.com/o-murphy/py-ballisticcalc), computed 2026-10-31 in a scratch virtualenv
// (a dev-time tool, not a dependency) with the same inputs: ICAO 15 °C, 1013.25 hPa, 0 % humidity, sea level; sight
// height 45 mm, zero 100 m, 3 m/s from 9 o'clock (a full crosswind, drift to the right). The G7 cases use
// DragModel(bc, TableG7); M33 uses DragModel(0.3564, McCoy's table), whose BC is the sectional density in lb/in².
// Each row: [distance m, height above the line of sight m, windage m (+ right), Mach there].
const wind = windFromClock(3, 9)
const references: { name: string; input: FlightInput; at: [number, number, number, number][] }[] = [
  {
    name: 'M80, G7 0.200, 838 m/s',
    input: { muzzleVelocityMs: 838, bc: 0.2, drag: 'G7', sightHeightM: 0.045, zeroM: 100, air },
    at: [
      [1000, -15.2319, 2.8721, 0.873],
      [1500, -55.8692, 6.7288, 0.708],
      [2000, -139.8666, 11.9051, 0.584],
    ],
  },
  {
    name: '.338 LM, G7 0.310, 890 m/s',
    input: l338,
    at: [
      [1000, -8.8424, 1.3687, 1.325],
      [1500, -29.1651, 3.8011, 0.916],
      [2000, -74.1145, 7.3223, 0.794],
    ],
  },
  {
    name: 'M33 on McCoy\'s table, 899 m/s',
    input: m33,
    at: [
      [1000, -8.2853, 1.2245, 1.421],
      [1500, -26.1916, 3.2818, 0.999],
      [2000, -64.9226, 6.4814, 0.849],
    ],
  },
]

describe('py-ballisticcalc references to 2000 m', () => {
  for (const r of references) {
    it(`matches ${r.name}`, () => {
      const points = solveFlight({ ...r.input, wind }, 2000, 10)
      for (const [d, height, windage, mach] of r.at) {
        const p = reached(points, d)
        // 0.1 mrad down to Mach 1.2, 0.3 mrad beyond.
        const tolMrad = mach >= 1.2 ? 0.1 : 0.3
        expect((Math.abs(p.dropM - height) / d) * 1000, `${d} m drop`).toBeLessThan(tolMrad)
        expect((Math.abs(p.windageM - windage) / d) * 1000, `${d} m windage`).toBeLessThan(tolMrad)
      }
    })
  }
})

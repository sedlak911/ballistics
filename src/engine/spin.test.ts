import { describe, expect, it } from 'vitest'
import { airState, ISA_SEA_LEVEL } from './atmosphere'
import { flightAt, solveFlight, type FlightInput, type FlightPoint } from './flight'
import { aeroJumpRad, millerSg, muzzleVelocityAt, spinDriftM } from './spin'
import { angleFromRad } from './units'

/** flightAt for a distance the test knows the bullet reaches. */
const reached = (points: FlightPoint[], distanceM: number): FlightPoint => flightAt(points, distanceM)!

const l338Bullet = { massGr: 250, diameterIn: 0.338, lengthIn: 1.551 }
const l338: FlightInput = {
  muzzleVelocityMs: 890,
  bc: 0.31,
  drag: 'G7',
  sightHeightM: 0.045,
  zeroM: 100,
  air: airState(ISA_SEA_LEVEL),
}

describe('millerSg', () => {
  it('Sg of .338 LM 250 gr Scenar in a 1:12" barrel is about 1.54', () =>
    expect(millerSg(l338Bullet, 12, 890, 15, 1013.25)).toBeCloseTo(1.54, 2))
  it('Sg of the same bullet in a 1:9.35" barrel at 900 m/s is about 2.55 (preset P7)', () =>
    expect(millerSg(l338Bullet, 9.35, 900, 15, 1013.25)).toBeCloseTo(2.55, 2))
  it('below Mach 1 the velocity term uses the speed of sound', () =>
    expect(millerSg(l338Bullet, 12, 200, 15, 1013.25)).toBeCloseTo(millerSg(l338Bullet, 12, 340.3, 15, 1013.25), 3))
})

describe('spinDriftM', () => {
  it('spin drift at 1.58 s with Sg 1.54 is 20 cm right, left for a left twist', () => {
    expect(spinDriftM(1.54, 1.58, 'right')).toBeCloseTo(0.201, 3)
    expect(spinDriftM(1.54, 1.58, 'left')).toBeCloseTo(-0.201, 3)
  })
  it('crosswind 0: spin drift alone still moves the hit right', () => {
    const p = reached(solveFlight(l338, 1000), 1000)
    const sg = millerSg(l338Bullet, 12, 890, 15, 1013.25)
    const hit = p.windageM + spinDriftM(sg, p.timeS, 'right')
    expect(hit).toBeGreaterThan(p.windageM)
    expect(hit).toBeGreaterThan(0)
  })
})

describe('aeroJumpRad', () => {
  const lengthCal = 1.551 / 0.338
  it('wind blowing right lowers a right-twist hit by 0.02–0.03 mrad per m/s', () => {
    const mradPerMs = angleFromRad(aeroJumpRad(1.75, lengthCal, 1, 'right'), 'mil')
    expect(mradPerMs).toBeLessThan(0)
    expect(Math.abs(mradPerMs)).toBeGreaterThan(0.02)
    expect(Math.abs(mradPerMs)).toBeLessThan(0.03)
  })
  it('wind blowing left raises it, and a left twist flips the sign', () => {
    expect(aeroJumpRad(1.75, lengthCal, -1, 'right')).toBeGreaterThan(0)
    expect(aeroJumpRad(1.75, lengthCal, 1, 'left')).toBeGreaterThan(0)
    expect(aeroJumpRad(1.75, lengthCal, 0, 'right')).toBeCloseTo(0, 12)
  })
})

describe('muzzleVelocityAt', () => {
  it('MV 890 m/s measured at 21 °C is 885.2 m/s with powder at 5 °C and 0.3 m/s/°C', () =>
    expect(muzzleVelocityAt(890, 21, 5, 0.3)).toBeCloseTo(885.2, 1))
})

import { describe, expect, it } from 'vitest'
import { airState, ISA_SEA_LEVEL } from './atmosphere'
import { dominantSource, errorBudget, groupSizeM, hitChanceCircle, sensitivities, type BudgetInput } from './budget'
import { boreAngle, type FlightInput } from './flight'

// The research's .338 LM example (docs/superpowers/research/2026-10-31-irl-ballistics.md §7.3).
const l338: FlightInput = {
  muzzleVelocityMs: 890,
  bc: 0.31,
  drag: 'G7',
  sightHeightM: 0.045,
  zeroM: 100,
  air: airState(ISA_SEA_LEVEL),
}

const base = (o: Partial<BudgetInput> = {}): BudgetInput => ({
  distanceM: 1000,
  rifleMoa: 1,
  groupShots: 3,
  mvSdMs: 4,
  bcSdPct: 1,
  windSigmaMs: 1,
  holdSigmaMrad: 0,
  sens: sensitivities(l338, 1000)!,
  ...o,
})

describe('hitChanceCircle', () => {
  it('a spread far narrower than the target step still hits at 25 m on a 100 cm target', () =>
    expect(hitChanceCircle(0.0033, 0.0033, 0.5)).toBeGreaterThan(0.999))
  it('the 50 cm target at 1000 m is about 30 %', () => {
    const b = errorBudget(base())
    expect(hitChanceCircle(b.sigmaX, b.sigmaY, 0.25)).toBeCloseTo(0.303, 2)
  })
  it('a circular normal hits a disc of radius σ with 1 − e^(−1/2)', () =>
    expect(hitChanceCircle(0.1, 0.1, 0.1)).toBeCloseTo(0.3935, 3))
  it('no spread always hits', () => expect(hitChanceCircle(0, 0, 0.25)).toBe(1))
  it('no spread on one axis reduces to the other axis fitting the chord', () =>
    expect(hitChanceCircle(0, 0.1, 0.1)).toBeCloseTo(2 * 0.8413447 - 1, 3))
})

describe('sensitivities', () => {
  it('keeps the bore of the real zero: a 600 m zero does not hide the MV spread', () => {
    // Re-solving the zero for MV + 1 m/s gave 1.36 cm per m/s at 1000 m; the fixed bore gives 2.52.
    for (const zeroM of [100, 300, 600]) expect(sensitivities({ ...l338, zeroM }, 1000)!.mvM).toBeCloseTo(0.02516, 3)
  })

  it('keeps a given bore instead of solving the zero again', () => {
    const far = boreAngle({ ...l338, zeroM: 1000 })
    expect(sensitivities({ ...l338, boreAngleRad: far }, 1000)).toEqual(sensitivities({ ...l338, zeroM: 1000 }, 1000))
    expect(sensitivities({ ...l338, boreAngleRad: far }, 1000)).not.toEqual(sensitivities(l338, 1000))
  })

  it('is null when the bullet does not reach the distance', () => {
    expect(sensitivities({ ...l338, muzzleVelocityMs: 300, bc: 0.15, drag: 'G1' }, 2500)).toBeNull()
  })

  it('are non-negative magnitudes', () => {
    const s = sensitivities(l338, 1000)!
    expect(s.mvM).toBeGreaterThan(0.02)
    expect(s.bcM).toBeGreaterThan(0.03)
    expect(s.windM).toBeGreaterThan(0.4)
  })
})

describe('sensitivities with wind-independent drift', () => {
  it('windM ignores Coriolis drift', () => {
    const plain = sensitivities(l338, 1000)!.windM
    const withCoriolis = sensitivities({ ...l338, coriolis: { latitudeRad: (50 * Math.PI) / 180, azimuthRad: null } }, 1000)!.windM
    expect(Math.abs(withCoriolis - plain)).toBeLessThan(0.005)
    expect(withCoriolis).toBeCloseTo(0.456, 2)
  })
})

describe('errorBudget', () => {
  it('reproduces the research budget for .338 LM at 1000 m without range error', () => {
    // rifle 1 MOA (3 shots) 12.1 cm per axis, MV SD 4 m/s 10.1 cm, BC 1 % 5.6 cm, wind 1 m/s 45.6 cm
    const b = errorBudget(base())
    expect(Math.abs(b.sigmaY - 0.167)).toBeLessThan(0.002)
    expect(b.sigmaX).toBeCloseTo(0.472, 1)
    expect(b.x.rifle).toBeCloseTo(0.121, 2)
    // 10.1 cm is the fixed-bore figure (2.516 cm per m/s · 4): shot-to-shot spread doesn't re-zero the rifle.
    expect(Math.abs(b.y.mv! - 0.101)).toBeLessThan(0.002)
    expect(b.y.bc).toBeCloseTo(0.056, 2)
    expect(b.x.wind).toBeCloseTo(0.456, 2)
  })

  it('wind dominates the horizontal at 1000 m', () => expect(dominantSource(errorBudget(base()), 0.25)).toBe('wind'))

  it('an unknown MOA or MV SD leaves that source out, not zero-crashing', () => {
    const b = errorBudget(base({ rifleMoa: null, mvSdMs: null }))
    expect('rifle' in b.x).toBe(false)
    expect('rifle' in b.y).toBe(false)
    expect('mv' in b.y).toBe(false)
    expect(Number.isFinite(b.sigmaX)).toBe(true)
    expect(Number.isFinite(b.sigmaY)).toBe(true)
  })

  it('hold adds on both axes', () => {
    const b = errorBudget(base({ holdSigmaMrad: 0.3 }))
    expect(b.x.hold).toBeCloseTo(0.3, 6)
    expect(b.y.hold).toBeCloseTo(0.3, 6)
  })
})

describe('dominantSource', () => {
  it('is null when nothing gains', () => {
    const b = errorBudget(base({ rifleMoa: null, mvSdMs: null, bcSdPct: 0, windSigmaMs: 0 }))
    expect(dominantSource(b, 0.25)).toBeNull()
  })
})

describe('groupSizeM', () => {
  it('the group of a 1 MOA rifle at 1000 m without MV SD is about 29 cm wide', () => {
    const g = groupSizeM(base({ mvSdMs: null }))!
    expect(g.widthM).toBeCloseTo(0.291, 2)
    expect(g.heightM).toBeCloseTo(0.291, 2)
  })
  it('MV SD makes it taller', () => {
    const g = groupSizeM(base())!
    expect(g.heightM).toBeGreaterThan(g.widthM)
  })
  it('is null for an unknown MOA', () => expect(groupSizeM(base({ rifleMoa: null }))).toBeNull())
})

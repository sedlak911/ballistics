import { describe, expect, it } from 'vitest'
import { dominantSource, errorSources, hitProbability, normalCdf, spreadSigma, type ErrorSources, type Zone } from './hitChance'
import { pointAt, solveTrajectory } from './trajectory'

const none: ErrorSources = { weaponM: 0, holdM: 0, distanceXM: 0, distanceYM: 0, leadM: 0 }
// Zone sizes belong to a game; these are only test shapes.
const ZONES = { head: { widthM: 0.16, heightM: 0.21 }, chest: { widthM: 0.32, heightM: 0.42 } } satisfies Record<string, Zone>
const m80 = solveTrajectory({ projectile: { muzzleVelocityMs: 838, bc: 0.2, dragModel: 'G7' }, zeroM: 100, sightHeightM: 0.04 }, 1000)

describe('normalCdf', () => {
  it('matches the standard normal table', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4)
    expect(normalCdf(-1) + normalCdf(1)).toBeCloseTo(1, 7)
  })
})

describe('hitProbability', () => {
  it('is exactly 1 with no error at all', () => {
    expect(hitProbability(ZONES.head, none)).toBe(1)
  })

  it('multiplies the per-axis chances of landing inside the zone', () => {
    const p = hitProbability(ZONES.head, { ...none, holdM: 0.05 })
    expect(p).toBeCloseTo((2 * normalCdf(0.08 / 0.05) - 1) * (2 * normalCdf(0.105 / 0.05) - 1), 6)
  })

  it('rises as the errors shrink and is higher for the chest than the head', () => {
    const wide = hitProbability(ZONES.head, { ...none, holdM: 0.2 })
    const tight = hitProbability(ZONES.head, { ...none, holdM: 0.05 })
    expect(tight).toBeGreaterThan(wide)
    expect(hitProbability(ZONES.chest, { ...none, holdM: 0.2 })).toBeGreaterThan(wide)
  })
})

describe('spreadSigma', () => {
  it('combines the errors per axis', () => {
    const s = spreadSigma({ ...none, weaponM: 0.03, holdM: 0.04 })
    expect(s.x).toBeCloseTo(0.05, 9)
    expect(s.y).toBeCloseTo(0.05, 9)
    const moving = spreadSigma({ ...none, weaponM: 0.03, holdM: 0.04, leadM: 0.12 })
    expect(moving.x).toBeCloseTo(0.13, 9)
    expect(moving.y).toBeCloseTo(0.05, 9)
  })
})

describe('dominantSource', () => {
  it('names the error whose removal raises the hit chance most', () => {
    expect(dominantSource(ZONES.head, { ...none, leadM: 0.3, holdM: 0.1 })).toBe('lead')
    expect(dominantSource(ZONES.head, { ...none, distanceXM: 0.05, distanceYM: 0.15, holdM: 0.06 })).toBe('distance')
    expect(dominantSource(ZONES.head, { ...none, weaponM: 0.05 })).toBe('weapon')
  })

  it('names the only error there is', () => {
    expect(dominantSource(ZONES.head, { ...none, holdM: 0.1 })).toBe('hold')
    expect(dominantSource(ZONES.head, { ...none, leadM: 0.1 })).toBe('lead')
  })

  it('never names weapon accuracy when it adds nothing (unknown accuracy counts as zero)', () => {
    for (const e of [
      { ...none, holdM: 0.001 },
      { ...none, holdM: 0.004, distanceYM: 0.004 },
      { ...none, holdM: 0.05, distanceXM: 0.05, distanceYM: 0.05, leadM: 0.05 },
      { ...none, holdM: 5, distanceYM: 5, leadM: 5 },
    ]) expect(dominantSource(ZONES.head, e)).not.toBe('weapon')
  })

  it('names nothing when no error costs a meaningful chance', () => {
    expect(dominantSource(ZONES.head, none)).toBeNull()
    // Removing any of these would not move the rounded percentage.
    expect(dominantSource(ZONES.head, { ...none, holdM: 0.001 })).toBeNull()
    expect(dominantSource(ZONES.chest, { ...none, weaponM: 0.02, holdM: 0.02 })).toBeNull()
  })

  it('counts weapon and hold error on both axes', () => {
    // 0.12 m of hold on both axes costs more than 0.1 m of distance error on each.
    expect(dominantSource(ZONES.head, { ...none, distanceXM: 0.1, distanceYM: 0.1, holdM: 0.12 })).toBe('hold')
  })
})

describe('errorSources', () => {
  const base = { accuracyMoa: 1, steadinessMil: 0.25, rangeSigmaPct: 10, crossingSpeedMs: 5.5 }

  it('turns weapon MOA, steadiness and lead into metres at the target', () => {
    const e = errorSources(m80, 400, base)
    const groupM = 2 * 400 * Math.tan(((1 / 60) * Math.PI) / 180 / 2)
    expect(e.weaponM).toBeCloseTo(groupM / 4, 3)
    expect(e.holdM).toBeCloseTo(0.1, 6)
    expect(e.leadM).toBeCloseTo(0.3 * 5.5 * pointAt(m80, 400).timeS, 6)
  })

  it('grows the distance error with the distance uncertainty', () => {
    const loose = errorSources(m80, 400, { ...base, rangeSigmaPct: 20 })
    const tight = errorSources(m80, 400, { ...base, rangeSigmaPct: 3 })
    expect(loose.distanceYM).toBeGreaterThan(tight.distanceYM)
    expect(loose.distanceXM).toBeGreaterThan(tight.distanceXM)
    expect(tight.distanceYM).toBeGreaterThan(0)
  })

  it('is all zeros, and finite, with nothing uncertain', () => {
    const e = errorSources(m80, 400, { accuracyMoa: null, steadinessMil: 0, rangeSigmaPct: 0, crossingSpeedMs: 0 })
    expect(e).toEqual(none)
    expect(hitProbability(ZONES.head, e)).toBe(1)
  })

  it('stays finite at the ends of the trajectory', () => {
    for (const d of [25, 1000]) {
      const e = errorSources(m80, d, { ...base, rangeSigmaPct: 50 })
      for (const v of Object.values(e)) expect(Number.isFinite(v)).toBe(true)
    }
  })
})

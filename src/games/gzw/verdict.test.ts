import { describe, expect, it } from 'vitest'
import { errorSources, hitProbability } from '../../engine/hitChance'
import { solveTrajectory, type ShotSetup } from '../../engine/trajectory'
import { DISTANCE_M } from './ranging'
import { SOLVE_TO_M, verdictFor } from './verdict'

const m80Setup: ShotSetup = { projectile: { muzzleVelocityMs: 838, bc: 0.2, dragModel: 'G7' }, zeroM: 100, sightHeightM: 0.04 }
const m80 = solveTrajectory(m80Setup, 1000)
const calm = { accuracyMoa: 1, steadinessMil: 0.1, rangeSigmaPct: 3, crossingSpeedMs: 0, zone: 'head' as const, posture: 'standing' as const }

describe('verdictFor', () => {
  it('says shoot at a standing head at 100 m', () => {
    const v = verdictFor(m80, 100, calm)
    expect(v.verdict).toBe('shoot')
    expect(v.head).toBeGreaterThan(0.9)
    expect(v.chest).toBeGreaterThanOrEqual(v.head)
    expect(v.closeInM).toBeNull()
  })

  it('says to close in on a sprinting head at 300 m, and the lead is what hurts', () => {
    const v = verdictFor(m80, 300, { ...calm, steadinessMil: 0.25, rangeSigmaPct: 10, crossingSpeedMs: 5.5 })
    expect(v.head).toBeLessThan(0.25)
    expect(v.verdict).toBe('closeIn')
    expect(v.closeInM).toBeGreaterThanOrEqual(25)
    expect(v.closeInM).toBeLessThan(300)
    expect(v.dominant).toBe('lead')
  })

  it('reports the spread at the current distance', () => {
    const v = verdictFor(m80, 300, { ...calm, steadinessMil: 0.25, rangeSigmaPct: 10, crossingSpeedMs: 5.5 })
    expect(v.sigmaM.y).toBeGreaterThan(0)
    expect(v.sigmaM.x).toBeGreaterThan(v.sigmaM.y)
  })

  it('judges by the chest when that is the aim zone', () => {
    const v = verdictFor(m80, 300, { ...calm, steadinessMil: 0.25, rangeSigmaPct: 10, crossingSpeedMs: 3, zone: 'chest' })
    const head = verdictFor(m80, 300, { ...calm, steadinessMil: 0.25, rangeSigmaPct: 10, crossingSpeedMs: 3 })
    expect(v.chest).toBe(head.chest)
    expect(['shoot', 'risky', 'closeIn']).toContain(v.verdict)
    expect(v.verdict === 'shoot' ? v.chest >= 0.5 : v.chest < 0.5).toBe(true)
  })

  it('says no good when not even 25 m reaches 50 %', () => {
    const v = verdictFor(m80, 200, { ...calm, steadinessMil: 10 })
    expect(v.verdict).toBe('noGood')
    expect(v.closeInM).toBeNull()
  })

  it('lists closer distances in 5 m steps, descending, never under 25 m', () => {
    expect(verdictFor(m80, 300, calm).closer.map((c) => c.distanceM)).toEqual([225, 150, 75])
    expect(verdictFor(m80, 50, calm).closer.map((c) => c.distanceM)).toEqual([40, 25])
    for (const c of verdictFor(m80, 437, calm).closer) {
      expect(c.distanceM % 5).toBe(0)
      expect(c.head).toBeGreaterThanOrEqual(0)
      expect(c.head).toBeLessThanOrEqual(1)
    }
  })
})

describe('verdictFor by the target\'s posture', () => {
  // The default M700 with M80A1 off the 22" barrel (835 m/s, G7 0.200, 0.63 MOA), a kneeling shooter, ±10 %.
  const m700 = solveTrajectory({ ...m80Setup, projectile: { ...m80Setup.projectile, muzzleVelocityMs: 835 } }, SOLVE_TO_M)
  const still = { accuracyMoa: 0.63, steadinessMil: 0.25, rangeSigmaPct: 10, crossingSpeedMs: 0, zone: 'chest' as const }

  it('gives a prone chest at 400 m a clearly lower chance than a standing one', () => {
    const standing = verdictFor(m700, 400, { ...still, posture: 'standing' })
    const prone = verdictFor(m700, 400, { ...still, posture: 'prone' })
    expect(standing.chest).toBeCloseTo(0.6, 1)
    expect(prone.chest).toBeCloseTo(0.31, 1)
    expect(prone.chest).toBeLessThan(standing.chest * 0.6)
    expect(prone.head).toBeLessThan(standing.head)
  })

  it('keeps the head of a kneeling target as it is standing, and shortens the chest', () => {
    const standing = verdictFor(m700, 400, { ...still, posture: 'standing' })
    const kneeling = verdictFor(m700, 400, { ...still, posture: 'kneeling' })
    expect(kneeling.head).toBe(standing.head)
    expect(kneeling.chest).toBeLessThan(standing.chest)
    expect(kneeling.chest).toBeGreaterThan(verdictFor(m700, 400, { ...still, posture: 'prone' }).chest)
  })

  it('gives a standing target the same chances as before postures counted', () => {
    const o = { ...calm, steadinessMil: 0.25, rangeSigmaPct: 10, crossingSpeedMs: 3 }
    for (const d of [100, 300, 600]) {
      const v = verdictFor(m80, d, o)
      const e = errorSources(m80, d, o)
      expect(v.head).toBe(hitProbability({ widthM: 0.16, heightM: 0.21 }, e))
      expect(v.chest).toBe(hitProbability({ widthM: 0.32, heightM: 0.42 }, e))
    }
  })

  it('names the biggest error for the zone the posture leaves', () => {
    // A low, wide prone chest suffers the vertical distance error most; the tall standing chest, the hold.
    const o = { ...calm, steadinessMil: 0.25, rangeSigmaPct: 10, zone: 'chest' as const }
    expect(verdictFor(m80, 300, o).dominant).toBe('hold')
    expect(verdictFor(m80, 300, { ...o, posture: 'prone' }).dominant).toBe('distance')
  })

  it('judges by the posture\'s zone: a prone chest can say close in where a standing one says shoot', () => {
    expect(verdictFor(m700, 400, { ...still, posture: 'standing' }).verdict).toBe('shoot')
    expect(verdictFor(m700, 400, { ...still, posture: 'prone' }).verdict).not.toBe('shoot')
  })
})

describe('SOLVE_TO_M', () => {
  const loose = { accuracyMoa: 1, steadinessMil: 0.25, rangeSigmaPct: 20, crossingSpeedMs: 5.5 }
  const twoSided = errorSources(solveTrajectory(m80Setup, 1500), DISTANCE_M.max, loose)

  it('solves far enough that the distance error at the farthest distance sees both sides of it', () => {
    const e = errorSources(solveTrajectory(m80Setup, SOLVE_TO_M), DISTANCE_M.max, loose)
    expect(Math.abs(e.distanceYM / twoSided.distanceYM - 1)).toBeLessThan(0.02)
    expect(Math.abs(e.distanceXM / twoSided.distanceXM - 1)).toBeLessThan(0.02)
  })

  it('is needed: a table that stops at the farthest distance understates the error there', () => {
    const cut = errorSources(solveTrajectory(m80Setup, DISTANCE_M.max), DISTANCE_M.max, loose)
    expect(cut.distanceYM).toBeLessThan(twoSided.distanceYM * 0.98)
  })
})

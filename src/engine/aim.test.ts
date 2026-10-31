import { describe, expect, it } from 'vitest'
import { aimSolution, crossingSpeedMs, effectiveMoa, suggestedZero } from './aim'
import type { TrajectoryPoint } from './trajectory'

// Two-point synthetic trajectory: exact values at the sampled distance.
const at = (distanceM: number, dropM: number, timeS: number): TrajectoryPoint[] => [
  { distanceM: 0, timeS: 0, velocityMs: 800, dropM: -0.04 },
  { distanceM, timeS, velocityMs: 500, dropM },
]

describe('aimSolution', () => {
  it('holds over by the angle of the drop', () => {
    const s = aimSolution(at(500, -1.0, 0.8), 500, { movement: 'standing', crossing: 90, unit: 'mil', accuracyMoa: null })
    expect(s.holdover).toBeCloseTo(2.0, 2)
    expect(s.holdoverLinearM).toBeCloseTo(1.0, 6)
    expect(s.lead).toBe(0)
    expect(s.timeOfFlightS).toBeCloseTo(0.8, 6)
    expect(s.velocityMs).toBeCloseTo(500, 6)
  })

  it('leads a sprinting target by speed × time of flight', () => {
    const s = aimSolution(at(500, -1.0, 0.8), 500, { movement: 'sprinting', crossing: 90, unit: 'mil', accuracyMoa: null })
    expect(s.leadLinearM).toBeCloseTo(4.4, 6)
    expect(s.lead).toBeCloseTo(8.8, 2)
  })

  it('leads less when the target crosses at 45°', () => {
    const s = aimSolution(at(500, -1.0, 0.8), 500, { movement: 'sprinting', crossing: 45, unit: 'mil', accuracyMoa: null })
    expect(s.leadLinearM).toBeCloseTo(3.124, 6)
  })

  it('holds under when the target is closer than the zero', () => {
    const s = aimSolution(at(80, 0.05, 0.1), 80, { movement: 'standing', crossing: 90, unit: 'mil', accuracyMoa: null })
    expect(s.holdover).toBeLessThan(0)
    expect(s.holdoverLinearM).toBeLessThan(0)
  })

  it('sizes the group from the MOA accuracy', () => {
    const s = aimSolution(at(400, -0.5, 0.5), 400, { movement: 'standing', crossing: 90, unit: 'moa', accuracyMoa: 1 })
    expect(s.groupDiameterM).toBeCloseTo(0.1164, 3)
  })

  it('reports an unknown group when accuracy is unknown', () => {
    const s = aimSolution(at(400, -0.5, 0.5), 400, { movement: 'standing', crossing: 90, unit: 'mil', accuracyMoa: null })
    expect(s.groupDiameterM).toBeNull()
  })
})

describe('crossingSpeedMs', () => {
  it('is the target speed across the line of fire', () => {
    expect(crossingSpeedMs('sprinting', 90)).toBe(5.5)
    expect(crossingSpeedMs('sprinting', 45)).toBeCloseTo(3.905, 6)
    expect(crossingSpeedMs('standing', 90)).toBe(0)
  })
})

describe('effectiveMoa', () => {
  it('applies the ammo modifier, positive meaning a tighter group', () => {
    expect(effectiveMoa(0.61, -3)).toBeCloseTo(0.6283, 4)
    expect(effectiveMoa(2, 10)).toBeCloseTo(1.8, 6)
  })

  it('passes unknowns through', () => {
    expect(effectiveMoa(null, 5)).toBeNull()
    expect(effectiveMoa(2, null)).toBe(2)
  })
})

describe('suggestedZero', () => {
  const zero = { minM: 50, maxM: 1000, stepM: 50 }
  it('rounds to the nearest step within the scope limit', () => {
    expect(suggestedZero(412, zero)).toBe(400)
    expect(suggestedZero(170, zero)).toBe(150)
    expect(suggestedZero(412, { ...zero, maxM: 300 })).toBeNull()
  })

  it('never suggests less than the lowest zero', () => {
    expect(suggestedZero(60, { ...zero, minM: 100 })).toBe(100)
  })
})

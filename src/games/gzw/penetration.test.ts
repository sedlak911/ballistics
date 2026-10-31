import { describe, expect, it } from 'vitest'
import { gzw } from './data'
import { deriveFromStoppedBy, energyShift, ratingsFor, topPenetratedClass } from './penetration'
import type { GzwAmmo } from './types'

const ammo = (over: Partial<GzwAmmo>): GzwAmmo => ({
  id: 'x', name: 'X', caliber: 'c', muzzleVelocityMs: 800, accuracyModifierPct: null,
  stoppedBy: null, chart: null, soldBy: null, ...over,
})

describe('deriveFromStoppedBy', () => {
  it('rates the stopping class magdump only, lower classes penetrable, higher pointless', () => {
    expect(deriveFromStoppedBy('NIJ III')).toEqual([2, 2, 2, 2, 2, 1, 0, 0])
  })

  it('handles the ends of the scale', () => {
    expect(deriveFromStoppedBy('NIJ 0')).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(deriveFromStoppedBy('NIJ IV')).toEqual([2, 2, 2, 2, 2, 2, 2, 2])
    expect(deriveFromStoppedBy(null)).toBeNull()
  })
})

describe('energyShift', () => {
  it('counts armor one class tougher below 75 % of the muzzle energy, two below 50 %', () => {
    expect([0.8, 0.75, 0.6, 0.5, 0.49].map(energyShift)).toEqual([0, 0, 1, 1, 2])
  })
})

describe('ratingsFor at range', () => {
  it('rates each class as the next tougher one, per class of shift', () => {
    const a = ammo({ chart: [2, 2, 2, 2, 2, 1, 0, 0], stoppedBy: 'NIJ III' })
    expect(ratingsFor(a, 1).ratings).toEqual([2, 2, 2, 2, 1, 0, 0, 0])
    expect(ratingsFor(a, 2).ratings).toEqual([2, 2, 2, 1, 0, 0, 0, 0])
    expect(ratingsFor(a, 0).ratings).toEqual([2, 2, 2, 2, 2, 1, 0, 0])
  })

  it('treats class IV as magdump only for a round that only IV stops, and anything past IV as pointless', () => {
    const a = ammo({ chart: [2, 2, 2, 2, 2, 2, 2, 2], stoppedBy: 'NIJ IV' })
    expect(ratingsFor(a, 1).ratings[7]).toBe(1)
    expect(ratingsFor(a, 2).ratings[7]).toBe(0)
  })

  it('guesses class IV one step below III++ when nothing says what stops the round', () => {
    const a = ammo({ chart: [2, 2, 2, 2, 2, 2, 2, 2], stoppedBy: null })
    expect(ratingsFor(a, 1).ratings[7]).toBe(1)
  })
})

describe('ratingsFor', () => {
  it('uses the chart when it agrees with stopped_by', () => {
    const r = ratingsFor(ammo({ chart: [2, 2, 2, 2, 2, 1, 0, 0], stoppedBy: 'NIJ III' }))
    expect(r.source).toBe('chart')
    expect(r.ratings).toEqual([2, 2, 2, 2, 2, 1, 0, 0])
    expect(r.disagree.some(Boolean)).toBe(false)
  })

  it('takes the worse rating and flags the cell when sources disagree', () => {
    const r = ratingsFor(ammo({ chart: [2, 2, 2, 2, 2, 2, 2, 0], stoppedBy: 'NIJ III+' }))
    expect(r.ratings).toEqual([2, 2, 2, 2, 2, 2, 1, 0])
    expect(r.disagree[6]).toBe(true)
    expect(r.disagree.filter(Boolean)).toHaveLength(1)
  })

  it('derives from stopped_by when the chart lacks the round', () => {
    expect(ratingsFor(ammo({ stoppedBy: 'NIJ IIIA' })).source).toBe('derived')
  })

  it('treats a round with no data as pointless', () => {
    const r = ratingsFor(ammo({}))
    expect(r.source).toBe('none')
    expect(r.ratings).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('finds no disagreements in the current data snapshot', () => {
    const flagged = gzw.ammo.filter((a) => ratingsFor(a).disagree.some(Boolean)).map((a) => a.name)
    expect(flagged).toEqual([])
  })
})

describe('topPenetratedClass', () => {
  it('names the toughest class a round usually penetrates', () => {
    expect(topPenetratedClass([2, 2, 2, 1, 0, 0, 0, 0])).toBe(2)
    expect(topPenetratedClass([2, 2, 2, 2, 2, 2, 2, 2])).toBe(7)
  })

  it('gives null when the round usually penetrates no class', () => {
    expect(topPenetratedClass([1, 0, 0, 0, 0, 0, 0, 0])).toBeNull()
    expect(topPenetratedClass([0, 0, 0, 0, 0, 0, 0, 0])).toBeNull()
  })
})

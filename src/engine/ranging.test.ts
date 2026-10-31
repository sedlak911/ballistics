import { describe, expect, it } from 'vitest'
import { rangeFromReading, readingScale } from './ranging'

describe('rangeFromReading', () => {
  it('turns a size and its angular size into a distance', () => {
    expect(rangeFromReading(1.8, 6, 'mil')).toBeCloseTo(300, 6)
    expect(rangeFromReading(0.25, 1.25, 'mil')).toBeCloseTo(200, 6)
    expect(rangeFromReading(1.8, 20.6, 'moa')).toBeCloseTo(300, 0)
  })

  it('has no answer for a zero, negative or missing reading', () => {
    expect(rangeFromReading(1.8, 0, 'mil')).toBeNull()
    expect(rangeFromReading(1.8, -1, 'mil')).toBeNull()
    expect(rangeFromReading(1.8, Number.NaN, 'mil')).toBeNull()
    expect(rangeFromReading(0, 2, 'mil')).toBeNull()
  })
})

describe('readingScale', () => {
  // A standing person from 1000 m (1.8 MIL) to 50 m (36 MIL).
  const scale = readingScale(1.8, 36)

  it('maps the ends of the range to the ends of the slider and back', () => {
    expect(scale.toPos(1.8)).toBeCloseTo(0, 6)
    expect(scale.toPos(36)).toBeCloseTo(scale.max, 6)
    expect(scale.fromPos(scale.toPos(6))).toBeCloseTo(6, 6)
  })

  it('gives long range a fair share of the travel', () => {
    // 1000 m → 300 m is a reading of 1.8 → 6 MIL: at least a third of the slider, not an eighth.
    expect(scale.toPos(6) / scale.max).toBeGreaterThan(0.35)
  })
})

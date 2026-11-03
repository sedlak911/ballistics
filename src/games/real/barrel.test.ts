import { describe, expect, it } from 'vitest'
import { barrelLengthIn, mvForBarrel } from './barrel'

describe('barrelLengthIn', () => {
  it('parses inches, millimetres and none', () => {
    expect(barrelLengthIn('27″')).toBe(27)
    expect(barrelLengthIn('16.5″')).toBe(16.5)
    expect(barrelLengthIn('475 mm')).toBeCloseTo(18.7, 2)
    expect(barrelLengthIn('—')).toBeNull()
    expect(barrelLengthIn('')).toBeNull()
  })
})

describe('mvForBarrel', () => {
  it('gives −30 m/s from 24″ to 20″', () => {
    expect(mvForBarrel(800, 24, 20)).toEqual({ deltaMs: -30, mvMs: 770 })
    expect(mvForBarrel(800, 20, 24)).toEqual({ deltaMs: 30, mvMs: 830 })
  })

  it('rounds a tie away from zero, the same both ways', () => {
    expect(mvForBarrel(800, 24, 25)?.deltaMs).toBe(10)
    expect(mvForBarrel(800, 25, 24)?.deltaMs).toBe(-10)
    expect(mvForBarrel(800, 24, 27)?.deltaMs).toBe(25)
    expect(mvForBarrel(800, 27, 24)?.deltaMs).toBe(-25)
    expect(mvForBarrel(800, 24, 23)?.mvMs).toBe(790)
    expect(mvForBarrel(800, 23, 24)?.mvMs).toBe(810)
  })

  it('shows a hint at 0.5″, where 3.75 m/s rounds to 5', () => {
    expect(mvForBarrel(800, 24, 23.5)).toEqual({ deltaMs: -5, mvMs: 795 })
  })

  it('gives nothing under 5 m/s', () => {
    expect(mvForBarrel(800, 24, 23.75)).toBeNull()
    expect(mvForBarrel(800, 24, 24)).toBeNull()
  })
})

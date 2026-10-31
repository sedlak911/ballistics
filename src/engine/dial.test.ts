import { describe, expect, it } from 'vitest'
import { dialFor } from './dial'

describe('dialFor', () => {
  it('8.84 mrad in 0.1 clicks is 88 clicks with 0.04 left', () =>
    expect(dialFor(8.84, 0.1, null)).toEqual({ clicks: 88, dialed: expect.closeTo(8.8, 9), remainder: expect.closeTo(0.04, 9), hold: 0 }))
  it('37.1 mrad with 14.5 of travel dials 145 clicks and holds 22.6', () => {
    const d = dialFor(37.1, 0.1, 14.5)
    expect(d.clicks).toBe(145)
    expect(d.hold).toBeCloseTo(22.6, 6)
    expect(d.remainder).toBe(0)
  })
  it('a target closer than the zero dials down', () => expect(dialFor(-0.43, 0.1, 14.5).clicks).toBe(-4))
  it('¼ MOA clicks', () => expect(dialFor(30.3, 0.25, null).clicks).toBe(121))
  it('has no -0: a tiny negative correction dials 0 clicks', () => {
    const d = dialFor(-0.04, 0.1, null)
    expect(Object.is(d.clicks, 0)).toBe(true)
    expect(Object.is(d.dialed, 0)).toBe(true)
    expect(d.remainder).toBeCloseTo(-0.04, 9)
  })
  it('a hold under half a click is a remainder', () => {
    const d = dialFor(14.52, 0.1, 14.5)
    expect(d.hold).toBe(0)
    expect(d.clicks).toBe(145)
    expect(d.remainder).toBeCloseTo(0.02, 9)
  })
  it('never dials past a travel that is not a multiple of the click', () => {
    const d = dialFor(14.56, 0.1, 14.56)
    expect(d.clicks).toBe(145)
    expect(d.hold).toBeCloseTo(0.06, 9)
  })
})

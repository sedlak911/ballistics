import { describe, expect, it } from 'vitest'
import { DEFAULT_SETUP, readRealSetup, writeRealSetup } from './setup'

const q = (s: string) => new URLSearchParams(s)

describe('readRealSetup', () => {
  it('gives the defaults for an empty link', () => {
    expect(readRealSetup(q(''))).toEqual(DEFAULT_SETUP)
    expect(DEFAULT_SETUP).toEqual({ presetId: 'p7', distanceM: 300, slopeDeg: 0, windMs: 0, windClock: 9, targetCm: 50 })
  })

  it('opens P7 at 300 m for an unknown preset and a garbage distance', () => {
    const s = readRealSetup(q('p=zzz&d=abc'))
    expect(s.presetId).toBe('p7')
    expect(s.distanceM).toBe(300)
  })

  it('clamps out-of-range numbers', () => {
    const s = readRealSetup(q('d=99999&sl=-90&ws=30&wc=15&tg=1'))
    expect(s).toMatchObject({ distanceM: 2500, slopeDeg: -45, windMs: 25, windClock: 12, targetCm: 5 })
    expect(readRealSetup(q('d=1&ws=-3&wc=0&tg=999'))).toMatchObject({ distanceM: 25, windMs: 0, windClock: 1, targetCm: 300 })
  })

  // The bar steps the wind in the unit the owner reads (0.5 m/s, 2 km/h, 1 mph, 1 kn), so the link keeps any of them.
  it('keeps the wind to a thousandth of a m/s, so 2 km/h, 1 mph and 1 kn survive the link', () => {
    expect(readRealSetup(q('ws=7.3')).windMs).toBe(7.3)
    expect(readRealSetup(q(`ws=${2 / 3.6}`)).windMs).toBe(0.556)
    expect(readRealSetup(q('ws=0.44704')).windMs).toBe(0.447)
  })

  it('round-trips through the link with the display keys', () => {
    const s = { presetId: 'p3', distanceM: 800, slopeDeg: -10, windMs: 4.5, windClock: 3, targetCm: 40 }
    const p = writeRealSetup(s, { lang: 'cs', system: 'metric', angle: 'moa' })
    expect(readRealSetup(p)).toEqual(s)
    expect(p.get('a')).toBe('moa')
  })
})

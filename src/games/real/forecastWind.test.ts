import { describe, expect, it } from 'vitest'
import { BOUNDS } from './setup'
import { STANDARD_STATION, type Station } from './station'
import { cardinalIndex, clockHour, forecastOffer, forecastUseOffered, windAtHeight } from './forecastWind'

const NOW = 1_000_000_000_000

function station(over: { wind?: number | null; from?: number | null; azimuth?: number | null; age?: number; height?: number; noModel?: boolean }): Station {
  return {
    ...STANDARD_STATION,
    heightAboveGroundM: { value: over.height ?? 1, source: 'manual' },
    azimuthDeg: over.azimuth == null ? null : { value: over.azimuth, source: 'manual' },
    model: over.noModel
      ? null
      : { time: 't', fetchedAt: NOW - (over.age ?? 0), windMs10: over.wind === undefined ? 3.1 : over.wind, windFromDeg: over.from === undefined ? 180 : over.from },
  }
}

describe('windAtHeight', () => {
  it('follows the log profile from the 10 m wind', () => {
    expect(windAtHeight(3.1, 1)).toBeCloseTo(1.871, 3)
    expect(windAtHeight(3.1, 10)).toBeCloseTo(3.1, 3)
    expect(windAtHeight(3.1, 20)).toBeCloseTo(3.47, 3)
  })
  it('clamps the height to 0.5 to 100 m', () => {
    expect(windAtHeight(3.1, 0)).toBeCloseTo(windAtHeight(3.1, 0.5), 3)
    expect(windAtHeight(3.1, 0)).toBeCloseTo(1.501, 3)
    expect(windAtHeight(3.1, 500)).toBeCloseTo(windAtHeight(3.1, 100), 3)
    expect(windAtHeight(3.1, 500)).toBeCloseTo(4.329, 3)
  })
})

describe('clockHour', () => {
  it.each([[180, 270, 9], [45, 0, 2], [0, 0, 12], [359, 0, 12], [270, 90, 6], [90, 360, 3]])('from %i, azimuth %i is %i', (from, az, hour) => {
    expect(clockHour(from, az)).toBe(hour)
  })
})

describe('cardinalIndex', () => {
  it.each([[0, 0], [22, 0], [23, 1], [180, 4], [225, 5], [337.5, 0], [359, 0], [360, 0]])('%d is %d', (deg, i) => {
    expect(cardinalIndex(deg)).toBe(i)
  })
})

describe('forecastOffer', () => {
  it('is null without a model, without its wind, or when stale', () => {
    expect(forecastOffer(station({ noModel: true }), NOW, 'm/s')).toBeNull()
    expect(forecastOffer(station({ wind: null }), NOW, 'm/s')).toBeNull()
    expect(forecastOffer(station({ from: null }), NOW, 'm/s')).toBeNull()
    expect(forecastOffer(station({ age: 3 * 3600_000 }), NOW, 'm/s')).toBeNull()
  })
  it('converts to the shooter height and snaps to the unit step', () => {
    expect(forecastOffer(station({ azimuth: 270 }), NOW, 'm/s')).toEqual({ shown: 2, speedMs: 2, hour: 9, cardinal: 4, calm: false, heightM: 1 })
  })
  it('has no clock hour without an azimuth', () => {
    expect(forecastOffer(station({}), NOW, 'm/s')?.hour).toBeNull()
  })
  it('snaps in km/h and stores m/s', () => {
    const o = forecastOffer(station({}), NOW, 'km/h')!
    expect(o.shown).toBe(6)
    expect(o.speedMs).toBeCloseTo(1.667, 3)
  })
  it('caps a strong forecast at the wind bound, in the text and in what Use stores', () => {
    const o = forecastOffer(station({ wind: 40, height: 100 }), NOW, 'm/s')!
    expect(o.speedMs).toBe(BOUNDS.windMs.max)
    expect(o.shown).toBe(BOUNDS.windMs.max)
  })
  it('calls under 0.5 m/s calm', () => {
    const o = forecastOffer(station({ wind: 0.6 }), NOW, 'm/s')!
    expect(o).toMatchObject({ calm: true, shown: 0, speedMs: 0 })
  })
})

describe('forecastUseOffered', () => {
  it('is false without a model', () => {
    expect(forecastUseOffered(station({ noModel: true, azimuth: 90 }), NOW, 'm/s')).toBe(false)
  })
  it('is true for a calm model without a direction', () => {
    expect(forecastUseOffered(station({ wind: 0.1, azimuth: null }), NOW, 'm/s')).toBe(true)
  })
  it('is false for a 3 m/s model without a direction, true with one', () => {
    expect(forecastUseOffered(station({ wind: 3, azimuth: null }), NOW, 'm/s')).toBe(false)
    expect(forecastUseOffered(station({ wind: 3, azimuth: 90 }), NOW, 'm/s')).toBe(true)
  })
})

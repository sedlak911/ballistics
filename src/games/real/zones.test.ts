import { describe, expect, it } from 'vitest'
import { windFromClock } from '../../engine/flight'
import { DEFAULT_SETUP, type RealSetup } from './setup'
import { setZoneWind, shownZones, windAtFor, zonesActive, zoneRanges, zoneSameAsNear, zoneWind } from './zones'

const base: RealSetup = { ...DEFAULT_SETUP, windSet: true, windMs: 4, windClock: 9, zonesOn: true }

describe('shownZones', () => {
  it('has none under 1000 m, two from 1000 and three from 1500', () => {
    expect([999, 1000, 1499, 1500].map(shownZones)).toEqual([[], ['near', 'far'], ['near', 'far'], ['near', 'mid', 'far']])
  })
})

describe('zoneRanges', () => {
  it('splits the distance into thirds or halves, rounded to 10 m', () => {
    expect(zoneRanges(1500)).toEqual([
      { name: 'near', fromM: 0, toM: 500 },
      { name: 'mid', fromM: 500, toM: 1000 },
      { name: 'far', fromM: 1000, toM: 1500 },
    ])
    expect(zoneRanges(1250)).toEqual([
      { name: 'near', fromM: 0, toM: 630 },
      { name: 'far', fromM: 630, toM: 1250 },
    ])
  })
})

describe('zoneWind', () => {
  it('an unset mid follows the near wind, a later change included', () => {
    expect(zoneWind(base, 'mid')).toEqual({ ms: 4, clock: 9, own: false })
    expect(zoneWind({ ...base, windMs: 6, windClock: 3 }, 'mid')).toEqual({ ms: 6, clock: 3, own: false })
    expect(zoneWind({ ...base, windMid: { ms: 1, clock: 2 } }, 'mid')).toEqual({ ms: 1, clock: 2, own: true })
    expect(zoneWind(base, 'near').own).toBe(true)
  })
})

describe('setZoneWind', () => {
  it("the first edit of mid copies the near wind's other value", () => {
    expect(setZoneWind(base, 'mid', { ms: 3 })).toEqual({ windMid: { ms: 3, clock: 9 }, windSet: true })
  })
  it('edits the near wind in place', () => {
    expect(setZoneWind({ ...base, windSet: false }, 'near', { clock: 6 })).toEqual({ windMs: 4, windClock: 6, windSet: true })
  })
  it('zoneSameAsNear drops the own wind', () => {
    expect(zoneSameAsNear('far')).toEqual({ windFar: null })
    expect(zoneSameAsNear('mid')).toEqual({ windMid: null })
  })
})

describe('windAtFor', () => {
  const three: RealSetup = { ...base, distanceM: 1500, windMid: { ms: 2, clock: 3 }, windFar: { ms: 7, clock: 12 } }
  it('is undefined with zones off or under 1000 m', () => {
    expect(windAtFor({ ...three, zonesOn: false })).toBeUndefined()
    expect(windAtFor({ ...three, distanceM: 999 })).toBeUndefined()
    expect(zonesActive({ ...three, distanceM: 999 })).toBe(false)
  })
  it("gives each zone's wind at 1500 m", () => {
    const f = windAtFor(three)!
    expect(f(300)).toEqual(windFromClock(4, 9))
    expect(f(700)).toEqual(windFromClock(2, 3))
    expect(f(1200)).toEqual(windFromClock(7, 12))
  })
  it('uses far for the far half and ignores mid at 1200 m', () => {
    const f = windAtFor({ ...three, distanceM: 1200 })!
    expect(f(700)).toEqual(windFromClock(7, 12))
  })
  it('keeps the own winds below 1000 m and uses them again when the distance returns', () => {
    const low = { ...three, distanceM: 950 }
    expect(zonesActive(low)).toBe(false)
    expect(windAtFor(low)).toBeUndefined()
    expect(low.windMid).toEqual({ ms: 2, clock: 3 })
    const f = windAtFor({ ...low, distanceM: 1600 })!
    expect(zonesActive({ ...low, distanceM: 1600 })).toBe(true)
    expect(f(700)).toEqual(windFromClock(2, 3))
    expect(f(1500)).toEqual(windFromClock(7, 12))
  })
  it('returns the far wind beyond the last zone end', () => {
    expect(windAtFor(three)!(10000)).toEqual(windFromClock(7, 12))
  })
  it.each([30, -30])('moves both boundaries by cos of a %i° slope', (deg) => {
    const f = windAtFor({ ...three, slopeDeg: deg })!
    const c = Math.cos((deg * Math.PI) / 180)
    expect(f(500 * c - 0.01)).toEqual(windFromClock(4, 9))
    expect(f(500 * c + 0.01)).toEqual(windFromClock(2, 3))
    expect(f(1000 * c - 0.01)).toEqual(windFromClock(2, 3))
    expect(f(1000 * c + 0.01)).toEqual(windFromClock(7, 12))
  })
  it('moves the boundaries by cos of the slope', () => {
    const f = windAtFor({ ...three, slopeDeg: 30 })!
    const edge = 500 * Math.cos(Math.PI / 6)
    expect(f(edge - 0.01)).toEqual(windFromClock(4, 9))
    expect(f(edge + 0.01)).toEqual(windFromClock(2, 3))
  })
})

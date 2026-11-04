import { describe, expect, it } from 'vitest'
import { windFromClock } from '../../engine/flight'
import { DEFAULT_SETUP, type RealSetup } from './setup'
import { setZoneWind, shownZones, windAtFor, zonesActive, zoneRanges, zoneSameAsNear, zoneWind } from './zones'

const base: RealSetup = { ...DEFAULT_SETUP, windSet: true, windMs: 4, windClock: 9, zonesOn: true }

describe('shownZones', () => {
  it('has none under 300 m, two from 300 and three from 600', () => {
    expect([299, 300, 599, 600].map(shownZones)).toEqual([[], ['near', 'far'], ['near', 'far'], ['near', 'mid', 'far']])
  })
})

describe('zoneRanges', () => {
  it('splits the distance into thirds or halves, rounded to 10 m', () => {
    expect(zoneRanges(600)).toEqual([
      { name: 'near', fromM: 0, toM: 200 },
      { name: 'mid', fromM: 200, toM: 400 },
      { name: 'far', fromM: 400, toM: 600 },
    ])
    expect(zoneRanges(450)).toEqual([
      { name: 'near', fromM: 0, toM: 230 },
      { name: 'far', fromM: 230, toM: 450 },
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
  const three: RealSetup = { ...base, distanceM: 600, windMid: { ms: 2, clock: 3 }, windFar: { ms: 7, clock: 12 } }
  it('is undefined with zones off or under 300 m', () => {
    expect(windAtFor({ ...three, zonesOn: false })).toBeUndefined()
    expect(windAtFor({ ...three, distanceM: 299 })).toBeUndefined()
    expect(zonesActive({ ...three, distanceM: 299 })).toBe(false)
  })
  it("gives each zone's wind at 600 m", () => {
    const f = windAtFor(three)!
    expect(f(100)).toEqual(windFromClock(4, 9))
    expect(f(300)).toEqual(windFromClock(2, 3))
    expect(f(500)).toEqual(windFromClock(7, 12))
  })
  it('uses far for the far half and ignores mid at 450 m', () => {
    const f = windAtFor({ ...three, distanceM: 450 })!
    expect(f(300)).toEqual(windFromClock(7, 12))
  })
  it('keeps the own winds below 300 m and uses them again when the distance returns', () => {
    const low = { ...three, distanceM: 250 }
    expect(zonesActive(low)).toBe(false)
    expect(windAtFor(low)).toBeUndefined()
    expect(low.windMid).toEqual({ ms: 2, clock: 3 })
    const f = windAtFor({ ...low, distanceM: 650 })!
    expect(zonesActive({ ...low, distanceM: 650 })).toBe(true)
    expect(f(325)).toEqual(windFromClock(2, 3))
    expect(f(600)).toEqual(windFromClock(7, 12))
  })
  it('returns the far wind beyond the last zone end', () => {
    expect(windAtFor(three)!(10000)).toEqual(windFromClock(7, 12))
  })
  it.each([30, -30])('moves both boundaries by cos of a %i° slope', (deg) => {
    const f = windAtFor({ ...three, slopeDeg: deg })!
    const c = Math.cos((deg * Math.PI) / 180)
    expect(f(200 * c - 0.01)).toEqual(windFromClock(4, 9))
    expect(f(200 * c + 0.01)).toEqual(windFromClock(2, 3))
    expect(f(400 * c - 0.01)).toEqual(windFromClock(2, 3))
    expect(f(400 * c + 0.01)).toEqual(windFromClock(7, 12))
  })
  it('moves the boundaries by cos of the slope', () => {
    const f = windAtFor({ ...three, slopeDeg: 30 })!
    const edge = 200 * Math.cos(Math.PI / 6)
    expect(f(edge - 0.01)).toEqual(windFromClock(4, 9))
    expect(f(edge + 0.01)).toEqual(windFromClock(2, 3))
  })
})

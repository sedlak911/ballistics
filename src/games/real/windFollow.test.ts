import { describe, expect, it } from 'vitest'
import { DEFAULT_SETUP, type RealSetup } from './setup'
import type { WindMemory } from './windMemory'
import { liveFromDeg, offerWind, turnWind, windSource } from './windFollow'

const wind = (h: number, ms = 4): RealSetup => ({ ...DEFAULT_SETUP, windSet: true, windClock: h, windMs: ms })

describe('the wind follows the direction', () => {
  it('turns 180° at 10 h to 274° as 7 h', () => {
    const r = turnWind(wind(10), null, 180, 274)
    expect(r.patch).toEqual({ windClock: 7 })
    expect(r.memory).toEqual({ fromDeg: 120, hour: 7, speedMs: 4, source: 'hand' })
  })
  it('turns 0° at 3 h to 90° as 12 h', () => expect(turnWind(wind(3), null, 0, 90).patch).toEqual({ windClock: 12 }))
  it('anchors on the first direction and keeps the hour', () => {
    const r = turnWind(wind(10), null, null, 274)
    expect(r.patch).toBeNull()
    expect(r.memory?.fromDeg).toBe(214)
  })
  it('keeps the hour when the direction is cleared', () => expect(turnWind(wind(10), null, 180, null).patch).toBeNull())
  it('reads 360 as 0 and wraps 359 → 1', () => {
    expect(turnWind(wind(3), null, 0, 360).patch).toBeNull()
    expect(turnWind(wind(12), null, 359, 1).patch).toBeNull()
  })
  it('ten 10° turns there and back keep the hour', () => {
    let s = wind(10), mem: WindMemory | null = null, dir = 180
    for (const step of [10, 10, 10, 10, 10, -10, -10, -10, -10, -10]) {
      const r = turnWind(s, mem, dir, dir + step)
      s = { ...s, ...r.patch }; mem = r.memory; dir += step
    }
    expect(s.windClock).toBe(10)
  })
  it('re-anchors a stale memory from the hour (a link changed it)', () => {
    const mem: WindMemory = { fromDeg: 125, hour: 10, speedMs: 4, source: 'forecast' }
    expect(turnWind(wind(3), mem, 0, 90).patch).toEqual({ windClock: 12 })
  })
  it('does not turn an unset wind', () => expect(turnWind(DEFAULT_SETUP, null, 0, 90)).toEqual({ patch: null, memory: null }))
  it('a speed change keeps where the wind blows from but makes it by hand', () => {
    const mem: WindMemory = { fromDeg: 125, hour: 10, speedMs: 3.5, source: 'forecast' }
    expect(liveFromDeg(wind(10, 4), mem)).toBe(125)
    expect(windSource(wind(10, 4), mem)).toBe('hand')
    expect(windSource(wind(10, 3.5), mem)).toBe('forecast')
    expect(windSource(DEFAULT_SETUP, mem)).toBe('unset')
  })
  it('offerWind stores the forecast exactly; a calm keeps the hour', () => {
    const offer = { speedMs: 3.5, shown: 3.5, heightM: 1, cardinal: 3, hour: 10, calm: false }
    expect(offerWind(offer, 125, wind(4), null, 180)).toEqual({
      patch: { windMs: 3.5, windClock: 10, windSet: true }, memory: { fromDeg: 125, hour: 10, speedMs: 3.5, source: 'forecast' } })
    const calm = { ...offer, speedMs: 0, shown: 0, calm: true }
    expect(offerWind(calm, 125, wind(4), null, 180).patch).toEqual({ windMs: 0, windSet: true })
    expect(offerWind(calm, 125, wind(4), null, 180).memory.fromDeg).toBe(300)
  })
})

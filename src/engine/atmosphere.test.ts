import { describe, expect, it } from 'vitest'
import {
  airAbove,
  airState,
  densityAltitudeM,
  ISA_SEA_LEVEL,
  isaStationPressureHPa,
  saturationVaporPressureHPa,
  qnhFromStation,
  stationFromQnh,
} from './atmosphere'

describe('airState', () => {
  it('matches the research example: 970 hPa station, 20 °C, 60 %', () => {
    const a = airState({ tempC: 20, stationPressureHPa: 970, humidityPct: 60 })
    expect(a.densityKgM3).toBeCloseTo(1.146, 3)
    expect(a.speedOfSoundMs).toBeCloseTo(344.2, 1)
  })
  it('gives ICAO sea level for ISA', () => {
    expect(airState(ISA_SEA_LEVEL).densityKgM3).toBeCloseTo(1.225, 4)
    expect(airState(ISA_SEA_LEVEL).speedOfSoundMs).toBeCloseTo(340.3, 0)
  })
  it('moist air is lighter, and the extremes stay finite', () => {
    const dry = airState({ tempC: 30, stationPressureHPa: 1000, humidityPct: 0 }).densityKgM3
    const wet = airState({ tempC: 30, stationPressureHPa: 1000, humidityPct: 100 }).densityKgM3
    expect(wet).toBeLessThan(dry)
    for (const tempC of [-20, 40])
      for (const humidityPct of [0, 100])
        expect(Number.isFinite(airState({ tempC, stationPressureHPa: 950, humidityPct }).densityKgM3)).toBe(true)
  })
})
it('saturation vapour pressure at 20 °C is 23.4 hPa (Buck)', () =>
  expect(saturationVaporPressureHPa(20)).toBeCloseTo(23.39, 1))
it('QNH 1013.25 at 500 m is about 954.6 hPa station pressure', () =>
  expect(stationFromQnh(1013.25, 500)).toBeCloseTo(954.6, 0))
it('ISA station pressure at 0 m is 1013.25 hPa', () => expect(isaStationPressureHPa(0)).toBeCloseTo(1013.25, 2))
it('air 1000 m above the muzzle is thinner', () =>
  expect(airAbove(ISA_SEA_LEVEL, 1000).densityKgM3).toBeCloseTo(1.1117, 3))
it('density altitude of ISA sea level is 0 m', () => expect(densityAltitudeM(1.225)).toBeCloseTo(0, -1))

describe('qnhFromStation', () => {
  it('is the inverse of stationFromQnh', () => {
    for (const alt of [-100, 0, 208, 1000, 3000]) {
      expect(stationFromQnh(qnhFromStation(1003.5, alt), alt)).toBeCloseTo(1003.5, 9)
      expect(qnhFromStation(stationFromQnh(1020, alt), alt)).toBeCloseTo(1020, 9)
    }
    expect(qnhFromStation(1003.5, 208)).toBeCloseTo(1028.6, 1)
  })
})

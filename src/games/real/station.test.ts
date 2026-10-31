import { describe, expect, it } from 'vitest'
import { stationFromQnh } from '../../engine/atmosphere'
import { applyWeather, readStation, resetWeather, STANDARD_STATION, stationAir, withAltitude, withPressureKind, type Station } from './station'

describe('stationAir', () => {
  it('converts QNH 1013.25 at 500 m to station pressure', () => {
    const s = { ...STANDARD_STATION, pressureKind: 'qnh' as const, altitudeM: { value: 500, source: 'manual' as const }, pressureHPa: { value: 1013.25, source: 'manual' as const } }
    expect(stationAir(s).stationPressureHPa).toBeCloseTo(954.6, 1)
  })

  it('uses the ISA pressure of the altitude when the pressure is standard', () => {
    const s = { ...STANDARD_STATION, altitudeM: { value: 500, source: 'manual' as const } }
    expect(stationAir(s).stationPressureHPa).toBeCloseTo(954.6, 1)
    expect(stationAir(STANDARD_STATION)).toEqual({ tempC: 15, stationPressureHPa: 1013.25, humidityPct: 0 })
  })

  it('gives a standard pressure the same air under either kind (I1)', () => {
    const at500 = { ...STANDARD_STATION, altitudeM: { value: 500, source: 'manual' as const } }
    const asQnh = stationAir({ ...at500, pressureKind: 'qnh' }).stationPressureHPa
    expect(asQnh).toBe(stationAir({ ...at500, pressureKind: 'station' }).stationPressureHPa)
    expect(asQnh).toBeCloseTo(stationFromQnh(1013.25, 500), 9)
  })

  it('passes a station pressure through', () => {
    const s = { ...STANDARD_STATION, pressureHPa: { value: 940, source: 'manual' as const } }
    expect(stationAir(s).stationPressureHPa).toBe(940)
  })
})

describe('readStation', () => {
  it('clamps and defaults', () => {
    const s = readStation({ tempC: { value: 99, source: 'manual' }, humidityPct: { value: 'x', source: 'manual' }, azimuthDeg: { value: 400, source: 'manual' }, powderTempC: 'no' })
    expect(s.tempC.value).toBe(60)
    expect(s.humidityPct).toEqual(STANDARD_STATION.humidityPct)
    expect(s.azimuthDeg).toEqual({ value: 360, source: 'manual' })
    expect(s.powderTempC).toBeNull()
  })

  // M8: a corrupt source never claims the user typed it.
  it('gives a field with an unknown source its default, value and source, never manual', () => {
    const s = readStation({
      tempC: { value: 30, source: 'bogus' }, pressureHPa: { value: 950 }, altitudeM: { value: 400, source: 'location' },
      latitudeDeg: { value: 49, source: 'model' }, azimuthDeg: { value: 90, source: 'typed' }, powderTempC: { value: 20, source: null },
    })
    expect(s.tempC).toEqual(STANDARD_STATION.tempC)
    expect(s.pressureHPa).toEqual(STANDARD_STATION.pressureHPa)
    expect(s.altitudeM).toEqual({ value: 400, source: 'location' })
    expect(s.latitudeDeg).toEqual({ value: 49, source: 'model' })
    expect(s.azimuthDeg).toBeNull()
    expect(s.powderTempC).toBeNull()
  })

  it('keeps a stored kind and gives anything else the default, QNH (I2)', () => {
    expect(readStation({ pressureKind: 'station' }).pressureKind).toBe('station')
    expect(readStation({ pressureKind: 'qnh' }).pressureKind).toBe('qnh')
    expect(readStation({ pressureKind: 'sea' }).pressureKind).toBe('qnh')
    expect(readStation({}).pressureKind).toBe('qnh')
  })
})

describe('applyWeather', () => {
  const w = { tempC: 10, humidityPct: 76, stationPressureHPa: 1003.5, modelTime: '2026-10-31T14:05', fetchedAt: 5 }
  const r = { cell: { lat: 50.09 }, elevationM: 208, weather: w }

  it('writes model fields, a station pressure, the rounded latitude and the model time', () => {
    const { patch: p, dropped } = applyWeather(STANDARD_STATION, r)
    expect(dropped).toEqual([])
    expect(p).toEqual({
      tempC: { value: 10, source: 'model' }, humidityPct: { value: 76, source: 'model' },
      pressureHPa: { value: 1003.5, source: 'model' }, pressureKind: 'station',
      altitudeM: { value: 208, source: 'model' }, latitudeDeg: { value: 50.09, source: 'location' },
      model: { time: '2026-10-31T14:05', fetchedAt: 5 },
    })
  })

  it('keeps manual fields, and a standard field the forecast lacked stays standard and is named', () => {
    const s = { ...STANDARD_STATION, tempC: { value: 3, source: 'manual' as const } }
    const { patch: p, dropped } = applyWeather(s, { ...r, weather: { ...w, stationPressureHPa: null } })
    expect(p.tempC).toBeUndefined()
    expect(p.pressureHPa).toBeUndefined()
    expect(p.pressureKind).toBeUndefined()
    expect(p.humidityPct).toEqual({ value: 76, source: 'model' })
    expect(dropped).toEqual(['pressureHPa'])
  })

  // I1: a dropped value never passes as current under the new model time.
  it('a model field the forecast lacked goes back to standard (the pressure to QNH) and is named', () => {
    const model = (value: number) => ({ value, source: 'model' as const })
    const s = { ...STANDARD_STATION, tempC: model(4), pressureHPa: model(960), pressureKind: 'station' as const, humidityPct: model(60), altitudeM: model(208) }
    const { patch: p, dropped } = applyWeather(s, { ...r, weather: { ...w, tempC: null, stationPressureHPa: null } })
    expect(p.pressureHPa).toEqual(STANDARD_STATION.pressureHPa)
    expect(p.pressureKind).toBe('qnh')
    expect(p.tempC).toEqual(STANDARD_STATION.tempC)
    expect(p.humidityPct).toEqual(model(76))
    expect(p.model).toEqual({ time: '2026-10-31T14:05', fetchedAt: 5 })
    expect(dropped).toEqual(['tempC', 'pressureHPa'])
  })

  it('a manual field the forecast lacked stays as it is and is not named', () => {
    const s = { ...STANDARD_STATION, pressureHPa: { value: 990, source: 'manual' as const } }
    const { patch: p, dropped } = applyWeather(s, { ...r, weather: { ...w, stationPressureHPa: null } })
    expect(p.pressureHPa).toBeUndefined()
    expect(p.pressureKind).toBeUndefined()
    expect(dropped).toEqual([])
  })
})

describe('the stored model time', () => {
  it('is cleaned on read: garbage is absent', () => {
    expect(readStation({ model: { time: '2026-10-31T14:05', fetchedAt: 4 } }).model).toEqual({ time: '2026-10-31T14:05', fetchedAt: 4 })
    expect(readStation({ model: { time: 3, fetchedAt: 4 } }).model).toBeNull()
    expect(readStation({ model: { time: 'T', fetchedAt: 'x' } }).model).toBeNull()
    expect(readStation({ model: 'x' }).model).toBeNull()
    expect(readStation(null).model).toBeNull()
  })
})

describe('the model time shape and the clock', () => {
  it('needs an ISO local time and a fetchedAt not from the future', () => {
    expect(readStation({ model: { time: 'yesterday', fetchedAt: 4 } }).model).toBeNull()
    expect(readStation({ model: { time: '2026-10-31T14:05', fetchedAt: 4 } }).model).toEqual({ time: '2026-10-31T14:05', fetchedAt: 4 })
    expect(readStation({ model: { time: '2026-10-31T14:05', fetchedAt: Date.now() + 10 * 60_000 } }).model).toBeNull()
    expect(readStation({ model: { time: '2026-10-31T14:05', fetchedAt: Date.now() + 60_000 } }).model).not.toBeNull()
  })
})

describe('applyWeather and the pressure kind', () => {
  it('keeps the kind of a manual pressure while the temperature becomes a model one', () => {
    const w = { tempC: 10, humidityPct: 76, stationPressureHPa: 1003.5, modelTime: '2026-10-31T14:05', fetchedAt: 5 }
    const s = { ...STANDARD_STATION, pressureHPa: { value: 1020, source: 'manual' as const }, pressureKind: 'qnh' as const }
    const p = applyWeather(s, { cell: { lat: 50.09 }, elevationM: 208, weather: w }).patch
    expect(p.tempC).toEqual({ value: 10, source: 'model' })
    expect(p.pressureHPa).toBeUndefined()
    expect(p.pressureKind).toBeUndefined()
  })
})

describe('resetWeather', () => {
  const model = (value: number) => ({ value, source: 'model' as const })
  const s = {
    ...STANDARD_STATION, tempC: model(10), pressureHPa: model(1003.5), pressureKind: 'station' as const, humidityPct: model(76),
    altitudeM: model(208), latitudeDeg: { value: 50.09, source: 'location' as const }, model: { time: '2026-10-31T14:05', fetchedAt: 5 },
  }

  it('sends model temperature, pressure and humidity back to standard, keeps the altitude and latitude', () => {
    const p = resetWeather(s)
    expect(p.tempC).toEqual(STANDARD_STATION.tempC)
    expect(p.pressureHPa).toEqual(STANDARD_STATION.pressureHPa)
    expect(p.pressureKind).toBe('qnh')
    expect(p.humidityPct).toEqual(STANDARD_STATION.humidityPct)
    expect(p.model).toBeNull()
    expect(p.altitudeM).toBeUndefined()
    expect(p.latitudeDeg).toBeUndefined()
  })

  it('leaves a manual temperature and a manual pressure with its kind', () => {
    const p = resetWeather({ ...s, tempC: { value: 3, source: 'manual' }, pressureHPa: { value: 990, source: 'manual' } })
    expect(p.tempC).toBeUndefined()
    expect(p.pressureHPa).toBeUndefined()
    expect(p.pressureKind).toBeUndefined()
    expect(p.humidityPct).toEqual(STANDARD_STATION.humidityPct)
  })
})

describe('model weather belongs to an altitude (C1)', () => {
  const model = (value: number) => ({ value, source: 'model' as const })
  const manual = (value: number) => ({ value, source: 'manual' as const })
  const at208: Station = {
    ...STANDARD_STATION, tempC: model(10), pressureHPa: model(1003.5), pressureKind: 'station', humidityPct: model(76),
    altitudeM: model(208), latitudeDeg: { value: 50.09, source: 'location' }, model: { time: '2026-10-31T14:05', fetchedAt: 5 },
  }
  // What the store does with a patch: merge, then read it back (with its clamps).
  const apply = (s: Station, patch: Partial<Station>) => readStation({ ...s, ...patch })
  const rel = (a: number, b: number) => Math.abs(a / b - 1)

  it('station first and QNH first give the same air after a 208 -> 400 m edit', () => {
    const a = apply(at208, withAltitude(at208, manual(400)))
    const q = apply(at208, withPressureKind(at208, 'qnh'))
    const b = apply(q, withAltitude(q, manual(400)))
    expect(rel(stationAir(a).stationPressureHPa, stationAir(b).stationPressureHPa)).toBeLessThan(1e-9)
    expect(stationAir(a).tempC).toBe(stationAir(b).tempC)
    expect(stationAir(a).stationPressureHPa).toBeCloseTo(980.76, 2)
    expect(a.pressureHPa.source).toBe('model')
    expect(a.altitudeM).toEqual(manual(400))
    expect(a.model).toEqual(at208.model)
  })

  it('a model temperature moves by the ISA lapse rate: 10 °C at 208 m reads about 8.75 °C at 400 m', () => {
    const a = apply(at208, withAltitude(at208, manual(400)))
    expect(a.tempC.value).toBeCloseTo(8.752, 6)
    expect(a.tempC.source).toBe('model')
  })

  it('in QNH kind the pressure stays: stationAir already reduces it', () => {
    const q = apply(at208, withPressureKind(at208, 'qnh'))
    const p = withAltitude(q, manual(400))
    expect(p.pressureHPa).toBeUndefined()
  })

  it('manual and standard fields do not move', () => {
    const s: Station = { ...at208, tempC: manual(4), pressureHPa: manual(990) }
    const p = withAltitude(s, manual(400))
    expect(p.tempC).toBeUndefined()
    expect(p.pressureHPa).toBeUndefined()
    const std = withAltitude({ ...at208, tempC: STANDARD_STATION.tempC, pressureHPa: STANDARD_STATION.pressureHPa }, manual(400))
    expect(std.tempC).toBeUndefined()
    expect(std.pressureHPa).toBeUndefined()
    expect(std.humidityPct).toBeUndefined()
  })

  it('toggling the kind after an altitude edit neither moves the air nor clamps it', () => {
    const a = apply(at208, withAltitude(at208, manual(1500)))
    const before = stationAir(a).stationPressureHPa
    const q = apply(a, withPressureKind(a, 'qnh'))
    expect(q.pressureHPa.value).toBeCloseTo(1028.61, 2)
    expect(q.pressureHPa.source).toBe('model')
    expect(rel(stationAir(q).stationPressureHPa, before)).toBeLessThan(1e-9)
    const back = apply(q, withPressureKind(q, 'station'))
    expect(rel(stationAir(back).stationPressureHPa, before)).toBeLessThan(1e-9)
  })

  it('an altitude typo up to the field maximum, then corrected, gives the model pressure back (N2)', () => {
    const typo = apply(at208, withAltitude(at208, manual(9000)))
    const fixed = apply(typo, withAltitude(typo, manual(208)))
    expect(rel(fixed.pressureHPa.value, 1003.5)).toBeLessThan(1e-9)
    expect(fixed.tempC.value).toBeCloseTo(10, 9)
  })

  it('a manual or standard pressure changes kind without converting', () => {
    expect(withPressureKind({ ...at208, pressureHPa: manual(1020) }, 'qnh')).toEqual({ pressureKind: 'qnh' })
    expect(withPressureKind({ ...at208, pressureHPa: STANDARD_STATION.pressureHPa }, 'qnh')).toEqual({ pressureKind: 'qnh' })
    expect(withPressureKind(at208, 'station')).toEqual({})
  })

  it('a forecast for another height than a kept (manual) altitude is moved to that altitude', () => {
    const s: Station = { ...STANDARD_STATION, altitudeM: manual(400) }
    const p = applyWeather(s, { cell: { lat: 50.09 }, elevationM: 208, weather: { tempC: 10, humidityPct: 76, stationPressureHPa: 1003.5, modelTime: '2026-10-31T14:05', fetchedAt: 5 } }).patch
    expect(p.altitudeM).toBeUndefined()
    expect(p.pressureHPa!.value).toBeCloseTo(980.76, 2)
    expect(p.tempC!.value).toBeCloseTo(8.752, 6)
    expect(p.humidityPct).toEqual(model(76))
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cachedFor,
  cellOf,
  elevationGrid,
  elevationUrl,
  forecastUrl,
  freshness,
  interpolateElevation,
  parseForecast,
  readWeatherCache,
  weatherByLocation,
  REQUEST_TIMEOUT_MS,
} from './weather'

const KEY = 'gb.real.weather'

describe('cell and grid', () => {
  it('rounds to two decimals and never sends -0.00', () => {
    expect(cellOf(50.08549, 14.42076)).toEqual({ lat: 50.09, lon: 14.42 })
    const c = cellOf(-0.004, -0.004)
    expect(Object.is(c.lat, -0)).toBe(false)
    for (const url of [elevationUrl(c), forecastUrl(c, 0)]) {
      expect(url).not.toMatch(/[=,]-0\.00(?=[,&]|$)/)
    }
    expect(forecastUrl(c, 0)).toContain('latitude=0&longitude=0&')
    for (const url of [elevationUrl(c), forecastUrl(c, -0)]) expect(url).not.toMatch(/-0(?![.\d])/)
    expect(forecastUrl(c, -0)).toContain('elevation=0&')
  })

  it('the grid has 100 points covering the cell, edges included', () => {
    const c = cellOf(50.08549, 14.42076)
    const g = elevationGrid(c)
    expect(g.lats).toHaveLength(10)
    expect(g.lons).toHaveLength(10)
    expect(g.lats[0]).toBeCloseTo(c.lat - 0.005, 5)
    expect(g.lats[9]).toBeCloseTo(c.lat + 0.005, 5)
    expect(g.lons[0]).toBeCloseTo(c.lon - 0.005, 5)
    expect(g.lons[9]).toBeCloseTo(c.lon + 0.005, 5)
    // the elevation URL sends the 100 combinations (10 lats x 10 lons)
    const q = new URL(elevationUrl(c)).searchParams
    expect(q.get('latitude')!.split(',')).toHaveLength(100)
    expect(q.get('longitude')!.split(',')).toHaveLength(100)
  })

  it('the grid and both URLs are identical for two exact points in one cell', () => {
    const a = cellOf(50.0851, 14.4151)
    const b = cellOf(50.0899, 14.4249)
    expect(a).toEqual(b)
    expect(elevationGrid(a)).toEqual(elevationGrid(b))
    expect(elevationUrl(a)).toBe(elevationUrl(b))
    expect(forecastUrl(a, 208)).toBe(forecastUrl(b, 208))
  })

  it('interpolates a plane exactly', () => {
    const c = { lat: 50.09, lon: 14.42 }
    const el: number[] = []
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) el.push(100 + 10 * i + j)
    // point at fractional index (2.5, 4.25): lat = start + 2.5 * step
    const step = 0.01 / 9
    const lat = c.lat - 0.005 + 2.5 * step
    const lon = c.lon - 0.005 + 4.25 * step
    expect(interpolateElevation(c, el, lat, lon)).toBeCloseTo(100 + 25 + 4.25, 6)
  })

  it('clamps to the grid on the edge', () => {
    const c = { lat: 50.09, lon: 14.42 }
    const el = Array.from({ length: 100 }, (_, k) => k)
    expect(interpolateElevation(c, el, c.lat + 0.005, c.lon + 0.005)).toBeCloseTo(99, 6)
    expect(interpolateElevation(c, el, c.lat - 0.0051, c.lon - 0.0051)).toBeCloseTo(0, 6)
  })
})

describe('forecast', () => {
  it('the forecast URL asks for surface_pressure and never pressure_msl', () => {
    const u = forecastUrl({ lat: 50.08, lon: 14.42 }, 208)
    expect(u).toMatch(/surface_pressure/)
    expect(u).not.toMatch(/pressure_msl/)
    expect(u).toBe(
      'https://api.open-meteo.com/v1/forecast?latitude=50.08&longitude=14.42&elevation=208&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto',
    )
  })

  it('asks for the 10 m wind in m/s', () => {
    const u = forecastUrl({ lat: 50.08, lon: 14.42 }, 208)
    expect(u).toContain('current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m')
    expect(u).toContain('&wind_speed_unit=ms')
  })

  it('parses the wind, each value on its own', () => {
    const base = { time: '2026-11-03T14:00', temperature_2m: 10, relative_humidity_2m: 50, surface_pressure: 980 }
    expect(parseForecast({ current: { ...base, wind_speed_10m: 3.1, wind_direction_10m: 180 } }, 1)).toMatchObject({ windMs10: 3.1, windFromDeg: 180 })
    expect(parseForecast({ current: base }, 1)).toMatchObject({ tempC: 10, windMs10: null, windFromDeg: null })
    for (const bad of [-1, 120]) {
      expect(parseForecast({ current: { ...base, wind_speed_10m: bad, wind_direction_10m: 90 } }, 1)).toMatchObject({ tempC: 10, windMs10: null, windFromDeg: 90 })
    }
    for (const bad of [400, 'x']) {
      expect(parseForecast({ current: { ...base, wind_speed_10m: 2, wind_direction_10m: bad } }, 1)).toMatchObject({ tempC: 10, windMs10: 2, windFromDeg: null })
    }
  })

  it('a forecast with only wind is still no forecast', () => {
    expect(parseForecast({ current: { time: '2026-11-03T14:00', wind_speed_10m: 3, wind_direction_10m: 180 } }, 0)).toBeNull()
  })

  it("parses the research's Prague response", () => {
    const w = parseForecast(
      { elevation: 208, current: { time: '2026-10-31T15:00', temperature_2m: 10, relative_humidity_2m: 76, surface_pressure: 1003.5 } },
      0,
    )
    expect(w).toMatchObject({ tempC: 10, humidityPct: 76, stationPressureHPa: 1003.5, modelTime: '2026-10-31T15:00', fetchedAt: 0 })
  })

  it('drops garbage values but keeps the rest', () => {
    const w = parseForecast(
      { current: { time: '2026-10-31T14:05', temperature_2m: 10, relative_humidity_2m: 140, surface_pressure: 5000 } },
      1,
    )
    expect(w).toMatchObject({ tempC: 10, humidityPct: null, stationPressureHPa: null })
    expect(parseForecast({}, 0)).toBeNull()
    expect(parseForecast(null, 0)).toBeNull()
  })

  // M1: model fields with no time would never age.
  it('returns null when current.time is missing or not an ISO local time', () => {
    const values = { temperature_2m: 10, relative_humidity_2m: 76, surface_pressure: 1003.5 }
    expect(parseForecast({ current: values }, 0)).toBeNull()
    expect(parseForecast({ current: { ...values, time: 'T' } }, 0)).toBeNull()
    expect(parseForecast({ current: { ...values, time: 1730383500 } }, 0)).toBeNull()
    expect(parseForecast({ current: { ...values, time: 'yesterday 14:05' } }, 0)).toBeNull()
    expect(parseForecast({ current: { ...values, time: '2026-10-31T14:05' } }, 0)).toMatchObject({ modelTime: '2026-10-31T14:05' })
  })

  it('returns null when all three values are missing or out of range', () => {
    expect(parseForecast({ current: { time: '2026-10-31T14:05' } }, 0)).toBeNull()
    expect(parseForecast({ current: { temperature_2m: 99, relative_humidity_2m: 140, surface_pressure: 5000 } }, 0)).toBeNull()
  })

  it('a fetchedAt in the future is stale', () => {
    expect(freshness(10 * 60_000, 0)).toBe('stale')
  })

  it('freshness: 29 min fresh, 2 h aging, 3 h 1 min stale', () => {
    const min = 60_000
    expect(freshness(0, 29 * min)).toBe('fresh')
    expect(freshness(0, 30 * min)).toBe('aging')
    expect(freshness(0, 120 * min)).toBe('aging')
    expect(freshness(0, 181 * min)).toBe('stale')
  })
})

describe('cache', () => {
  const cached = {
    cell: { lat: 50.09, lon: 14.42 },
    elevationM: 208,
    tempC: 10,
    humidityPct: 76,
    stationPressureHPa: 1003.5,
    modelTime: '2026-10-31T14:05',
    fetchedAt: 0,
  }
  beforeEach(() => localStorage.clear())

  it('a cache without the wind keys reads with both wind values null', () => {
    expect(readWeatherCache(cached)).toMatchObject({ windMs10: null, windFromDeg: null })
    expect(readWeatherCache({ ...cached, windMs10: 4, windFromDeg: 270 })).toMatchObject({ windMs10: 4, windFromDeg: 270 })
  })

  it('a cache from another cell or a stale one is not current', () => {
    localStorage.setItem(KEY, JSON.stringify(cached))
    expect(cachedFor({ lat: 50.09, lon: 14.42 }, 60_000)).toMatchObject({ elevationM: 208 })
    expect(cachedFor({ lat: 50.1, lon: 14.42 }, 60_000)).toBeNull()
    expect(cachedFor({ lat: 50.09, lon: 14.42 }, 181 * 60_000)).toBeNull()
  })

  // M2: a cache from an older version, or edited by hand, is checked like a forecast.
  it('checks the values like a forecast: one out of range becomes null, all of them means no cache', () => {
    expect(readWeatherCache({ ...cached, tempC: 99, humidityPct: 140 })).toMatchObject({ tempC: null, humidityPct: null, stationPressureHPa: 1003.5 })
    expect(readWeatherCache({ ...cached, stationPressureHPa: 5000 })).toMatchObject({ tempC: 10, stationPressureHPa: null })
    expect(readWeatherCache({ ...cached, tempC: -61, humidityPct: -1, stationPressureHPa: 499 })).toBeNull()
    expect(readWeatherCache({ ...cached, tempC: null, humidityPct: 'x', stationPressureHPa: undefined })).toBeNull()
    expect(readWeatherCache(cached)).toMatchObject({ tempC: 10, humidityPct: 76, stationPressureHPa: 1003.5 })
  })

  it('checks the altitude (finite, -500 to 9000 m) and the model time', () => {
    expect(readWeatherCache({ ...cached, elevationM: 9001 })).toBeNull()
    expect(readWeatherCache({ ...cached, elevationM: -501 })).toBeNull()
    expect(readWeatherCache({ ...cached, elevationM: Infinity })).toBeNull()
    expect(readWeatherCache({ ...cached, elevationM: 9000 })).toMatchObject({ elevationM: 9000 })
    expect(readWeatherCache({ ...cached, elevationM: -500 })).toMatchObject({ elevationM: -500 })
    expect(readWeatherCache({ ...cached, modelTime: 'T' })).toBeNull()
    expect(readWeatherCache({ ...cached, modelTime: undefined })).toBeNull()
  })

  it('survives corrupt, missing and blocked storage', () => {
    expect(cachedFor({ lat: 1, lon: 1 }, 0)).toBeNull()
    localStorage.setItem(KEY, '{nope')
    expect(cachedFor({ lat: 1, lon: 1 }, 0)).toBeNull()
    expect(readWeatherCache({ cell: 3 })).toBeNull()
    expect(readWeatherCache(null)).toBeNull()
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(cachedFor({ lat: 1, lon: 1 }, 0)).toBeNull()
    spy.mockRestore()
  })
})

describe('weatherByLocation', () => {
  const origGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
  function geo(impl: (ok: (p: unknown) => void, err: (e: { code: number }) => void) => void) {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: impl } })
  }
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('isSecureContext', true)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (origGeo) Object.defineProperty(navigator, 'geolocation', origGeo)
    else delete (navigator as unknown as Record<string, unknown>).geolocation
  })

  it('maps a denied permission to "denied" and an insecure context to "insecure"', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    geo((_ok, err) => err({ code: 1 }))
    expect(await weatherByLocation()).toEqual({ ok: false, error: 'denied' })
    geo((_ok, err) => err({ code: 2 }))
    expect(await weatherByLocation()).toEqual({ ok: false, error: 'unavailable' })
    geo((_ok, err) => err({ code: 3 }))
    expect(await weatherByLocation()).toEqual({ ok: false, error: 'timeout' })
    const ask = vi.fn()
    geo(ask)
    vi.stubGlobal('isSecureContext', false)
    expect(await weatherByLocation()).toEqual({ ok: false, error: 'insecure' })
    expect(ask).not.toHaveBeenCalled()
    expect(f).not.toHaveBeenCalled()
  })

  it('maps a fetch rejection to "offline" and a 503 to "service"', async () => {
    geo((ok) => ok({ coords: { latitude: 50.0851, longitude: 14.4151, accuracy: 12 } }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')))
    expect(await weatherByLocation()).toEqual({ ok: false, error: 'offline', cached: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))
    expect(await weatherByLocation()).toEqual({ ok: false, error: 'service', cached: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad') } }))
    expect(await weatherByLocation()).toEqual({ ok: false, error: 'service', cached: null })
  })

  it('succeeds: rounded requests, interpolated elevation, cache without the exact position', async () => {
    geo((ok) => ok({ coords: { latitude: 50.0851, longitude: 14.4151, accuracy: 12 } }))
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        if (url.includes('/elevation')) return { ok: true, json: async () => ({ elevation: Array.from({ length: 100 }, () => 208) }) }
        return {
          ok: true,
          json: async () => ({ current: { time: '2026-10-31T14:05', temperature_2m: 10, relative_humidity_2m: 76, surface_pressure: 1003.5 } }),
        }
      }),
    )
    const r = await weatherByLocation()
    expect(r).toMatchObject({ ok: true, cell: { lat: 50.09, lon: 14.42 }, elevationM: 208, latitudeDeg: 50.0851, accuracyM: 12 })
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('latitude=50.09&longitude=14.42&elevation=208')
    expect(calls.join()).not.toContain('50.0851')
    const stored = localStorage.getItem(KEY)!
    expect(stored).not.toContain('50.0851')
    expect(stored).not.toContain('latitudeDeg')
    expect(JSON.parse(stored)).toMatchObject({ cell: { lat: 50.09, lon: 14.42 }, elevationM: 208, tempC: 10 })
  })

  it('getCurrentPosition throwing synchronously maps to "unavailable"', async () => {
    vi.stubGlobal('fetch', vi.fn())
    geo(() => {
      throw new Error('Permissions-Policy')
    })
    expect(await weatherByLocation()).toEqual({ ok: false, error: 'unavailable' })
  })

  it('times out a stalled request as "offline"', async () => {
    vi.useFakeTimers()
    try {
      geo((ok) => ok({ coords: { latitude: 50.0851, longitude: 14.4151, accuracy: 12 } }))
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: { signal?: AbortSignal }) =>
            new Promise((_res, rej) => {
              init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
            }),
        ),
      )
      const p = weatherByLocation()
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
      expect(await p).toEqual({ ok: false, error: 'offline', cached: null })
    } finally {
      vi.useRealTimers()
    }
  })

  it('still succeeds when localStorage.setItem throws', async () => {
    geo((ok) => ok({ coords: { latitude: 50.0851, longitude: 14.4151, accuracy: 12 } }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/elevation')
          ? { ok: true, json: async () => ({ elevation: Array.from({ length: 100 }, () => 208) }) }
          : { ok: true, json: async () => ({ current: { time: '2026-10-31T14:05', temperature_2m: 10, relative_humidity_2m: 76, surface_pressure: 1003.5 } }) },
      ),
    )
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(await weatherByLocation()).toMatchObject({ ok: true, elevationM: 208 })
  })

  describe('the cache step', () => {
    const where = () => geo((ok) => ok({ coords: { latitude: 50.0851, longitude: 14.4151, accuracy: 12 } }))
    const entry = (fetchedAt: number, cell = { lat: 50.09, lon: 14.42 }) => ({
      cell, elevationM: 208, tempC: 10, humidityPct: 76, stationPressureHPa: 1003.5, modelTime: '2026-10-31T14:05', fetchedAt, windMs10: 3, windFromDeg: 180,
    })
    const NOW = 10_000_000
    const MINUTE = 60_000

    it('a fresh cache for the cell answers without any request', async () => {
      where()
      const f = vi.fn()
      vi.stubGlobal('fetch', f)
      localStorage.setItem(KEY, JSON.stringify(entry(NOW - 10 * MINUTE)))
      const r = await weatherByLocation(NOW)
      expect(f).not.toHaveBeenCalled()
      expect(r).toMatchObject({
        ok: true, cached: true, cell: { lat: 50.09, lon: 14.42 }, elevationM: 208, latitudeDeg: 50.0851, accuracyM: 12,
        weather: { tempC: 10, stationPressureHPa: 1003.5, fetchedAt: NOW - 10 * MINUTE },
      })
    })

    it('a fresh cache without wind goes to the network, a fresh one with wind does not', async () => {
      where()
      const f = vi.fn(async (url: string) =>
        url.includes('/elevation')
          ? { ok: true, json: async () => ({ elevation: Array.from({ length: 100 }, () => 208) }) }
          : { ok: true, json: async () => ({ current: { time: '2026-10-31T14:05', temperature_2m: 5, relative_humidity_2m: 50, surface_pressure: 990, wind_speed_10m: 2, wind_direction_10m: 90 } }) })
      vi.stubGlobal('fetch', f)
      localStorage.setItem(KEY, JSON.stringify({ ...entry(NOW - 10 * MINUTE), windMs10: null, windFromDeg: null }))
      const r = await weatherByLocation(NOW)
      expect(f).toHaveBeenCalled()
      expect(r).toMatchObject({ ok: true, weather: { windMs10: 2, windFromDeg: 90 } })
      expect((r as { cached?: boolean }).cached).toBeUndefined()
      f.mockClear()
      localStorage.setItem(KEY, JSON.stringify({ ...entry(NOW - 10 * MINUTE), windMs10: 4, windFromDeg: 270 }))
      expect(await weatherByLocation(NOW)).toMatchObject({ ok: true, cached: true, weather: { windMs10: 4, windFromDeg: 270 } })
      expect(f).not.toHaveBeenCalled()
    })

    it('an aging cache is not enough: the request goes out and a success is not marked cached', async () => {
      where()
      const f = vi.fn(async (url: string) =>
        url.includes('/elevation')
          ? { ok: true, json: async () => ({ elevation: Array.from({ length: 100 }, () => 300) }) }
          : { ok: true, json: async () => ({ current: { time: '2026-10-31T14:05', temperature_2m: 5, relative_humidity_2m: 50, surface_pressure: 990 } }) })
      vi.stubGlobal('fetch', f)
      localStorage.setItem(KEY, JSON.stringify(entry(NOW - 60 * MINUTE)))
      const r = await weatherByLocation(NOW)
      expect(f).toHaveBeenCalledTimes(2)
      expect(r).toMatchObject({ ok: true, elevationM: 300 })
      expect((r as { cached?: boolean }).cached).toBeUndefined()
    })

    it('a fresh cache of another cell is ignored', async () => {
      where()
      const f = vi.fn().mockRejectedValue(new TypeError('net'))
      vi.stubGlobal('fetch', f)
      localStorage.setItem(KEY, JSON.stringify(entry(NOW - MINUTE, { lat: 51, lon: 14.42 })))
      expect(await weatherByLocation(NOW)).toEqual({ ok: false, error: 'offline', cached: null })
      expect(f).toHaveBeenCalled()
    })

    describe('a manual altitude (C1)', () => {
      const forecastOnly = () => {
        const calls: string[] = []
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
          calls.push(url)
          if (url.includes('/elevation')) return { ok: true, json: async () => ({ elevation: Array.from({ length: 100 }, () => 208) }) }
          return { ok: true, json: async () => ({ current: { time: '2026-10-31T14:05', temperature_2m: 6, relative_humidity_2m: 70, surface_pressure: 957.5 } }) }
        }))
        return calls
      }

      it('is sent as elevation= and the grid request is skipped', async () => {
        where()
        const calls = forecastOnly()
        const r = await weatherByLocation(NOW, { elevationM: 600 })
        expect(calls).toHaveLength(1)
        expect(calls[0]).toContain('/v1/forecast?latitude=50.09&longitude=14.42&elevation=600&')
        expect(r).toMatchObject({ ok: true, elevationM: 600, weather: { stationPressureHPa: 957.5 } })
        expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ elevationM: 600 })
      })

      it('reuses the same-cell cache only when it is for that altitude', async () => {
        where()
        const calls = forecastOnly()
        localStorage.setItem(KEY, JSON.stringify(entry(NOW - 10 * MINUTE)))
        expect(await weatherByLocation(NOW, { elevationM: 600 })).toMatchObject({ ok: true, elevationM: 600 })
        expect(calls).toHaveLength(1)
        localStorage.setItem(KEY, JSON.stringify({ ...entry(NOW - 10 * MINUTE), elevationM: 600 }))
        expect(await weatherByLocation(NOW, { elevationM: 600 })).toMatchObject({ ok: true, cached: true, elevationM: 600 })
        expect(calls).toHaveLength(1)
      })

      it('a cache for another altitude is no fallback either', async () => {
        where()
        localStorage.setItem(KEY, JSON.stringify(entry(NOW - 90 * MINUTE)))
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')))
        expect(await weatherByLocation(NOW, { elevationM: 600 })).toEqual({ ok: false, error: 'offline', cached: null })
        expect(await weatherByLocation(NOW)).toMatchObject({ ok: false, error: 'offline', cached: { elevationM: 208 } })
      })
    })

    it('offline and service failures carry the cache under 3 h, and null when it is older', async () => {
      where()
      localStorage.setItem(KEY, JSON.stringify(entry(NOW - 90 * MINUTE)))
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('net')))
      expect(await weatherByLocation(NOW)).toMatchObject({ ok: false, error: 'offline', cached: { elevationM: 208, fetchedAt: NOW - 90 * MINUTE } })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))
      expect(await weatherByLocation(NOW)).toMatchObject({ ok: false, error: 'service', cached: { tempC: 10 } })
      localStorage.setItem(KEY, JSON.stringify(entry(NOW - 200 * MINUTE)))
      expect(await weatherByLocation(NOW)).toEqual({ ok: false, error: 'service', cached: null })
    })
  })
})

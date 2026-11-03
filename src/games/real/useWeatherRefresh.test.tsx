import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_MS } from './weather'
import { updateStation, useStation } from './station'
import { resetRefreshAttempt, useWeatherRefresh } from './useWeatherRefresh'

const MIN = 60_000
const T0 = new Date('2026-11-03T12:00:00Z').getTime()
const origGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
const origPerm = Object.getOwnPropertyDescriptor(navigator, 'permissions')
const getPosition = vi.fn()
let fetchMock: ReturnType<typeof vi.fn>
let visibility: 'visible' | 'hidden' = 'visible'

function Harness() {
  useWeatherRefresh()
  const [s] = useStation()
  return <output data-testid="fetched">{s.model?.fetchedAt ?? 'none'}</output>
}
const storedStation = () => JSON.parse(localStorage.getItem('gb.real.station') ?? '{}')
const fetchedAt = () => storedStation().model?.fetchedAt
const forecastCalls = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/forecast'))
const elevationCalls = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/elevation'))

function permission(state: PermissionState | 'missing') {
  if (state === 'missing') Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
  else Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state }) } })
}
const setProfile = (over: Record<string, unknown> = {}) =>
  localStorage.setItem('gb.real.profile', JSON.stringify({ locationNoteSeen: true, weatherAutoRefresh: true, ...over }))
const seedCache = (over: Record<string, unknown> = {}) =>
  localStorage.setItem('gb.real.weather', JSON.stringify({
    cell: { lat: 50.09, lon: 14.42 }, elevationM: 300, tempC: 4, humidityPct: 60, stationPressureHPa: 980,
    windMs10: 2, windFromDeg: 90, modelTime: '2026-11-03T12:00', fetchedAt: T0, ...over,
  }))
const seedStation = (ageMin: number | null, extra: Record<string, unknown> = {}) =>
  localStorage.setItem('gb.real.station', JSON.stringify({
    v: 1,
    ...(ageMin === null ? {} : { model: { time: '2026-11-03T12:00', fetchedAt: T0 - ageMin * MIN } }),
    ...extra,
  }))
const mount = () => render(<Harness />)
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const show = (v: 'visible' | 'hidden') => act(async () => {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(0)
})
const okForecast = { ok: true, json: async () => ({ current: { time: '2026-11-03T12:30', temperature_2m: 9, relative_humidity_2m: 70, surface_pressure: 990, wind_speed_10m: 3, wind_direction_10m: 180 } }) }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(T0)
  localStorage.clear()
  resetRefreshAttempt()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  vi.stubGlobal('isSecureContext', true)
  getPosition.mockReset()
  getPosition.mockImplementation((ok: (p: unknown) => void) => ok({ coords: { latitude: 50.0851, longitude: 14.4151, accuracy: 12 } }))
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition } })
  permission('prompt')
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/elevation')) return { ok: true, json: async () => ({ elevation: Array.from({ length: 100 }, () => 208) }) }
    return okForecast
  })
  vi.stubGlobal('fetch', fetchMock)
  setProfile()
  seedCache()
  seedStation(0)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (origGeo) Object.defineProperty(navigator, 'geolocation', origGeo)
  else delete (navigator as unknown as Record<string, unknown>).geolocation
  if (origPerm) Object.defineProperty(navigator, 'permissions', origPerm)
  else delete (navigator as unknown as Record<string, unknown>).permissions
})

describe('useWeatherRefresh', () => {
  it('refreshes every REFRESH_MS: one forecast request, the model time moves', async () => {
    mount()
    await tick(REFRESH_MS - 1)
    expect(fetchMock).not.toHaveBeenCalled()
    await tick(1)
    expect(forecastCalls()).toHaveLength(1)
    expect(fetchedAt()).toBe(T0 + REFRESH_MS)
    expect(storedStation().model.time).toBe('2026-11-03T12:30')
  })

  it('does nothing before the location note was seen, with the switch off, or with no cache', async () => {
    setProfile({ locationNoteSeen: false })
    mount()
    await tick(REFRESH_MS * 2)
    cleanup()
    setProfile({ weatherAutoRefresh: false })
    mount()
    await tick(REFRESH_MS * 2)
    cleanup()
    setProfile()
    localStorage.removeItem('gb.real.weather')
    mount()
    await tick(REFRESH_MS * 2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing while the page is hidden', async () => {
    visibility = 'hidden'
    mount()
    await tick(REFRESH_MS * 2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes at once when the page becomes visible with weather 20 minutes old, not when it is 5 minutes old', async () => {
    visibility = 'hidden'
    seedCache({ fetchedAt: T0 - 20 * MIN })
    seedStation(20)
    mount()
    await show('visible')
    expect(forecastCalls()).toHaveLength(1)
    expect(fetchedAt()).toBe(T0)
    cleanup()
    fetchMock.mockClear()
    seedStation(5)
    visibility = 'hidden'
    mount()
    await show('visible')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('after Standard atmosphere (no model) nothing refreshes, not by the clock and not on becoming visible', async () => {
    seedCache({ fetchedAt: T0 - 20 * MIN })
    seedStation(null)
    mount()
    await tick(REFRESH_MS * 2)
    await show('hidden')
    await show('visible')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the 15 minutes count from the last fetch: a manual load at minute 10 moves the next request to minute 25', async () => {
    mount()
    await tick(10 * MIN)
    act(() => { updateStation(() => ({ model: { time: '2026-11-03T12:10', fetchedAt: T0 + 10 * MIN } })) })
    await tick(14 * MIN)
    expect(fetchMock).not.toHaveBeenCalled()
    await tick(1 * MIN)
    expect(forecastCalls()).toHaveLength(1)
  })

  it('a failed attempt is not retried for 15 minutes', async () => {
    fetchMock.mockRejectedValue(new TypeError('net'))
    mount()
    await tick(REFRESH_MS)
    const n = fetchMock.mock.calls.length
    expect(n).toBeGreaterThan(0)
    await tick(REFRESH_MS - MIN)
    await show('hidden')
    await show('visible')
    expect(fetchMock.mock.calls.length).toBe(n)
    await tick(MIN)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(n)
  })

  it('at mount with a model 15+ minutes old: a request at once', async () => {
    seedCache({ fetchedAt: T0 - 20 * MIN })
    seedStation(20)
    mount()
    await tick(0)
    expect(forecastCalls()).toHaveLength(1)
  })

  it('a stale model (3 h) is left to age without a granted permission, and refreshed by position with one', async () => {
    seedCache({ fetchedAt: T0 - 181 * MIN })
    seedStation(181)
    mount()
    await tick(REFRESH_MS)
    expect(fetchMock).not.toHaveBeenCalled()
    cleanup()
    resetRefreshAttempt()
    permission('granted')
    mount()
    await tick(0)
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(forecastCalls()).toHaveLength(1)
  })

  it.each(['prompt', 'missing'] as const)('with permission %s: no geolocation, the cached cell, no elevation request', async (state) => {
    permission(state)
    mount()
    await tick(REFRESH_MS)
    expect(getPosition).not.toHaveBeenCalled()
    expect(elevationCalls()).toHaveLength(0)
    const urls = forecastCalls()
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('latitude=50.09&longitude=14.42&elevation=300&')
  })

  it('with permission granted: asks for the position', async () => {
    permission('granted')
    mount()
    await tick(REFRESH_MS)
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(forecastCalls()).toHaveLength(1)
  })

  it('a typed altitude is the forecast elevation when the position is used', async () => {
    permission('granted')
    seedStation(0, { altitudeM: { value: 700, source: 'manual' } })
    mount()
    await tick(REFRESH_MS)
    expect(elevationCalls()).toHaveLength(0)
    expect(forecastCalls()[0]).toContain('elevation=700&')
  })

  it('keeps a hand-typed temperature', async () => {
    seedStation(0, { tempC: { value: -3, source: 'manual' } })
    mount()
    await tick(REFRESH_MS)
    expect(storedStation().tempC).toEqual({ value: -3, source: 'manual' })
    expect(storedStation().humidityPct.source).toBe('model')
  })

  it('a failing fetch leaves the station as it was', async () => {
    fetchMock.mockRejectedValue(new TypeError('net'))
    mount()
    const before = localStorage.getItem('gb.real.station')
    await tick(REFRESH_MS)
    expect(fetchMock).toHaveBeenCalled()
    expect(localStorage.getItem('gb.real.station')).toBe(before)
  })

  it('runs one refresh at a time', async () => {
    let release: () => void = () => {}
    fetchMock.mockImplementation(async () => {
      await new Promise<void>((r) => { release = r })
      return okForecast
    })
    mount()
    await tick(REFRESH_MS)
    await tick(REFRESH_MS / 2)
    await show('hidden')
    await show('visible')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release()
    await tick(0)
  })
})

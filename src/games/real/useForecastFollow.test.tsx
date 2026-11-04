import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRoute } from '../../router'
import { SettingsProvider } from '../../settings/SettingsContext'
import { ForecastLine } from './components/controls'
import { forecastOffer } from './forecastWind'
import { useRealProfile } from './profile'
import { DEFAULT_SETUP, type RealSetup } from './setup'
import { STANDARD_STATION, updateStation, type Station } from './station'
import { useForecastFollow } from './useForecastFollow'
import { FLASH_MS, flashWindHour } from './windFlash'
import { saveWindMemory } from './windMemory'

const NOW = Date.now()
const latest = { current: DEFAULT_SETUP }
const updates = vi.fn()
let setProfile: ReturnType<typeof useRealProfile>[1]
let setHand: (p: Partial<RealSetup>) => void

const model = (over: Partial<NonNullable<Station['model']>> = {}) =>
  ({ time: '2026-11-03T12:00', fetchedAt: NOW, windMs10: 3.1, windFromDeg: 125, ...over })
const seed = (over: { azimuth?: number | null; model?: Station['model'] } = {}) => localStorage.setItem('gb.real.station', JSON.stringify({
  v: 1,
  heightAboveGroundM: { value: 1, source: 'manual' },
  ...(over.azimuth === null ? {} : { azimuthDeg: { value: over.azimuth ?? 180, source: 'manual' } }),
  model: over.model ?? model(),
}))
const setMode = (forecastWind: 'tap' | 'auto') => localStorage.setItem('gb.real.profile', JSON.stringify({ forecastWind }))

function Harness({ start }: { start?: Partial<RealSetup> }) {
  const [route, navigate] = useRoute()
  const [setup, setSetup] = useState<RealSetup>({ ...DEFAULT_SETUP, windSet: false, ...start })
  const [, setP] = useRealProfile()
  useEffect(() => { latest.current = setup })
  const update = (patch: Partial<RealSetup>) => { updates(patch); setSetup((s) => ({ ...s, ...patch })) }
  useEffect(() => { setProfile = setP; setHand = update })
  useForecastFollow(setup, update, NOW)
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <ForecastLine setup={setup} update={update} now={NOW} onNeedDirection={() => {}} />
    </SettingsProvider>
  )
}
const mount = (start?: Partial<RealSetup>) => render(<Harness start={start} />)
const offerNow = (unit: 'm/s' | 'km/h' = 'm/s') =>
  forecastOffer({ ...STANDARD_STATION, ...JSON.parse(localStorage.getItem('gb.real.station')!) }, NOW, unit)!

beforeEach(() => {
  localStorage.clear()
  window.location.hash = '#/real/workbench'
  updates.mockClear()
})
afterEach(() => {
  cleanup()
  // The flash is module state with a timer: run it out so nothing leaks into the next test.
  vi.useFakeTimers()
  flashWindHour(1)
  vi.advanceTimersByTime(FLASH_MS)
  vi.useRealTimers()
  saveWindMemory(null)
  localStorage.clear()
})

describe('useForecastFollow', () => {
  it('tap mode never changes the wind', () => {
    seed()
    mount()
    expect(latest.current.windSet).toBe(false)
    expect(updates).not.toHaveBeenCalled()
  })

  it('auto with the wind unset sets the offer', () => {
    seed(); setMode('auto')
    mount()
    expect(latest.current).toMatchObject({ windSet: true, windClock: 10, windMs: offerNow().speedMs })
  })

  it('a hand change holds against a new model, and Use hands the wind back', () => {
    seed(); setMode('auto')
    mount()
    act(() => setHand({ windMs: 5 }))
    act(() => updateStation(() => ({ model: model({ windFromDeg: 200 }) })))
    expect(latest.current).toMatchObject({ windMs: 5, windClock: 10 })
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(latest.current.windClock).toBe(1)
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull()
  })

  it('auto leaves a zone\'s own wind as it was', () => {
    seed(); setMode('auto')
    mount({ zonesOn: true, distanceM: 700, windFar: { ms: 7, clock: 2 } })
    act(() => updateStation(() => ({ model: model({ windFromDeg: 200 }) })))
    expect(latest.current).toMatchObject({ windSet: true, windClock: 1, windFar: { ms: 7, clock: 2 } })
    expect(updates.mock.calls.every(([p]) => !('windFar' in p) && !('windMid' in p))).toBe(true)
  })

  it('a setup from a link with a wind counts as hand', () => {
    seed(); setMode('auto')
    mount({ windSet: true, windMs: 4, windClock: 3 })
    expect(latest.current).toMatchObject({ windMs: 4, windClock: 3 })
    expect(updates).not.toHaveBeenCalled()
  })

  it('applies nothing without an azimuth or with a stale model', () => {
    seed({ azimuth: null }); setMode('auto')
    mount()
    expect(latest.current.windSet).toBe(false)
    cleanup()
    seed({ model: model({ fetchedAt: NOW - 3 * 3600_000 }) })
    mount()
    expect(latest.current.windSet).toBe(false)
  })

  it('a new height re-applies the speed', () => {
    seed(); setMode('auto')
    mount()
    const before = latest.current.windMs
    act(() => updateStation(() => ({ heightAboveGroundM: { value: 10, source: 'manual' } })))
    expect(latest.current.windMs).toBeGreaterThan(before)
    expect(latest.current.windMs).toBe(forecastOffer({ ...STANDARD_STATION, heightAboveGroundM: { value: 10, source: 'manual' }, azimuthDeg: { value: 180, source: 'manual' }, model: model() }, NOW, 'm/s')!.speedMs)
  })

  it('switching the wind unit applies the snapped offer once', () => {
    seed(); setMode('auto')
    mount()
    updates.mockClear()
    act(() => setProfile({ windUnit: 'km/h' }))
    expect(updates).toHaveBeenCalledTimes(1)
    expect(latest.current.windMs).toBe(offerNow('km/h').speedMs)
    act(() => updateStation(() => ({})))
    expect(updates).toHaveBeenCalledTimes(1)
  })

  it('says it follows, without Use', () => {
    seed(); setMode('auto')
    mount()
    expect(screen.getByText('Wind from the forecast near the ground: ≈ 2 m/s from SE (10 o’clock)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull()
  })
})

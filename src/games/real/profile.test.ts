import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_REAL_PROFILE, effectiveAimMode, readRealProfile } from './profile'

describe('useRealProfile', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear() })

  it('merges a partial effects patch with the current effects', async () => {
    const { useRealProfile } = await import('./profile')
    const { result } = renderHook(() => useRealProfile())
    act(() => result.current[1]({ effects: { coriolis: false } }))
    act(() => result.current[1]({ effects: { spinDrift: false } }))
    expect(result.current[0].effects).toMatchObject({ coriolis: false, spinDrift: false, humidity: true })
  })
})

describe('readRealProfile', () => {
  it('falls back to the defaults for garbage', () => {
    expect(readRealProfile(null)).toEqual(DEFAULT_REAL_PROFILE)
    expect(readRealProfile([1])).toEqual(DEFAULT_REAL_PROFILE)
    expect(DEFAULT_REAL_PROFILE).toMatchObject({ mode: 'dial', windSigmaMs: 1, holdSigmaMrad: 0.05, bcSdPct: 1, windUnit: 'm/s' })
    expect(Object.values(DEFAULT_REAL_PROFILE.effects).every(Boolean)).toBe(true)
  })

  it('drops bad values and clamps numbers; a wind uncertainty outside the stepper\'s 0.5-3 is dropped, not clamped', () => {
    const p = readRealProfile({ mode: 'x', windUnit: 'furlongs', windSigmaMs: -3, bcSdPct: 'a', effects: { coriolis: false, spinDrift: 'no' } })
    expect(p.mode).toBe('dial')
    expect(p.windUnit).toBe('m/s')
    expect(p.windSigmaMs).toBe(1)
    expect(p.bcSdPct).toBe(1)
    expect(p.effects.coriolis).toBe(false)
    expect(p.effects.spinDrift).toBe(true)
    expect(readRealProfile({ windSigmaMs: 10 }).windSigmaMs).toBe(1)
    expect(readRealProfile({ windSigmaMs: 0.2 }).windSigmaMs).toBe(1)
    expect(readRealProfile({ windSigmaMs: 3 }).windSigmaMs).toBe(3)
    expect(readRealProfile({ windSigmaMs: 0.5 }).windSigmaMs).toBe(0.5)
  })
})

describe('readRealProfile: measuring with the phone', () => {
  it('defaults the three new fields', () => {
    const p = readRealProfile({})
    expect([p.aimMode, p.forecastWind, p.weatherAutoRefresh]).toEqual(['simple', 'tap', true])
  })
  it('falls back to the defaults on values it could not have written', () => {
    const p = readRealProfile({ aimMode: 'x', forecastWind: 1, weatherAutoRefresh: 'no' })
    expect([p.aimMode, p.forecastWind, p.weatherAutoRefresh]).toEqual(['simple', 'tap', true])
  })
  it('reads the stored values, and a 0.1.6 profile keeps its fields and gains the defaults', () => {
    const p = readRealProfile({ aimMode: 'camera', forecastWind: 'auto', weatherAutoRefresh: false })
    expect([p.aimMode, p.forecastWind, p.weatherAutoRefresh]).toEqual(['camera', 'auto', false])
    const old = readRealProfile({ v: 1, mode: 'hold', primary: 'clicks', windUnit: 'kn', windSigmaMs: 2, locationNoteSeen: true })
    expect(old).toMatchObject({ mode: 'hold', primary: 'clicks', windUnit: 'kn', windSigmaMs: 2, locationNoteSeen: true, aimMode: 'simple', forecastWind: 'tap', weatherAutoRefresh: true })
  })
})

describe('readRealProfile: the big figure', () => {
  it('takes clicks only for exactly clicks', () => {
    expect(DEFAULT_REAL_PROFILE.primary).toBe('value')
    expect(readRealProfile({ primary: 'clicks' }).primary).toBe('clicks')
    expect(readRealProfile({ primary: 'Clicks' }).primary).toBe('value')
  })

  it('a corrupt primary falls back to value and leaves the other fields alone', () => {
    const p = readRealProfile({ primary: 7, mode: 'hold', windUnit: 'kn' })
    expect(p.primary).toBe('value')
    expect(p.mode).toBe('hold')
    expect(p.windUnit).toBe('kn')
  })

  it('a 0.1.7 profile with a stored aimMode reads as not chosen', () => {
    expect(readRealProfile({ aimMode: 'simple' }).aimChosen).toBe(false)
    expect(readRealProfile({ aimMode: 'camera' }).aimChosen).toBe(false)
    expect(readRealProfile({ aimMode: 'simple', aimChosen: true }).aimChosen).toBe(true)
  })

  it('the effective aim mode follows where the app runs until one is chosen', () => {
    const p = readRealProfile({ aimMode: 'simple' })
    expect(effectiveAimMode(p, true)).toBe('camera')
    expect(effectiveAimMode(p, false)).toBe('simple')
    const chosen = readRealProfile({ aimMode: 'simple', aimChosen: true })
    expect(effectiveAimMode(chosen, true)).toBe('simple')
    expect(effectiveAimMode(readRealProfile({ aimMode: 'camera', aimChosen: true }), false)).toBe('camera')
  })
})

describe('guideSeen', () => {
  it('reads false from a 0.1.10 profile, true only for a stored true', () => {
    expect(readRealProfile({ mode: 'hold', windUnit: 'kn' }).guideSeen).toBe(false)
    expect(readRealProfile({ guideSeen: true }).guideSeen).toBe(true)
    expect(readRealProfile({ guideSeen: 'yes' }).guideSeen).toBe(false)
    expect(DEFAULT_REAL_PROFILE.guideSeen).toBe(false)
  })
})

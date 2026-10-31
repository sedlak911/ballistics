import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_REAL_PROFILE, readRealProfile } from './profile'

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

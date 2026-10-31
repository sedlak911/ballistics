import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Every store keeps a module-level cache, so each test loads a fresh copy.
const STORES = [
  { key: 'gb.real.profiles', load: async () => { const m = await import('./profiles'); return { use: m.useOverrides, patch: (set: (a: never, b: never) => void) => set('p1' as never, { zeroM: 200 } as never), def: {}, saved: { p1: { zeroM: 200 } } } } },
  { key: 'gb.real.profile', load: async () => { const m = await import('./profile'); return { use: m.useRealProfile, patch: (set: (a: never) => void) => set({ mode: 'hold' } as never), def: m.DEFAULT_REAL_PROFILE, saved: { ...m.DEFAULT_REAL_PROFILE, mode: 'hold' } } } },
  { key: 'gb.real.station', load: async () => { const m = await import('./station'); return { use: m.useStation, patch: (set: (a: never) => void) => set({ azimuthDeg: { value: 90, source: 'manual' } } as never), def: m.STANDARD_STATION, saved: { ...m.STANDARD_STATION, azimuthDeg: { value: 90, source: 'manual' } } } } },
]

beforeEach(() => { vi.resetModules(); localStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe.each(STORES)('the $key store', ({ key, load }) => {
  it('gives the defaults for missing and corrupt storage', async () => {
    const s = await load()
    expect(renderHook(() => (s.use as () => unknown[])()).result.current[0]).toEqual(s.def)
    localStorage.setItem(key, '{not json')
    vi.resetModules()
    const s2 = await load()
    expect(renderHook(() => (s2.use as () => unknown[])()).result.current[0]).toEqual(s2.def)
  })

  it('still works for the page view when storage throws', async () => {
    const boom = () => { throw new Error('blocked') }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom, clear: boom })
    const s = await load()
    const { result } = renderHook(() => (s.use as () => [unknown, (...a: never[]) => void])())
    act(() => s.patch(result.current[1] as never))
    expect(result.current[0]).toEqual(s.saved)
  })

  it('keeps a change in storage', async () => {
    const s = await load()
    const { result } = renderHook(() => (s.use as () => [unknown, (...a: never[]) => void])())
    act(() => s.patch(result.current[1] as never))
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(key.endsWith('profiles') ? { presets: s.saved } : s.saved)
    vi.resetModules()
    const s2 = await load()
    expect(renderHook(() => (s2.use as () => unknown[])()).result.current[0]).toEqual(s2.saved)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readWindMemory, saveWindMemory, windMemoryNow, type WindMemory } from './windMemory'

const good: WindMemory = { fromDeg: 125, hour: 10, speedMs: 4, source: 'hand' }

describe('wind memory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })
  it('turns garbage into null', () => {
    expect(readWindMemory('x')).toBeNull()
    expect(readWindMemory(null)).toBeNull()
    expect(readWindMemory({ ...good, hour: 13 })).toBeNull()
    expect(readWindMemory({ ...good, hour: 2.5 })).toBeNull()
    expect(readWindMemory({ ...good, speedMs: 30 })).toBeNull()
    expect(readWindMemory({ ...good, source: 'x' })).toBeNull()
  })
  it('keeps the rest when only fromDeg is bad', () => {
    expect(readWindMemory({ ...good, fromDeg: 400 })).toEqual({ ...good, fromDeg: null })
    expect(readWindMemory({ ...good, fromDeg: null })).toEqual({ ...good, fromDeg: null })
    expect(readWindMemory(good)).toEqual(good)
  })
  it('round-trips and clears', () => {
    saveWindMemory({ fromDeg: 0, hour: 12, speedMs: 0, source: 'forecast' })
    expect(windMemoryNow()).toEqual({ fromDeg: 0, hour: 12, speedMs: 0, source: 'forecast' })
    saveWindMemory(null)
    expect(windMemoryNow()).toBeNull()
  })
  it('survives corrupt storage', () => {
    localStorage.setItem('gb.real.wind', '{nope')
    expect(windMemoryNow()).toBeNull()
  })
  it('survives blocked storage', () => {
    const boom = () => { throw new Error('blocked') }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom })
    expect(windMemoryNow()).toBeNull()
    expect(() => saveWindMemory(good)).not.toThrow()
  })
})

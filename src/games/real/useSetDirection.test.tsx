import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETUP, type RealSetup } from './setup'
import { useSetDirection } from './useSetDirection'
import { saveWindMemory, windMemoryNow } from './windMemory'

const seedDirection = (deg: number) => localStorage.setItem('gb.real.station', JSON.stringify({
  v: 1, heightAboveGroundM: { value: 1, source: 'manual' }, azimuthDeg: { value: deg, source: 'manual' },
}))
const setupOf = (over: Partial<RealSetup>): RealSetup => ({ ...DEFAULT_SETUP, zonesOn: true, distanceM: 1600, ...over })
const turn = (setup: RealSetup, deg: number | null) => {
  const update = vi.fn()
  const { result } = renderHook(() => useSetDirection(setup, update))
  act(() => result.current(deg))
  return update
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  saveWindMemory(null)
  localStorage.clear()
})

describe('useSetDirection with zones', () => {
  it('writes the near hour and a zone\'s turned hour in one update', () => {
    seedDirection(180)
    const update = turn(setupOf({ windSet: true, windClock: 10, windFar: { ms: 6, clock: 10 } }), 274)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({ windClock: 7, windFar: { ms: 6, clock: 7 } })
    expect(windMemoryNow()?.zones).toEqual({ mid: null, far: { fromDeg: 120, hour: 7 } })
  })

  it('never puts a zone without its own wind in the patch', () => {
    seedDirection(180)
    const update = turn(setupOf({ windSet: true, windClock: 10, windFar: { ms: 6, clock: 10 } }), 274)
    expect(update.mock.calls[0][0]).not.toHaveProperty('windMid')
  })

  it('keeps the zones\' memory when only the near wind turns', () => {
    seedDirection(180)
    saveWindMemory({ fromDeg: 100, hour: 10, speedMs: 4, source: 'hand', zones: { mid: null, far: { fromDeg: 250, hour: 3 } } })
    const update = turn(setupOf({ windSet: true, windClock: 10, windFar: { ms: 6, clock: 3 } }), 190)
    expect(update.mock.calls[0][0]).toHaveProperty('windClock')
    expect(windMemoryNow()?.zones?.far).toMatchObject({ fromDeg: 250 })
  })

  it('keeps the zones\' memory while the near wind is unset', () => {
    seedDirection(180)
    saveWindMemory({ fromDeg: null, hour: 12, speedMs: 0, source: 'hand', zones: { mid: null, far: { fromDeg: 250, hour: 3 } } })
    turn(setupOf({ windSet: false, windFar: { ms: 6, clock: 3 } }), 190)
    expect(windMemoryNow()?.zones?.far?.fromDeg).toBe(250)
  })

  it('makes a memory for a zone anchor when none exists and the near wind is unset', () => {
    seedDirection(180)
    turn(setupOf({ windSet: false, windFar: { ms: 6, clock: 3 } }), 190)
    expect(windMemoryNow()?.zones?.far).toMatchObject({ hour: 3 })
  })
})

import { useCallback } from 'react'
import type { RealSetup } from './setup'
import { useStation } from './station'
import { flashWindHour } from './windFlash'
import { turnWind } from './windFollow'
import { saveWindMemory, windMemoryNow } from './windMemory'

/**
 * Writes the shooting direction (null clears it) and turns the wind hour with it, so the wind keeps blowing from where it blows.
 * `also` is written in the same update, because two updates in one tick would let the second undo the first.
 */
export function useSetDirection(setup: RealSetup, update: (p: Partial<RealSetup>) => void): (deg: number | null, also?: Partial<RealSetup>) => void {
  const [station, set] = useStation()
  const from = station.azimuthDeg?.value ?? null
  return useCallback((deg: number | null, also?: Partial<RealSetup>) => {
    set({ azimuthDeg: deg === null ? null : { value: deg, source: 'manual' } })
    const { patch, memory } = turnWind(setup, windMemoryNow(), from, deg)
    saveWindMemory(memory)
    const turned = patch?.windClock !== undefined
    if (turned || also) update({ ...patch, ...also })
    if (turned) flashWindHour(patch.windClock!)
  }, [setup, update, from, set])
}

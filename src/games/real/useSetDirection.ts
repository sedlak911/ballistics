import { useCallback } from 'react'
import type { RealSetup } from './setup'
import { useStation } from './station'
import { flashWindHour } from './windFlash'
import { turnWind, turnZones } from './windFollow'
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
    const mem = windMemoryNow()
    const near = turnWind(setup, mem, from, deg)
    const far = turnZones(setup, mem, from, deg)
    // Without a near wind turnWind has no memory of its own to give, but a zone's compass anchor must outlive that: the
    // zones' memory is written whenever there is any, on a plain base if the near part has none, and cleared only when neither exists.
    const base = near.memory ?? (far.zones ? { fromDeg: null, hour: setup.windClock, speedMs: setup.windMs, source: 'hand' as const } : null)
    saveWindMemory(base === null ? null : { ...base, zones: far.zones ?? base.zones })
    const patch = { ...near.patch, ...far.patch }
    const turned = patch.windClock !== undefined
    const zonesTurned = patch.windMid !== undefined || patch.windFar !== undefined
    if (turned || zonesTurned || also) update({ ...patch, ...also })
    if (turned) flashWindHour(patch.windClock!)
  }, [setup, update, from, set])
}

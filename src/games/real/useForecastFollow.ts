import { useEffect, useRef } from 'react'
import { forecastOffer } from './forecastWind'
import { useRealProfile } from './profile'
import type { RealSetup } from './setup'
import { useStation } from './station'
import { flashWindHour } from './windFlash'
import { offerWind, windSource } from './windFollow'
import { saveWindMemory, useWindMemory } from './windMemory'

/**
 * In Automaticky the forecast wind applies by itself, whenever the weather, the direction, the height or the unit
 * change, unless a hand wind (or a link's) is on: that one stays until Use hands it back. Idempotent: once the setup
 * equals the offer, nothing is written, so the next run is a no-op. While `paused` (a link with items this device lacks is
 * on screen) nothing is applied: that write would count as the first edit and drop the link's unknown ids.
 */
export function useForecastFollow(setup: RealSetup, update: (p: Partial<RealSetup>) => void, now: number, { paused = false }: { paused?: boolean } = {}): void {
  const [profile] = useRealProfile()
  const [station] = useStation()
  const mem = useWindMemory()
  const updateNow = useRef(update)
  useEffect(() => { updateNow.current = update })

  useEffect(() => {
    if (profile.forecastWind !== 'auto' || paused) return
    const offer = forecastOffer(station, now, profile.windUnit)
    const from = station.model?.windFromDeg
    if (!offer || offer.hour === null || from == null) return
    if (windSource(setup, mem) === 'hand') return
    const { patch, memory } = offerWind(offer, from, setup, mem, station.azimuthDeg?.value ?? null, false)
    const changes = patch.windMs !== setup.windMs || patch.windClock !== undefined && patch.windClock !== setup.windClock || !setup.windSet
    const memoryChanges = mem === null || mem.fromDeg !== memory.fromDeg || mem.hour !== memory.hour || mem.speedMs !== memory.speedMs || mem.source !== memory.source
    if (memoryChanges) saveWindMemory(memory)
    if (changes) {
      updateNow.current(patch)
      if (setup.windSet && patch.windClock !== undefined && patch.windClock !== setup.windClock) flashWindHour(patch.windClock)
    }
  }, [profile.forecastWind, profile.windUnit, station, setup, mem, now, paused])
}

import { clockHour, type ForecastOffer } from './forecastWind'
import type { RealSetup, ZoneWind } from './setup'
import type { WindMemory } from './windMemory'

// The wind follows the direction: the clock hour is turned with the shooting direction, from where the wind blows by the compass.

const norm = (d: number) => ((d % 360) + 360) % 360

/** Where the wind blows from, while the memory still matches the setup's hour. */
export function liveFromDeg(setup: RealSetup, mem: WindMemory | null): number | null {
  return setup.windSet && mem !== null && mem.hour === setup.windClock ? mem.fromDeg : null
}

/** A link or any hand change of the speed or the hour reads as hand without anyone marking it. */
export function windSource(setup: RealSetup, mem: WindMemory | null): 'unset' | 'hand' | 'forecast' {
  if (!setup.windSet) return 'unset'
  return mem?.source === 'forecast' && mem.hour === setup.windClock && mem.speedMs === setup.windMs ? 'forecast' : 'hand'
}

/** The direction changed from `from` to `to`: the hour that keeps the wind where it blows from. */
export function turnWind(
  setup: RealSetup,
  mem: WindMemory | null,
  from: number | null,
  to: number | null,
): { patch: Partial<RealSetup> | null; memory: WindMemory | null } {
  if (!setup.windSet) return { patch: null, memory: mem }
  const anchored = liveFromDeg(setup, mem) ?? (from !== null ? norm(from + setup.windClock * 30) : null)
  const source = windSource(setup, mem) === 'forecast' ? 'forecast' : 'hand'
  const hour = setup.windClock
  if (to === null) return { patch: null, memory: { fromDeg: anchored, hour, speedMs: setup.windMs, source } }
  if (anchored === null) return { patch: null, memory: { fromDeg: norm(to + hour * 30), hour, speedMs: setup.windMs, source } }
  const next = clockHour(anchored, to)
  return {
    patch: next !== hour ? { windClock: next } : null,
    memory: { fromDeg: anchored, hour: next, speedMs: setup.windMs, source },
  }
}

/** The same for the mid and far zones that have a wind of their own; a zone without one is skipped. */
export function turnZones(
  setup: RealSetup,
  mem: WindMemory | null,
  from: number | null,
  to: number | null,
): { patch: Partial<RealSetup> | null; zones: WindMemory['zones'] } {
  const patch: Partial<RealSetup> = {}
  const turn = (w: ZoneWind | null, key: 'mid' | 'far') => {
    if (w === null) return null
    const m = mem?.zones?.[key]
    const anchored = (m && m.hour === w.clock ? m.fromDeg : null) ?? (from !== null ? norm(from + w.clock * 30) : null)
    if (to === null) return { fromDeg: anchored, hour: w.clock }
    if (anchored === null) return { fromDeg: norm(to + w.clock * 30), hour: w.clock }
    const next = clockHour(anchored, to)
    if (next !== w.clock) patch[key === 'mid' ? 'windMid' : 'windFar'] = { ...w, clock: next }
    return { fromDeg: anchored, hour: next }
  }
  const mid = turn(setup.windMid, 'mid')
  const far = turn(setup.windFar, 'far')
  return { patch: Object.keys(patch).length > 0 ? patch : null, zones: mid === null && far === null ? undefined : { mid, far } }
}

/** Use on a forecast offer (precondition: `offer.calm || offer.hour !== null`). A calm keeps the hour. */
export function offerWind(
  offer: ForecastOffer,
  modelFromDeg: number,
  setup: RealSetup,
  mem: WindMemory | null,
  directionDeg: number | null,
  allZones: boolean,
): { patch: Partial<RealSetup>; memory: WindMemory } {
  // The tap on a zoned setup fills every zone; the automatic forecast leaves a zone's own wind alone.
  const zonesPatch: Partial<RealSetup> = allZones ? { windMid: null, windFar: null } : {}
  const zones = allZones || !mem?.zones ? {} : { zones: mem.zones }
  if (!offer.calm && offer.hour !== null) {
    return {
      patch: { windMs: offer.speedMs, windClock: offer.hour, windSet: true, ...zonesPatch },
      memory: { fromDeg: modelFromDeg, hour: offer.hour, speedMs: offer.speedMs, source: 'forecast', ...zones },
    }
  }
  const fromDeg = liveFromDeg(setup, mem) ?? (directionDeg !== null && setup.windSet ? norm(directionDeg + setup.windClock * 30) : null)
  return {
    patch: { windMs: offer.speedMs, windSet: true, ...zonesPatch },
    memory: { fromDeg, hour: setup.windClock, speedMs: offer.speedMs, source: 'forecast', ...zones },
  }
}

import { clockHour, type ForecastOffer } from './forecastWind'
import type { RealSetup } from './setup'
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

/** Use on a forecast offer (precondition: `offer.calm || offer.hour !== null`). A calm keeps the hour. */
export function offerWind(
  offer: ForecastOffer,
  modelFromDeg: number,
  setup: RealSetup,
  mem: WindMemory | null,
  directionDeg: number | null,
): { patch: Partial<RealSetup>; memory: WindMemory } {
  if (!offer.calm && offer.hour !== null) {
    return {
      patch: { windMs: offer.speedMs, windClock: offer.hour, windSet: true },
      memory: { fromDeg: modelFromDeg, hour: offer.hour, speedMs: offer.speedMs, source: 'forecast' },
    }
  }
  const fromDeg = liveFromDeg(setup, mem) ?? (directionDeg !== null && setup.windSet ? norm(directionDeg + setup.windClock * 30) : null)
  return {
    patch: { windMs: offer.speedMs, windSet: true },
    memory: { fromDeg, hour: setup.windClock, speedMs: offer.speedMs, source: 'forecast' },
  }
}

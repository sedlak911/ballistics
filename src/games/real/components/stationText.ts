import { ISA_SEA_LEVEL, isaStationPressureHPa } from '../../../engine/atmosphere'
import type { PRESSURE_TO_HPA } from '../../../engine/units'
import { freshness, type Freshness } from '../weather'
import type { Station, StationSource } from '../station'

export type PressureUnit = keyof typeof PRESSURE_TO_HPA
export const FT_M = 0.3048
/** Decimals shown for the pressure in each unit. */
export const PRESSURE_DIGITS: Record<PressureUnit, number> = { hPa: 1, inHg: 2, mmHg: 1, psi: 2 }
export const LINE_DIGITS: Record<PressureUnit, number> = { hPa: 0, inHg: 2, mmHg: 0, psi: 1 }

/** Weakest first to last: a manual entry is the strongest, the standard atmosphere the weakest. */
const WEAKNESS: StationSource[] = ['manual', 'location', 'model', 'standard']

/** The weakest source among the four fields the line shows: temperature, pressure, humidity and altitude. */
export function weakestSource(s: Station): StationSource {
  const sources = [s.tempC, s.pressureHPa, s.humidityPct, s.altitudeM].map((f) => f.source)
  return sources.reduce((w, x) => (WEAKNESS.indexOf(x) > WEAKNESS.indexOf(w) ? x : w), 'manual' as StationSource)
}

/**
 * The pressure the sheet shows in hPa, of the kind it is set to. A standard one is the ISA air the solver uses: the
 * ISA station pressure for the altitude, or as QNH 1013.25, which reduces to that same station pressure.
 */
export function shownHPa(s: Station): number {
  if (s.pressureHPa.source !== 'standard') return s.pressureHPa.value
  return s.pressureKind === 'qnh' ? ISA_SEA_LEVEL.stationPressureHPa : isaStationPressureHPa(s.altitudeM.value)
}

/** Whether the temperature, pressure or humidity comes from the forecast (the altitude is terrain and doesn't age). */
export function weatherInUse(s: Station): boolean {
  return [s.tempC, s.pressureHPa, s.humidityPct].some((f) => f.source === 'model')
}

/**
 * How old the forecast behind the model weather is, or null when none of the three is in use. Model fields with no
 * usable model block (no time, or a fetch from the future, dropped on read) are stale, never timeless (M1).
 */
export function modelFreshness(s: Station, now: number): Freshness | null {
  if (!weatherInUse(s)) return null
  return s.model ? freshness(s.model.fetchedAt, now) : 'stale'
}

/** The local HH:MM of Open-Meteo's `current.time` (`2026-10-31T14:05`), or null when it isn't in that shape. */
export function clockOf(modelTime: string): string | null {
  return /T(\d\d:\d\d)/.exec(modelTime)?.[1] ?? null
}

/** An age as minutes under an hour, else whole hours. */
export function ageOf(fetchedAt: number, now: number): { key: 'st.age.min' | 'st.age.h'; n: number } {
  const min = Math.max(0, Math.floor((now - fetchedAt) / 60_000))
  return min < 60 ? { key: 'st.age.min', n: min } : { key: 'st.age.h', n: Math.floor(min / 60) }
}

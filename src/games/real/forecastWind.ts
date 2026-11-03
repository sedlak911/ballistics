import { SPEED_TO_MS } from '../../engine/units'
import { WIND_STEP, type WindUnit } from './profile'
import { BOUNDS } from './setup'
import type { Station } from './station'
import { freshness } from './weather'

/** Roughness length of short grass in metres; the forecast's 10 m wind is brought down to the shooter with it. */
export const Z0_M = 0.03
const MIN_HEIGHT_M = 0.5
const MAX_HEIGHT_M = 100
/** Under this the wind is called calm, as the wind field does. */
const CALM_MS = 0.5

/** The log wind profile: the 10 m wind scaled to a height, which is clamped to where the profile is sane. */
export function windAtHeight(v10: number, heightM: number): number {
  const h = Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, heightM))
  return (v10 * Math.log(h / Z0_M)) / Math.log(10 / Z0_M)
}

/** The wind's clock hour, 1 to 12, relative to the shooting direction (12 is a headwind). */
export function clockHour(windFromDeg: number, azimuthDeg: number): number {
  return Math.round((((windFromDeg - azimuthDeg) % 360) + 360) % 360 / 30) % 12 || 12
}

/** The eight-point compass index, 0 to 7 for N NE E SE S SW W NW. */
export function cardinalIndex(deg: number): number {
  return Math.round(((((deg % 360) + 360) % 360)) / 45) % 8
}

export interface ForecastOffer {
  /** What Use stores, in m/s: the converted speed snapped to the unit's step. */
  speedMs: number
  /** The same, in the wind unit, for the text. */
  shown: number
  heightM: number
  cardinal: number
  /** null without an azimuth. */
  hour: number | null
  calm: boolean
}

/** The wind to offer the shooter from the station's forecast, or null when there is none or it is too old to trust. */
export function forecastOffer(s: Station, now: number, unit: WindUnit): ForecastOffer | null {
  const m = s.model
  if (!m || m.windMs10 == null || m.windFromDeg == null) return null
  if (freshness(m.fetchedAt, now) === 'stale') return null
  const heightM = s.heightAboveGroundM.value
  const ms = Math.min(BOUNDS.windMs.max, windAtHeight(m.windMs10, heightM))
  const perUnit = SPEED_TO_MS[unit]
  const step = WIND_STEP[unit]
  const calm = ms < CALM_MS
  // Snapped like the stepper does, and stored back as m/s to a thousandth like storeWind.
  const shown = calm ? 0 : +(Math.round(ms / perUnit / step) * step).toPrecision(10)
  return {
    speedMs: Math.round(shown * perUnit * 1000) / 1000,
    shown,
    heightM,
    cardinal: cardinalIndex(m.windFromDeg),
    hour: s.azimuthDeg ? clockHour(m.windFromDeg, s.azimuthDeg.value) : null,
    calm,
  }
}

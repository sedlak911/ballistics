import { useCallback, useSyncExternalStore } from 'react'
import { isaStationPressureHPa, LAPSE_K_PER_M, qnhFromStation, stationFromQnh, type AirInput } from '../../engine/atmosphere'
import { isModelTime } from './weather'

export type StationSource = 'manual' | 'standard' | 'model' | 'location'
export interface Field<T> { value: T; source: StationSource }
/** When the forecast behind the 'model' fields was made (Open-Meteo's local time) and fetched (epoch ms). */
export interface ModelInfo { time: string; fetchedAt: number }
export interface Station {
  tempC: Field<number>
  /** Station pressure, or QNH (sea level) when pressureKind is 'qnh'. */
  pressureHPa: Field<number>
  pressureKind: 'station' | 'qnh'
  humidityPct: Field<number>
  altitudeM: Field<number>
  latitudeDeg: Field<number>
  azimuthDeg: Field<number> | null
  powderTempC: Field<number> | null
  model: ModelInfo | null
}

const std = (value: number): Field<number> => ({ value, source: 'standard' })

/**
 * ISA at 0 m, 50 degrees N, no azimuth. Manual entry starts on QNH, the figure a weather app or the news gives (I2); the
 * standard pressure then means QNH 1013.25, which is the ISA station pressure for any altitude, the same air as before.
 */
export const STANDARD_STATION: Station = {
  tempC: std(15), pressureHPa: std(1013.25), pressureKind: 'qnh', humidityPct: std(0),
  altitudeM: std(0), latitudeDeg: std(50), azimuthDeg: null, powderTempC: null, model: null,
}

/** The air at the shooter: QNH is reduced to the station altitude; a 'standard' pressure is the ISA one for it. */
export function stationAir(s: Station): AirInput {
  const alt = s.altitudeM.value
  const p = s.pressureHPa
  const stationPressureHPa = p.source === 'standard' ? isaStationPressureHPa(alt)
    : s.pressureKind === 'qnh' ? stationFromQnh(p.value, alt) : p.value
  return { tempC: s.tempC.value, stationPressureHPa, humidityPct: s.humidityPct.value }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const SOURCES: StationSource[] = ['manual', 'standard', 'model', 'location']

/**
 * A stored field, or the fallback (value and source) when its value or its source isn't one we know (M8): a corrupt
 * field never claims the user typed it.
 */
function field(raw: unknown, lo: number, hi: number, fallback: Field<number>): Field<number> {
  if (!isRecord(raw) || typeof raw.value !== 'number' || !Number.isFinite(raw.value)) return fallback
  if (!SOURCES.includes(raw.source as StationSource)) return fallback
  return { value: Math.min(hi, Math.max(lo, raw.value)), source: raw.source as StationSource }
}

const optional = (raw: unknown, lo: number, hi: number): Field<number> | null => field(raw, lo, hi, null as unknown as Field<number>)

function readModel(raw: unknown): ModelInfo | null {
  if (!isRecord(raw) || typeof raw.fetchedAt !== 'number' || !Number.isFinite(raw.fetchedAt)) return null
  // A forecast time as Open-Meteo writes it, and a fetch that has happened (5 minutes of clock skew allowed).
  if (!isModelTime(raw.time) || raw.fetchedAt > Date.now() + 5 * 60_000) return null
  return { time: raw.time.slice(0, 32), fetchedAt: raw.fetchedAt }
}

export function readStation(raw: unknown): Station {
  if (!isRecord(raw)) return STANDARD_STATION
  const d = STANDARD_STATION
  return {
    tempC: field(raw.tempC, -60, 60, d.tempC),
    // Down to 250, not the typed field's 500: a model pressure moved to the altitude's 9000 m maximum (~308 hPa) must
    // survive storage, or correcting the altitude typo afterwards gives a different pressure back (N2).
    pressureHPa: field(raw.pressureHPa, 250, 1100, d.pressureHPa),
    pressureKind: raw.pressureKind === 'station' ? 'station' : d.pressureKind,
    humidityPct: field(raw.humidityPct, 0, 100, d.humidityPct),
    altitudeM: field(raw.altitudeM, -500, 9000, d.altitudeM),
    latitudeDeg: field(raw.latitudeDeg, -90, 90, d.latitudeDeg),
    azimuthDeg: optional(raw.azimuthDeg, 0, 360),
    powderTempC: optional(raw.powderTempC, -60, 80),
    model: readModel(raw.model),
  }
}

/** Only what the user did not type is replaced (Review Focus 3). */
const open = (f: Field<number>) => f.source !== 'manual'

/**
 * Model weather belongs to an altitude: Open-Meteo's surface pressure and 2 m temperature are the values at the elevation
 * sent (C1). These are the station's model values moved to another altitude: a station-kind model or location pressure
 * by the ISA ratio (the same one the QNH path applies, so both tap orders agree), a model temperature by the ISA lapse
 * rate. A QNH pressure needs nothing, stationAir reduces it; manual and standard fields don't move.
 */
function movedTo(s: Station, toM: number): Partial<Station> {
  const fromM = s.altitudeM.value
  const patch: Partial<Station> = {}
  if (toM === fromM) return patch
  if (s.tempC.source === 'model') patch.tempC = { value: s.tempC.value - LAPSE_K_PER_M * (toM - fromM), source: 'model' }
  const p = s.pressureHPa
  if (s.pressureKind === 'station' && (p.source === 'model' || p.source === 'location')) {
    patch.pressureHPa = { value: stationFromQnh(qnhFromStation(p.value, fromM), toM), source: p.source }
  }
  return patch
}

/** A new altitude (typed, or from any other path), with the model weather moved to it. */
export function withAltitude(s: Station, altitudeM: Field<number>): Partial<Station> {
  return { ...movedTo(s, altitudeM.value), altitudeM }
}

/**
 * The pressure kind. A typed number keeps its digits: the user says which kind of pressure it is, not what to convert
 * it to (I1). A standard pressure stays standard, the ISA one for the altitude under either kind, so the air doesn't
 * move. A model or location pressure is a measured figure of one kind, so it converts through the altitude and keeps its
 * source: the air stays the same.
 */
export function withPressureKind(s: Station, kind: Station['pressureKind']): Partial<Station> {
  if (kind === s.pressureKind) return {}
  const p = s.pressureHPa
  if (p.source !== 'model' && p.source !== 'location') return { pressureKind: kind }
  const alt = s.altitudeM.value
  const value = kind === 'qnh' ? qnhFromStation(p.value, alt) : stationFromQnh(p.value, alt)
  return { pressureKind: kind, pressureHPa: { value, source: p.source } }
}

/** The three weather fields a forecast fills, in the order the line shows them. */
export type WeatherField = 'tempC' | 'pressureHPa' | 'humidityPct'

/**
 * What a forecast does to the station: temperature, humidity, altitude and surface pressure become 'model' fields (the
 * pressure as a station pressure), the latitude a 'location' one from the rounded cell, never the exact position. Every
 * manual field stays as it was. A value the forecast lacked (missing or out of range) is `dropped`: its field goes back
 * to standard (the pressure also to QNH), so an older model value never passes as current under the new model time (I1).
 */
export function applyWeather(
  s: Station,
  r: { cell: { lat: number }; elevationM: number; weather: { tempC: number | null; humidityPct: number | null; stationPressureHPa: number | null; modelTime: string; fetchedAt: number } },
): { patch: Partial<Station>; dropped: WeatherField[] } {
  const patch: Partial<Station> = { model: { time: r.weather.modelTime, fetchedAt: r.weather.fetchedAt } }
  const dropped: WeatherField[] = []
  const model = (value: number): Field<number> => ({ value, source: 'model' })
  const values: Record<WeatherField, number | null> = { tempC: r.weather.tempC, pressureHPa: r.weather.stationPressureHPa, humidityPct: r.weather.humidityPct }
  for (const key of ['tempC', 'pressureHPa', 'humidityPct'] as const) {
    const v = values[key]
    if (!open(s[key])) continue
    if (v !== null) {
      patch[key] = model(v)
      if (key === 'pressureHPa') patch.pressureKind = 'station'
    } else {
      dropped.push(key)
      if (s[key].source !== 'standard') {
        patch[key] = STANDARD_STATION[key]
        if (key === 'pressureHPa') patch.pressureKind = STANDARD_STATION.pressureKind
      }
    }
  }
  if (open(s.altitudeM)) patch.altitudeM = model(r.elevationM)
  if (open(s.latitudeDeg)) patch.latitudeDeg = { value: r.cell.lat, source: 'location' }
  // The forecast is for r.elevationM. An altitude that stays (typed before or during the lookup) at another height takes
  // the new model weather with it.
  if (!patch.altitudeM && s.altitudeM.value !== r.elevationM) {
    Object.assign(patch, movedTo({ ...s, ...patch, altitudeM: { ...s.altitudeM, value: r.elevationM } }, s.altitudeM.value))
  }
  return { patch, dropped }
}

/**
 * When the forecast can't be had and there is no cache: the model temperature, pressure and humidity go back to the
 * standard atmosphere, so the text saying so is true. Manual fields, the model altitude (terrain doesn't age) and the
 * location latitude stay.
 */
export function resetWeather(s: Station): Partial<Station> {
  const patch: Partial<Station> = { model: null }
  if (s.tempC.source === 'model') patch.tempC = STANDARD_STATION.tempC
  if (s.humidityPct.source === 'model') patch.humidityPct = STANDARD_STATION.humidityPct
  if (s.pressureHPa.source === 'model') {
    patch.pressureHPa = STANDARD_STATION.pressureHPa
    patch.pressureKind = STANDARD_STATION.pressureKind
  }
  return patch
}

const STORAGE_KEY = 'gb.real.station'
const listeners = new Set<() => void>()
let cached: { raw: string | null; station: Station } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function snapshot(): Station {
  const raw = readRaw()
  if (cached?.raw !== raw) {
    let parsed: unknown = null
    try {
      parsed = raw === null ? null : JSON.parse(raw)
    } catch {
      // Corrupt storage: the standard station.
    }
    cached = { raw, station: readStation(parsed) }
  }
  return cached.station
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function save(patch: Partial<Station>): void {
  const next = readStation({ ...snapshot(), ...patch })
  const raw = JSON.stringify({ v: 1, ...next })
  try {
    localStorage.setItem(STORAGE_KEY, raw)
    cached = { raw, station: next }
  } catch {
    cached = { raw: readRaw(), station: next }
  }
  listeners.forEach((l) => l())
}

/** Changes the station from its current value: for work that finishes after a render (a forecast arriving). */
export function updateStation(fn: (current: Station) => Partial<Station>): void {
  save(fn(snapshot()))
}

export function useStation(): [Station, (patch: Partial<Station>) => void] {
  const station = useSyncExternalStore(subscribe, snapshot)
  return [station, useCallback(save, [])]
}

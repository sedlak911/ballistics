// Weather by location from Open-Meteo. The only network code in the app: the two requests below, and only when
// weatherByLocation() or weatherForCell() runs (the button, or the automatic refresh of useWeatherRefresh). Coordinates leave the phone rounded to 0.01 degrees; the exact position stays in memory.

export interface Cell {
  lat: number
  lon: number
}

const STORAGE_KEY = 'gb.real.weather'
const GRID = 10
const HALF = 0.005
const STEP = (2 * HALF) / (GRID - 1)
const MIN = 60_000
/** A stalled connection at a range must not leave the lookup pending for minutes. */
export const REQUEST_TIMEOUT_MS = 10_000

const norm = (n: number) => (Object.is(n, -0) || n === 0 ? 0 : n)

export function cellOf(lat: number, lon: number): Cell {
  return { lat: norm(Math.round(lat * 100) / 100), lon: norm(Math.round(lon * 100) / 100) }
}

const fmt = (n: number, decimals: number) => {
  const s = norm(Number(n.toFixed(decimals))).toString()
  return s
}

/** 10 points per axis covering the cell (edges included). A function of the rounded cell only. */
export function elevationGrid(c: Cell): { lats: number[]; lons: number[] } {
  const axis = (mid: number) => Array.from({ length: GRID }, (_, i) => norm(Number((mid - HALF + i * STEP).toFixed(5))))
  return { lats: axis(c.lat), lons: axis(c.lon) }
}

/** Bilinear interpolation of the grid's elevations (row = latitude index, column = longitude index). */
export function interpolateElevation(c: Cell, elevations: number[], lat: number, lon: number): number {
  const idx = (v: number, mid: number) => Math.min(GRID - 1, Math.max(0, (v - (mid - HALF)) / STEP))
  const fi = idx(lat, c.lat)
  const fj = idx(lon, c.lon)
  const i0 = Math.min(GRID - 2, Math.floor(fi))
  const j0 = Math.min(GRID - 2, Math.floor(fj))
  const ti = fi - i0
  const tj = fj - j0
  const at = (i: number, j: number) => elevations[i * GRID + j]!
  return (
    at(i0, j0) * (1 - ti) * (1 - tj) +
    at(i0, j0 + 1) * (1 - ti) * tj +
    at(i0 + 1, j0) * ti * (1 - tj) +
    at(i0 + 1, j0 + 1) * ti * tj
  )
}

export function elevationUrl(c: Cell): string {
  const { lats, lons } = elevationGrid(c)
  const la: string[] = []
  const lo: string[] = []
  for (const a of lats) for (const b of lons) {
    la.push(fmt(a, 5))
    lo.push(fmt(b, 5))
  }
  return `https://api.open-meteo.com/v1/elevation?latitude=${la.join(',')}&longitude=${lo.join(',')}`
}

export function forecastUrl(c: Cell, elevationM: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${fmt(c.lat, 2)}&longitude=${fmt(c.lon, 2)}` +
    `&elevation=${fmt(Math.round(elevationM), 0)}` +
    '&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto'
  )
}

export interface Weather {
  tempC: number | null
  humidityPct: number | null
  stationPressureHPa: number | null
  /** The forecast wind at 10 m above the ground (m/s) and the direction it blows from (degrees). */
  windMs10: number | null
  windFromDeg: number | null
  modelTime: string
  fetchedAt: number
}

/** Open-Meteo's `current.time`: the local time of the forecast, as `2026-10-31T14:05`. */
export const isModelTime = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v)

const inRange = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null

/** Each of the two wind values on its own: one out of range never drops the other, or the weather. */
const checkedWind = (speed: unknown, dir: unknown): Pick<Weather, 'windMs10' | 'windFromDeg'> => ({
  windMs10: inRange(speed, 0, 75),
  windFromDeg: inRange(dir, 0, 360),
})

/** The three values, each checked on its own: one out of range becomes null. Null when none is left. */
function checked(tempC: unknown, humidityPct: unknown, stationPressureHPa: unknown): Pick<Weather, 'tempC' | 'humidityPct' | 'stationPressureHPa'> | null {
  const v = { tempC: inRange(tempC, -60, 60), humidityPct: inRange(humidityPct, 0, 100), stationPressureHPa: inRange(stationPressureHPa, 500, 1100) }
  return v.tempC === null && v.humidityPct === null && v.stationPressureHPa === null ? null : v
}

/**
 * Each value is validated on its own; one out of range becomes null and the rest is kept. A forecast with no usable time
 * is no forecast (M1): its values would never age.
 */
export function parseForecast(json: unknown, fetchedAt: number): Weather | null {
  const cur = (json as { current?: unknown } | null)?.current
  if (!cur || typeof cur !== 'object') return null
  const c = cur as Record<string, unknown>
  if (!isModelTime(c.time)) return null
  const values = checked(c.temperature_2m, c.relative_humidity_2m, c.surface_pressure)
  return values && { ...values, ...checkedWind(c.wind_speed_10m, c.wind_direction_10m), modelTime: c.time, fetchedAt }
}

export type Freshness = 'fresh' | 'aging' | 'stale'

export function freshness(fetchedAt: number, now: number): Freshness {
  const age = now - fetchedAt
  if (age < 0) return 'stale'
  return age < 30 * MIN ? 'fresh' : age < 180 * MIN ? 'aging' : 'stale'
}

export interface CachedWeather extends Weather {
  cell: Cell
  elevationM: number
}

/** A stored cache, checked like a forecast (M2): an older version, or one edited by hand, never applies garbage. */
export function readWeatherCache(raw: unknown): CachedWeather | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const cell = r.cell as Record<string, unknown> | null
  if (!cell || typeof cell !== 'object') return null
  if (typeof cell.lat !== 'number' || typeof cell.lon !== 'number') return null
  if (typeof r.elevationM !== 'number' || typeof r.fetchedAt !== 'number') return null
  if (!Number.isFinite(cell.lat) || !Number.isFinite(cell.lon) || !Number.isFinite(r.fetchedAt)) return null
  if (inRange(r.elevationM, -500, 9000) === null || !isModelTime(r.modelTime)) return null
  const values = checked(r.tempC, r.humidityPct, r.stationPressureHPa)
  if (!values) return null
  // A cache written before 0.1.6 has no wind: it reads as null, and weatherByLocation asks again.
  const wind = checkedWind(r.windMs10, r.windFromDeg)
  return { cell: { lat: cell.lat, lon: cell.lon }, elevationM: r.elevationM, ...values, ...wind, modelTime: r.modelTime, fetchedAt: r.fetchedAt }
}

function loadCache(): CachedWeather | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? readWeatherCache(JSON.parse(s)) : null
  } catch {
    return null
  }
}

function saveCache(v: CachedWeather) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    /* blocked storage: the cache is only a convenience */
  }
}

/**
 * The cache for this cell, unless it is stale (3 h). With an altitude to ask for, only a cache for that altitude: model
 * weather belongs to the elevation it was asked for.
 */
export function cachedFor(c: Cell, now: number, elevationM?: number): CachedWeather | null {
  const v = loadCache()
  if (!v || v.cell.lat !== c.lat || v.cell.lon !== c.lon) return null
  if (elevationM !== undefined && v.elevationM !== elevationM) return null
  return freshness(v.fetchedAt, now) === 'stale' ? null : v
}

export type WeatherError = 'insecure' | 'denied' | 'unavailable' | 'timeout' | 'offline' | 'service'

export type WeatherResult =
  | { ok: true; cell: Cell; elevationM: number; latitudeDeg: number; weather: Weather; accuracyM: number; cached?: true }
  /** `cached` (offline and service only): the last weather of this cell under 3 h old, for the fallback; may be null. */
  | { ok: false; error: WeatherError; cached?: CachedWeather | null }

function position(): Promise<{ lat: number; lon: number; accuracyM: number } | WeatherError> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve('unavailable')
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy }),
        (e) => resolve(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 },
      )
    } catch {
      resolve('unavailable') // e.g. blocked by a Permissions-Policy
    }
  })
}

/**
 * The geolocation permission, read without asking anything: null when the Permissions API is missing or throws. After a
 * denial, `granted` (allowed in the site settings since) or `prompt` (Chrome reports a dismissed prompt as a denial) is
 * worth another try (M4).
 */
export async function locationPermission(): Promise<PermissionState | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions) return null
    return (await navigator.permissions.query({ name: 'geolocation' })).state ?? null
  } catch {
    return null
  }
}

async function getJson(url: string): Promise<{ json: unknown } | WeatherError> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(url, { signal: ctrl.signal })
    } catch {
      return 'offline'
    }
    if (!res.ok) return 'service'
    try {
      return { json: await res.json() }
    } catch {
      return ctrl.signal.aborted ? 'offline' : 'service'
    }
  } finally {
    clearTimeout(timer)
  }
}

/** How often the page asks again by itself (useWeatherRefresh), and how old a cache may be to answer such an ask. */
export const REFRESH_MS = 15 * MIN
const FRESH_MS = 30 * MIN

/** The last cell and elevation the app asked for, from the stored cache at any age; null with none. */
export function lastCell(): { cell: Cell; elevationM: number } | null {
  const v = loadCache()
  return v && { cell: v.cell, elevationM: v.elevationM }
}

/**
 * Position -> cell -> (fresh cache) -> grid -> elevation -> forecast -> cache. The only fetch in src/. A position-based
 * lookup (the button) asks for the position, then runs weatherForCell. See there for the cache and the elevation.
 */
export async function weatherByLocation(
  now: number = Date.now(),
  opts: { elevationM?: number; maxCacheAgeMs?: number; onStage?: (stage: 'loading') => void } = {},
): Promise<WeatherResult> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return { ok: false, error: 'insecure' }
  const pos = await position()
  if (typeof pos === 'string') return { ok: false, error: pos }
  return weatherForCell(cellOf(pos.lat, pos.lon), now, { ...opts, pos })
}

/**
 * (Fresh cache) -> grid -> elevation -> forecast -> cache, for a cell. A cache for the same cell (and altitude) younger
 * than `maxCacheAgeMs` (default 30 minutes), with its wind, answers without a request; offline and service failures hand
 * back the cache under 3 h. A typed altitude (`elevationM`) is the forecast's elevation: the grid request is skipped, so
 * less leaves the phone, and the forecast is for that height. Without a `pos` (a refresh by the cell alone) the cell's
 * centre stands in for it.
 */
export async function weatherForCell(
  cell: Cell,
  now: number,
  opts: { elevationM?: number; maxCacheAgeMs?: number; pos?: { lat: number; lon: number; accuracyM: number }; onStage?: (stage: 'loading') => void } = {},
): Promise<WeatherResult> {
  const pos = opts.pos ?? { lat: cell.lat, lon: cell.lon, accuracyM: 0 }
  const typed = opts.elevationM === undefined || !Number.isFinite(opts.elevationM) ? undefined : Math.round(opts.elevationM)

  const cache = cachedFor(cell, now, typed)
  // A cache without the wind is no answer: the wind is what the quick setup offers. It stays the offline fallback below.
  if (cache && now - cache.fetchedAt >= 0 && now - cache.fetchedAt < (opts.maxCacheAgeMs ?? FRESH_MS) && cache.windMs10 !== null && cache.windFromDeg !== null) {
    const { cell: _cell, elevationM, ...weather } = cache
    return { ok: true, cached: true, cell, elevationM, latitudeDeg: pos.lat, weather, accuracyM: pos.accuracyM }
  }

  opts.onStage?.('loading')
  const fail = (error: WeatherError): WeatherResult =>
    error === 'offline' || error === 'service' ? { ok: false, error, cached: cache } : { ok: false, error }

  let elevationM: number
  if (typed !== undefined) elevationM = typed
  else {
    const el = await getJson(elevationUrl(cell))
    if (typeof el === 'string') return fail(el)
    const grid = (el.json as { elevation?: unknown } | null)?.elevation
    if (!Array.isArray(grid) || grid.length !== GRID * GRID || !grid.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return fail('service')
    }
    elevationM = Math.round(interpolateElevation(cell, grid as number[], pos.lat, pos.lon))
  }

  const fc = await getJson(forecastUrl(cell, elevationM))
  if (typeof fc === 'string') return fail(fc)
  const weather = parseForecast(fc.json, Date.now())
  if (!weather) return fail('service')

  saveCache({ cell, elevationM, ...weather })
  return { ok: true, cell, elevationM, latitudeDeg: pos.lat, weather, accuracyM: pos.accuracyM }
}

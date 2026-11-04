import { useSyncExternalStore } from 'react'
import { BOUNDS } from './setup'

// Where the wind blows from by the compass, and whether it came from the forecast: kept in this browser only, never in a link.

export type WindSource = 'hand' | 'forecast'
/** A zone's own wind, remembered the same way: where it blows from by the compass, for the hour it was made for. */
export interface ZoneMemory {
  fromDeg: number | null
  hour: number
}
export interface WindMemory {
  /** The compass bearing the wind blows from, 0 <= d < 360; null while no direction has anchored it. */
  fromDeg: number | null
  /** The clock hour (1 to 12) this memory was made for: a different hour in the setup makes it stale. */
  hour: number
  speedMs: number
  source: WindSource
  /** The mid and far zones' own winds; absent in a 0.1.7 memory. */
  zones?: { mid: ZoneMemory | null; far: ZoneMemory | null }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const readBearing = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 360 ? v : null)

/** A bad zone reads as null; it never drops the memory. */
function readZone(raw: unknown): ZoneMemory | null {
  if (!isRecord(raw)) return null
  const { hour, fromDeg } = raw
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 1 || hour > 12) return null
  return { fromDeg: readBearing(fromDeg), hour }
}

/** Anything stored is validated; a bad hour, speed or source drops the memory, a bad bearing only the bearing. */
export function readWindMemory(raw: unknown): WindMemory | null {
  if (!isRecord(raw)) return null
  const { hour, speedMs, source, fromDeg, zones } = raw
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 1 || hour > 12) return null
  if (typeof speedMs !== 'number' || !(speedMs >= BOUNDS.windMs.min && speedMs <= BOUNDS.windMs.max)) return null
  if (source !== 'hand' && source !== 'forecast') return null
  return {
    fromDeg: readBearing(fromDeg),
    hour,
    speedMs,
    source,
    ...(isRecord(zones) ? { zones: { mid: readZone(zones.mid), far: readZone(zones.far) } } : {}),
  }
}

const STORAGE_KEY = 'gb.real.wind'
const listeners = new Set<() => void>()
let cached: { raw: string | null; memory: WindMemory | null } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function snapshot(): WindMemory | null {
  const raw = readRaw()
  if (cached?.raw !== raw) {
    let parsed: unknown = null
    try {
      parsed = raw === null ? null : JSON.parse(raw)
    } catch {
      // Corrupt storage: no memory.
    }
    cached = { raw, memory: readWindMemory(parsed) }
  }
  return cached.memory
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The memory right now, for code outside a component. */
export function windMemoryNow(): WindMemory | null {
  return snapshot()
}

export function saveWindMemory(m: WindMemory | null): void {
  const next = m === null ? null : readWindMemory(m)
  const raw = next === null ? null : JSON.stringify({ v: 1, ...next })
  try {
    if (raw === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, raw)
    cached = { raw, memory: next }
  } catch {
    cached = { raw: readRaw(), memory: next }
  }
  listeners.forEach((l) => l())
}

export function useWindMemory(): WindMemory | null {
  return useSyncExternalStore(subscribe, snapshot)
}

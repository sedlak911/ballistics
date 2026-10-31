import { useCallback, useSyncExternalStore } from 'react'

// The owner's own situation: kept in this browser only, never in a shared link.

/** My stance: the game's three. It has no rest or bipod. */
export type Steadiness = 'standing' | 'kneeling' | 'prone'
/** How far the hold wanders, 1σ in MIL. Estimates: GZW publishes no sway numbers. */
export const STEADINESS_MIL: Record<Steadiness, number> = { standing: 0.5, kneeling: 0.25, prone: 0.15 }
export const STEADINESS: Steadiness[] = ['standing', 'kneeling', 'prone']

export type AimZone = 'head' | 'chest'

export interface Profile {
  steadiness: Steadiness
  aimZone: AimZone
  /** The first visit got a weapon, picked by hand or read from a screenshot. */
  setupDone: boolean
  /** The distance slider sets the distance itself, or the target's height in MIL/MOA. */
  rangeBy: 'distance' | 'height'
}

export const DEFAULT_PROFILE: Profile = {
  steadiness: 'kneeling',
  aimZone: 'head',
  setupDone: false,
  rangeBy: 'distance',
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Anything stored is validated field by field; garbage falls back to the defaults, and old fields are dropped. */
export function readProfile(raw: unknown): Profile {
  if (!isRecord(raw)) return DEFAULT_PROFILE
  return {
    // The old 'supported' hold was the steadiest; prone is now.
    steadiness: raw.steadiness === 'supported' ? 'prone'
      : STEADINESS.includes(raw.steadiness as Steadiness) ? (raw.steadiness as Steadiness) : DEFAULT_PROFILE.steadiness,
    aimZone: raw.aimZone === 'chest' ? 'chest' : DEFAULT_PROFILE.aimZone,
    setupDone: raw.setupDone === true,
    rangeBy: raw.rangeBy === 'height' ? 'height' : 'distance',
  }
}

const STORAGE_KEY = 'gb.gzw.profile'
const listeners = new Set<() => void>()
let cached: { raw: string | null; profile: Profile } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

// Re-parsed only when the stored string changes, so the snapshot stays referentially stable.
function snapshot(): Profile {
  const raw = readRaw()
  if (cached?.raw !== raw) {
    let parsed: unknown = null
    try {
      parsed = raw === null ? null : JSON.parse(raw)
    } catch {
      // Corrupt storage: defaults.
    }
    cached = { raw, profile: readProfile(parsed) }
  }
  return cached.profile
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function save(patch: Partial<Profile>): void {
  const next = { ...snapshot(), ...patch }
  const raw = JSON.stringify({ v: 1, ...next })
  try {
    localStorage.setItem(STORAGE_KEY, raw)
    cached = { raw, profile: next }
  } catch {
    // Blocked storage: keep it for this page view.
    cached = { raw: readRaw(), profile: next }
  }
  listeners.forEach((l) => l())
}

/** The profile and a setter that merges a patch and stores it. */
export function useGzwProfile(): [Profile, (patch: Partial<Profile>) => void] {
  const profile = useSyncExternalStore(subscribe, snapshot)
  return [profile, useCallback(save, [])]
}

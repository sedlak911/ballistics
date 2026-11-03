import { useCallback, useSyncExternalStore } from 'react'

// The owner's own situation: kept in this browser only, never in a shared link.

export type Effect = 'humidity' | 'powderTemp' | 'spinDrift' | 'coriolis' | 'aeroJump' | 'curvature'
export const EFFECTS: Effect[] = ['humidity', 'powderTemp', 'spinDrift', 'coriolis', 'aeroJump', 'curvature']
export type WindUnit = 'm/s' | 'km/h' | 'mph' | 'kn'
export const WIND_UNITS: WindUnit[] = ['m/s', 'km/h', 'mph', 'kn']

export interface RealProfile {
  mode: 'dial' | 'hold'
  /** Dial mode's big figure: the angle, or the turret clicks. */
  primary: 'value' | 'clicks'
  effects: Record<Effect, boolean>
  windSigmaMs: number
  /** Our estimate for prone with a rest: the research has no source. */
  holdSigmaMrad: number
  bcSdPct: number
  windUnit: WindUnit
  /** The one-time privacy note of By location has been confirmed. */
  locationNoteSeen: boolean
  /** The iPhone's note before the first own item (home-screen storage is apart from Safari's) has been answered. */
  addNoteSeen: boolean
}

export const DEFAULT_REAL_PROFILE: RealProfile = {
  mode: 'dial',
  primary: 'value',
  effects: { humidity: true, powderTemp: true, spinDrift: true, coriolis: true, aeroJump: true, curvature: true },
  windSigmaMs: 1,
  holdSigmaMrad: 0.05,
  bcSdPct: 1,
  windUnit: 'm/s',
  locationNoteSeen: false,
  addNoteSeen: false,
}

/** The wind uncertainty the stepper offers; storage accepts the same. */
export const WIND_SIGMA_MS = { min: 0.5, max: 3, step: 0.5 }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

/** In range or the fallback: a value the field couldn't have written isn't clamped into one (M7). */
const inRange = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : fallback)

/** Anything stored is validated field by field; garbage falls back to the defaults. */
export function readRealProfile(raw: unknown): RealProfile {
  if (!isRecord(raw)) return DEFAULT_REAL_PROFILE
  const eff = isRecord(raw.effects) ? raw.effects : {}
  const d = DEFAULT_REAL_PROFILE
  return {
    mode: raw.mode === 'hold' ? 'hold' : 'dial',
    primary: raw.primary === 'clicks' ? 'clicks' : 'value',
    effects: Object.fromEntries(EFFECTS.map((e) => [e, typeof eff[e] === 'boolean' ? eff[e] : d.effects[e]])) as Record<Effect, boolean>,
    windSigmaMs: inRange(raw.windSigmaMs, WIND_SIGMA_MS.min, WIND_SIGMA_MS.max, d.windSigmaMs),
    holdSigmaMrad: num(raw.holdSigmaMrad, 0, 2, d.holdSigmaMrad),
    bcSdPct: num(raw.bcSdPct, 0, 20, d.bcSdPct),
    windUnit: WIND_UNITS.includes(raw.windUnit as WindUnit) ? (raw.windUnit as WindUnit) : d.windUnit,
    locationNoteSeen: raw.locationNoteSeen === true,
    addNoteSeen: raw.addNoteSeen === true,
  }
}

const STORAGE_KEY = 'gb.real.profile'
const listeners = new Set<() => void>()
let cached: { raw: string | null; profile: RealProfile } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function snapshot(): RealProfile {
  const raw = readRaw()
  if (cached?.raw !== raw) {
    let parsed: unknown = null
    try {
      parsed = raw === null ? null : JSON.parse(raw)
    } catch {
      // Corrupt storage: defaults.
    }
    cached = { raw, profile: readRealProfile(parsed) }
  }
  return cached.profile
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A patch may carry only some of the effects; the rest keep their current value. */
export type RealProfilePatch = Partial<Omit<RealProfile, 'effects'>> & { effects?: Partial<Record<Effect, boolean>> }

function save(patch: RealProfilePatch): void {
  const cur = snapshot()
  const next = readRealProfile({ ...cur, ...patch, effects: { ...cur.effects, ...patch.effects } })
  const raw = JSON.stringify({ v: 1, ...next })
  try {
    localStorage.setItem(STORAGE_KEY, raw)
    cached = { raw, profile: next }
  } catch {
    cached = { raw: readRaw(), profile: next }
  }
  listeners.forEach((l) => l())
}

export function useRealProfile(): [RealProfile, (patch: RealProfilePatch) => void] {
  const profile = useSyncExternalStore(subscribe, snapshot)
  return [profile, useCallback(save, [])]
}

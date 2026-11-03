import { useCallback, useEffect, useMemo } from 'react'
import { useSettings } from '../../settings/SettingsContext'
import type { Display } from '../../settings/url'
import { DEFAULT_PRESET_ID, PRESETS } from './data/presets'
import { linkedKeys, linkOverrides, readLinkOverrides, sameOverrides, useOverrides, writeLinkOverrides, type Overrides } from './profiles'

export interface RealSetup {
  presetId: string
  distanceM: number
  slopeDeg: number
  windMs: number
  /** Where the wind comes from, as a clock face seen from the shooter: 12 is head-on, 9 from the left. */
  windClock: number
  targetCm: number
}

export const DEFAULT_SETUP: RealSetup = { presetId: DEFAULT_PRESET_ID, distanceM: 300, slopeDeg: 0, windMs: 0, windClock: 9, targetCm: 50 }

/** What the link and the bottom bar accept. */
export const BOUNDS = {
  distanceM: { min: 25, max: 2500 },
  slopeDeg: { min: -45, max: 45 },
  windMs: { min: 0, max: 25 },
  targetCm: { min: 5, max: 300 },
} as const

const KEYS = { presetId: 'p', distanceM: 'd', slopeDeg: 'sl', windMs: 'ws', windClock: 'wc', targetCm: 'tg' } as const satisfies Record<keyof RealSetup, string>
/** The current preset's overrides in a link (profiles.ts writeLinkOverrides). The station and the profile never travel. */
const LINK_KEY = 'o'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Every unknown preset or garbage value falls back to its default, so stale shared links still open. */
export function readRealSetup(p: URLSearchParams): RealSetup {
  const num = (key: string, lo: number, hi: number, fallback: number): number => {
    const raw = p.get(key)
    if (raw === null || raw.trim() === '') return fallback
    const v = Number(raw)
    return Number.isFinite(v) ? clamp(v, lo, hi) : fallback
  }
  const id = p.get(KEYS.presetId)
  return {
    presetId: id !== null && PRESETS.some((x) => x.id === id) ? id : DEFAULT_SETUP.presetId,
    distanceM: num(KEYS.distanceM, BOUNDS.distanceM.min, BOUNDS.distanceM.max, DEFAULT_SETUP.distanceM),
    slopeDeg: num(KEYS.slopeDeg, BOUNDS.slopeDeg.min, BOUNDS.slopeDeg.max, DEFAULT_SETUP.slopeDeg),
    // To a thousandth of a m/s: the bar steps in the owner's wind unit (0.5 m/s, 2 km/h, 1 mph, 1 kn), not on one m/s grid.
    windMs: Math.round(num(KEYS.windMs, BOUNDS.windMs.min, BOUNDS.windMs.max, DEFAULT_SETUP.windMs) * 1000) / 1000,
    windClock: Math.round(num(KEYS.windClock, 1, 12, DEFAULT_SETUP.windClock)),
    targetCm: num(KEYS.targetCm, BOUNDS.targetCm.min, BOUNDS.targetCm.max, DEFAULT_SETUP.targetCm),
  }
}

/** The setup as link params; with `o`, the preset's overrides too (none for an empty set). */
export function writeRealSetup(s: RealSetup, d: Display, o?: Overrides): URLSearchParams {
  const p = new URLSearchParams()
  for (const [field, key] of Object.entries(KEYS) as [keyof RealSetup, string][]) p.set(key, String(s[field]))
  const link = writeLinkOverrides(o)
  if (link !== null) p.set(LINK_KEY, link)
  // The language is in the path (src/lang.ts), not the link.
  p.set('u', d.system)
  p.set('a', d.angle)
  return p
}

const STORAGE_KEY = 'gb.real.setup'
const hasSetupParams = (p: URLSearchParams) => Object.values(KEYS).some((k) => p.has(k))

function loadStored(): URLSearchParams {
  try {
    return new URLSearchParams(localStorage.getItem(STORAGE_KEY) ?? '')
  } catch {
    return new URLSearchParams()
  }
}

function store(params: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, params)
  } catch {
    // Private mode or blocked storage: the URL still carries the setup.
  }
}

/** The current preset's overrides as the page uses them, and how to change them (I3). */
export interface PresetOverrides {
  /** The stored overrides, with a shared link's on top (linkOverrides: the link wins per field). */
  own: Overrides | undefined
  /** The view shows values from a shared link that the stored ones don't have. */
  fromLink: boolean
  /** The keys the link brought that the stored set doesn't hold (they read "from link"); empty without a link. */
  linkKeys: ReadonlySet<keyof Overrides>
  /** Back to the stored overrides: drops the link's from the URL and touches no storage. */
  useMine: () => void
  /**
   * Writes to the current preset; null resets it. With a link's values on screen it stores them too, merged, so the
   * first edit keeps what the view showed; the URL then carries the stored set, and the link's values are gone.
   */
  save: (patch: Overrides | null) => void
}

/**
 * The current REAL setup from the URL, plus a setter that writes back to it, and the current preset's overrides. A bare
 * link reopens the last setup. The URL is the share link, so it always carries the overrides on screen (`o=`); the
 * stored setup never does: a link's values are for the view that opened it, and storage gets them only with an edit.
 */
export function useRealSetup(): [RealSetup, (patch: Partial<RealSetup>) => void, PresetOverrides] {
  const { route, navigate, display } = useSettings()
  const [all, saveOverrides] = useOverrides()
  const fromUrl = hasSetupParams(route.params)
  const setup = useMemo(() => readRealSetup(fromUrl ? route.params : loadStored()), [route.params, fromUrl])
  const stored = all[setup.presetId]
  const urlLink = fromUrl ? route.params.get(LINK_KEY) : null
  const link = useMemo(() => readLinkOverrides(urlLink), [urlLink])
  const merged = useMemo(() => (link === null ? stored : linkOverrides(stored, link)), [stored, link])
  const fromLink = !sameOverrides(merged, stored)
  const own = fromLink ? merged : stored
  const linkKeys = useMemo(() => linkedKeys(stored, merged), [stored, merged])

  const stashed = writeRealSetup(setup, display).toString()
  const want = writeLinkOverrides(stored)
  // Where the URL has to go: a bare one gets the setup and the stored overrides; one without a link's values on screen
  // gets the stored overrides in place of what its `o=` holds (none, garbage, or another browser's).
  let target: string | null = null
  if (!fromUrl) target = writeRealSetup(setup, display, stored).toString()
  else if (!fromLink && urlLink !== want) {
    const q = new URLSearchParams(route.params)
    if (want === null) q.delete(LINK_KEY)
    else q.set(LINK_KEY, want)
    target = q.toString()
  }
  useEffect(() => {
    store(stashed)
    if (target !== null) navigate({ params: new URLSearchParams(target) })
  }, [stashed, target, navigate])

  const update = useCallback(
    (patch: Partial<RealSetup>) => {
      const next = readRealSetup(writeRealSetup({ ...setup, ...patch }, display))
      // Another preset brings its own stored overrides; the same one keeps what is on screen, a link's values included.
      navigate({ params: writeRealSetup(next, display, next.presetId === setup.presetId ? own : all[next.presetId]) })
    },
    [setup, display, navigate, own, all],
  )
  const save = useCallback(
    (patch: Overrides | null) => {
      // With a link, the stored set is replaced, not merged into: the link may have taken away a stored pair's other half.
      const cleared = Object.fromEntries(Object.keys(stored ?? {}).map((k) => [k, undefined])) as Overrides
      const now = saveOverrides(setup.presetId, patch === null || !fromLink ? patch : { ...cleared, ...own, ...patch })
      navigate({ params: writeRealSetup(setup, display, now) })
    },
    [saveOverrides, setup, display, navigate, own, stored, fromLink],
  )
  const useMine = useCallback(() => navigate({ params: writeRealSetup(setup, display, stored) }), [navigate, setup, display, stored])
  return [setup, update, { own, fromLink, linkKeys, useMine, save }]
}

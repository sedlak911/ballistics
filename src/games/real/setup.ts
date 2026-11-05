import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSettings } from '../../settings/SettingsContext'
import type { Display } from '../../settings/url'
import { DEFAULT_PRESET_ID, LEGACY_CUSTOM_ID, PRESETS } from './data/presets'
import { useLibrary } from './library'
import { linkedKeys, linkOverrides, readLinkOverrides, sameOverrides, useOverrides, writeLinkOverrides, type Overrides } from './profiles'
import { dropUnknown, isLegacy, resolveSelection } from './selection'

/** One zone's wind: speed in m/s and where it comes from on the clock face. */
export interface ZoneWind { ms: number; clock: number }

export interface RealSetup {
  /**
   * The built-in round (its preset); unused while a custom round (`roundId`) is selected. It may also be the retired
   * Custom preset's id (LEGACY_CUSTOM_ID), from an old link or stored setup: that opens the migrated round (selection.ts).
   */
  presetId: string
  /** A custom round's id (`cr`), selected over `presetId`. */
  roundId: string | null
  /** A custom scope's id (`cs`); null for the generic scope. */
  scopeId: string | null
  /** The custom rifle's id (`cf`), written only so a device without the items can say which kind is missing. */
  customRifleId: string | null
  /** The link or the stored setup names a rifle (`p`, `cr` or `cf` is present); until then nothing is chosen and the page doesn't solve. */
  rifleSet: boolean
  distanceM: number
  slopeDeg: number
  windMs: number
  /** The wind was entered (`ws` is in the link); until then it reads as not set, 0 m/s. */
  windSet: boolean
  /** Where the wind comes from, as a clock face seen from the shooter: 12 is head-on, 9 from the left. */
  windClock: number
  /** The wind changes with the distance (`zn=1`); the near wind is `windMs`/`windClock`. */
  zonesOn: boolean
  /** The middle zone's own wind (`zm=<ms>,<clock>`); null follows the near wind. */
  windMid: ZoneWind | null
  /** The far zone's own wind (`zf=<ms>,<clock>`); null follows the near wind. */
  windFar: ZoneWind | null
  targetCm: number
}

export const DEFAULT_SETUP: RealSetup = {
  presetId: DEFAULT_PRESET_ID, roundId: null, scopeId: null, customRifleId: null, rifleSet: false, distanceM: 300, slopeDeg: 0, windMs: 0, windSet: false, windClock: 9,
  zonesOn: false, windMid: null, windFar: null, targetCm: 50,
}

/** What the link and the bottom bar accept. */
export const BOUNDS = {
  distanceM: { min: 25, max: 2500 },
  slopeDeg: { min: -45, max: 45 },
  windMs: { min: 0, max: 25 },
} as const

const KEYS = {
  presetId: 'p', roundId: 'cr', scopeId: 'cs', customRifleId: 'cf', distanceM: 'd', slopeDeg: 'sl', windMs: 'ws', windClock: 'wc',
} as const satisfies Record<Exclude<keyof RealSetup, 'rifleSet' | 'windSet' | 'targetCm' | 'zonesOn' | 'windMid' | 'windFar'>, string>
/** The zone params, which aren't plain numbers: `zn=1`, and `zm`/`zf` as `<ms>,<clock>`. */
const ZONE_KEYS = { zonesOn: 'zn', windMid: 'zm', windFar: 'zf' } as const
/** The current preset's overrides in a link (profiles.ts writeLinkOverrides). The station and the profile never travel. */
const LINK_KEY = 'o'
/** A custom item's id as a link may carry it (library.ts newId); anything else reads as none. */
const ITEM_ID = /^u-[A-Za-z0-9-]{1,64}$/

/** The params name a rifle: a built-in preset, a custom round or a custom rifle. */
export const namesRifle = (p: URLSearchParams): boolean => p.has('p') || p.has('cr') || p.has('cf')

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Every unknown preset or garbage value falls back to its default, so stale shared links still open. The retired Custom
 * preset's id stays as it is, for the selection to resolve (selection.ts).
 */
export function readRealSetup(p: URLSearchParams): RealSetup {
  const num = (key: string, lo: number, hi: number, fallback: number): number => {
    const raw = p.get(key)
    if (raw === null || raw.trim() === '') return fallback
    const v = Number(raw)
    return Number.isFinite(v) ? clamp(v, lo, hi) : fallback
  }
  const itemId = (key: string): string | null => {
    const raw = p.get(key)
    return raw !== null && ITEM_ID.test(raw) ? raw : null
  }
  const zoneWind = (key: string): ZoneWind | null => {
    const parts = (p.get(key) ?? '').split(',')
    if (parts.length !== 2 || parts[0].trim() === '' || parts[1].trim() === '') return null
    const ms = Number(parts[0])
    const clock = Number(parts[1])
    if (!Number.isFinite(ms) || !Number.isInteger(clock) || clock < 1 || clock > 12) return null
    return { ms: Math.round(clamp(ms, BOUNDS.windMs.min, BOUNDS.windMs.max) * 1000) / 1000, clock }
  }
  const id = p.get(KEYS.presetId)
  const ws = p.get(KEYS.windMs)
  return {
    presetId: id !== null && (PRESETS.some((x) => x.id === id) || id === LEGACY_CUSTOM_ID) ? id : DEFAULT_SETUP.presetId,
    roundId: itemId(KEYS.roundId),
    scopeId: itemId(KEYS.scopeId),
    customRifleId: itemId(KEYS.customRifleId),
    rifleSet: namesRifle(p),
    distanceM: num(KEYS.distanceM, BOUNDS.distanceM.min, BOUNDS.distanceM.max, DEFAULT_SETUP.distanceM),
    slopeDeg: num(KEYS.slopeDeg, BOUNDS.slopeDeg.min, BOUNDS.slopeDeg.max, DEFAULT_SETUP.slopeDeg),
    // To a thousandth of a m/s: the bar steps in the owner's wind unit (0.5 m/s, 2 km/h, 1 mph, 1 kn), not on one m/s grid.
    windSet: ws !== null && ws.trim() !== '' && Number.isFinite(Number(ws)),
    windMs: Math.round(num(KEYS.windMs, BOUNDS.windMs.min, BOUNDS.windMs.max, DEFAULT_SETUP.windMs) * 1000) / 1000,
    windClock: Math.round(num(KEYS.windClock, 1, 12, DEFAULT_SETUP.windClock)),
    zonesOn: p.get(ZONE_KEYS.zonesOn) === '1',
    windMid: zoneWind(ZONE_KEYS.windMid),
    windFar: zoneWind(ZONE_KEYS.windFar),
    // Fixed at 50 cm for now: the target is not a link input (a later target type will bring its own).
    targetCm: DEFAULT_SETUP.targetCm,
  }
}

/** The setup's own params, without the overrides and the display. */
function setupParams(s: RealSetup): URLSearchParams {
  const p = new URLSearchParams()
  for (const [field, key] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
    if (!s.rifleSet && field === 'presetId') continue
    if (!s.windSet && (field === 'windMs' || field === 'windClock')) continue
    const v = s[field]
    if (v !== null) p.set(key, String(v))
  }
  if (s.zonesOn) p.set(ZONE_KEYS.zonesOn, '1')
  if (s.windMid !== null) p.set(ZONE_KEYS.windMid, `${s.windMid.ms},${s.windMid.clock}`)
  if (s.windFar !== null) p.set(ZONE_KEYS.windFar, `${s.windFar.ms},${s.windFar.clock}`)
  return p
}

/**
 * The setup as link params, a custom item's id only when one is selected; with `o`, the preset's overrides too (none for
 * an empty set). `o` never goes with a custom round (Ruling 1): the overrides are a built-in round's.
 */
export function writeRealSetup(s: RealSetup, d: Display, o?: Overrides): URLSearchParams {
  const p = setupParams(s)
  const link = s.roundId === null ? writeLinkOverrides(o) : null
  if (link !== null) p.set(LINK_KEY, link)
  // The language is in the path (src/lang.ts), not the link.
  p.set('u', d.system)
  p.set('a', d.angle)
  return p
}

export const SETUP_KEY = 'gb.real.setup'
const NO_LINK_KEYS: ReadonlySet<keyof Overrides> = new Set()
const hasSetupParams = (p: URLSearchParams) => [...Object.values(KEYS), ...Object.values(ZONE_KEYS)].some((k) => p.has(k))

function loadStored(): URLSearchParams {
  try {
    return new URLSearchParams(localStorage.getItem(SETUP_KEY) ?? '')
  } catch {
    return new URLSearchParams()
  }
}

function store(params: string): void {
  try {
    localStorage.setItem(SETUP_KEY, params)
  } catch {
    // Private mode or blocked storage: the URL still carries the setup.
  }
}

/**
 * The setup params the app last put in the URL, kept per tab, so a reload, a language switch or a return to the page
 * still tells the app's own URL from a link. `gb.real.setup` can't: it stores a link's setup too.
 */
const WRITTEN_KEY = 'gb.real.written'

function loadWritten(): string | null {
  try {
    return sessionStorage.getItem(WRITTEN_KEY)
  } catch {
    return null
  }
}

function storeWritten(params: string): void {
  try {
    sessionStorage.setItem(WRITTEN_KEY, params)
  } catch {
    // Blocked storage: the page keeps it in memory while it is open.
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
   * `move` changes the setup in the same write, the preset included, so the edit lands on the preset the setup moves to
   * (selection.ts dropUnknown: a link's unknown ids go with the first edit).
   */
  save: (patch: Overrides | null, move?: Partial<RealSetup>) => void
}

/**
 * The current REAL setup from the URL, plus a setter that writes back to it, the current preset's overrides, and whether
 * the setup came from a link: a URL the app didn't write, opened or pasted. A bare link reopens the last setup. The URL
 * is the share link, so it always carries the overrides on screen (`o=`); the stored setup never does: a link's values
 * are for the view that opened it, and storage gets them only with an edit. While a custom round is selected there are
 * no preset overrides on screen: `o=` is neither read nor written (Ruling 1), and `own` is undefined. So it is under the
 * retired Custom preset's id: an old link's `o=` holds Custom's values, which belong to no preset this build has.
 */
export function useRealSetup(): [RealSetup, (patch: Partial<RealSetup>) => void, PresetOverrides, boolean] {
  const { route, navigate, display } = useSettings()
  const [all, saveOverrides] = useOverrides()
  const [library] = useLibrary()
  const fromUrl = hasSetupParams(route.params)
  const read = useMemo(() => {
    if (!fromUrl) return readRealSetup(loadStored())
    const fromLink = readRealSetup(route.params)
    // A link without a rifle opens as today on a device whose stored setup names one.
    return fromLink.rifleSet || !namesRifle(loadStored()) ? fromLink : { ...fromLink, rifleSet: true }
  }, [route.params, fromUrl])
  // A bare page whose stored setup names the retired Custom preset (`p=custom`) opens what that resolves to, by the ids
  // of the items migrated from it, as the first change would put them (selection.ts dropUnknown); with nothing migrated
  // only `p` moves. So the URL a share copies never says `custom`, which on another device opens that device's own Custom.
  const setup = useMemo(
    () => (fromUrl || !isLegacy(read) ? read : { ...read, ...dropUnknown(read, resolveSelection(read, library, all, undefined, NO_LINK_KEYS, false), {}) }),
    [read, fromUrl, library, all],
  )
  // The setup the app last put in the URL in this tab, by its own params (WRITTEN_KEY): a bare page's and every
  // write's. The display and the overrides don't count: ⚙ rewrites the URL too. A setup that differs came from a link,
  // opened or pasted, and stays one until the app writes the URL.
  const setupKey = setupParams(setup).toString()
  const [written, setWritten] = useState(loadWritten)
  if (!fromUrl && written !== setupKey) setWritten(setupKey)
  const fromLinkUrl = fromUrl && setupKey !== written
  useEffect(() => {
    if (written !== null) storeWritten(written)
  }, [written])
  const custom = setup.roundId !== null || setup.presetId === LEGACY_CUSTOM_ID
  const stored = all[setup.presetId]
  const urlLink = fromUrl ? route.params.get(LINK_KEY) : null
  const link = useMemo(() => (custom ? null : readLinkOverrides(urlLink)), [urlLink, custom])
  const merged = useMemo(() => (link === null ? stored : linkOverrides(stored, link)), [stored, link])
  const fromLink = !sameOverrides(merged, stored)
  const own = custom ? undefined : fromLink ? merged : stored
  const linkKeys = useMemo(() => linkedKeys(stored, merged), [stored, merged])

  const stashed = writeRealSetup(setup, display).toString()
  const want = custom ? null : writeLinkOverrides(stored)
  // Where the URL has to go: a bare one gets the setup and the stored overrides; one without a link's values on screen
  // gets the stored overrides in place of what its `o=` holds (none, garbage, or another browser's).
  let target: string | null = null
  if (!fromUrl) target = writeRealSetup(setup, display, stored).toString()
  else {
    const q = new URLSearchParams(route.params)
    // A link without a rifle, opened where a rifle is stored, gets the default preset written.
    if (setup.rifleSet && !namesRifle(q)) q.set(KEYS.presetId, setup.presetId)
    if (!fromLink && urlLink !== want) {
      if (want === null) q.delete(LINK_KEY)
      else q.set(LINK_KEY, want)
    }
    if (q.toString() !== route.params.toString()) target = q.toString()
  }
  useEffect(() => {
    store(stashed)
    if (target !== null) navigate({ params: new URLSearchParams(target) })
  }, [stashed, target, navigate])

  const update = useCallback(
    (patch: Partial<RealSetup>) => {
      const wind = 'windMs' in patch || 'windClock' in patch || patch.windSet === true
      const rifle = 'presetId' in patch || 'roundId' in patch || 'customRifleId' in patch || patch.rifleSet === true
      const next = readRealSetup(writeRealSetup({ ...setup, ...patch, windSet: setup.windSet || wind, rifleSet: setup.rifleSet || rifle }, display))
      // Another preset brings its own stored overrides; the same one keeps what is on screen, a link's values included.
      // Leaving a custom round for a built-in one brings that preset's stored overrides.
      const same = next.presetId === setup.presetId && !custom
      setWritten(setupParams(next).toString())
      navigate({ params: writeRealSetup(next, display, same ? own : all[next.presetId]) })
    },
    [setup, display, navigate, own, all, custom],
  )
  const save = useCallback(
    (patch: Overrides | null, move?: Partial<RealSetup>) => {
      const next = move === undefined ? setup : { ...setup, ...move }
      // With a link, the stored set is replaced, not merged into: the link may have taken away a stored pair's other half.
      // (A move to another preset leaves a custom round, which has no link values.)
      const cleared = Object.fromEntries(Object.keys(stored ?? {}).map((k) => [k, undefined])) as Overrides
      const now = saveOverrides(next.presetId, patch === null || !fromLink ? patch : { ...cleared, ...own, ...patch })
      if (move !== undefined) setWritten(setupParams(next).toString())
      navigate({ params: writeRealSetup(next, display, now) })
    },
    [saveOverrides, setup, display, navigate, own, stored, fromLink],
  )
  const useMine = useCallback(() => navigate({ params: writeRealSetup(setup, display, stored) }), [navigate, setup, display, stored])
  return [setup, update, { own, fromLink, linkKeys, useMine, save }, fromLinkUrl]
}

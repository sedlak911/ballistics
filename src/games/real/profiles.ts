import { useCallback, useSyncExternalStore } from 'react'
import type { AngleUnit } from '../../engine/units'
import { PRESETS } from './data/presets'
import type { RealPreset, Sourced } from './types'

/** What the user changed in each preset: kept in this browser only. */
export interface Overrides {
  sightHeightMm?: number
  accuracyMoa?: number
  groupShots?: 3 | 5
  twistIn?: number
  /** The barrel's twist direction: a left-hand twist flips spin drift and the aerodynamic jump. */
  twist?: 'right' | 'left'
  muzzleVelocityMs?: number
  mvRefTempC?: number
  mvSdMs?: number
  powderSensMsPerC?: number
  bc?: number
  dragModel?: 'G1' | 'G7'
  massGr?: number
  diameterIn?: number
  lengthMm?: number
  zeroM?: number
  /** In the scope's unit (MRAD or MOA). */
  clickValue?: number
  /** Turret travel up in the scope's unit; null means unknown. */
  travelUp?: number | null
  /** The unit clickValue and travelUp were entered in: written with every click or travel write. */
  scopeUnit?: AngleUnit
  /** The MV came from truing at this distance, shown in the calculation view. */
  truedAtM?: number
}

/** A preset with its overrides applied. The optional inputs can be null: a custom item may lack them, a built-in never does. */
export interface ResolvedPreset extends Omit<RealPreset, 'twistIn' | 'mvRefTempC' | 'powderSensMsPerC' | 'accuracyMoa' | 'bullet'> {
  twistIn: Sourced<number> | null
  mvRefTempC: Sourced<number> | null
  powderSensMsPerC: Sourced<number> | null
  accuracyMoa: Sourced<number> | null
  bullet: { massGr: Sourced<number>; diameterIn: Sourced<number> | null; lengthMm: Sourced<number> | null }
  /** The scope's magnification; null for every built-in preset. */
  magnification: number | null
  zeroM: number
  /** The zero is yours: stored as an override (a link's, see linkKeys) or your own scope's; false at the default. */
  zeroSet: boolean
  clickValue: number
  travelUp: number | null
  /** The unit of clickValue and travelUp; null when none was stored, so solveReal uses the unit's defaults. */
  scopeUnit: AngleUnit | null
  truedAtM: number | null
  /** The overrides a shared link brought (tagged 'link' rather than 'yours'); empty without a link. */
  linkKeys: ReadonlySet<keyof Overrides>
}

export const DEFAULT_ZERO_M = 100
export const CLICK_CHIPS: Record<AngleUnit, number[]> = { mil: [0.1, 0.05], moa: [0.25, 0.125] }
/** The click a scope has unless told otherwise: 0.1 MRAD or 1/4 MOA. */
export const defaultClick = (unit: AngleUnit): number => CLICK_CHIPS[unit][0]

/**
 * The click and travel a scope has in `unit` (R2): stored values count only when they were entered in this unit (a stored
 * click must also be one of the unit's chips); otherwise the unit's default click and an unknown travel.
 */
export function scopeValues(p: ResolvedPreset, unit: AngleUnit): { clickValue: number; clickKnown: boolean; travelUp: number | null; sameUnit: boolean } {
  const sameUnit = p.scopeUnit === unit
  const clickKnown = sameUnit && CLICK_CHIPS[unit].includes(p.clickValue)
  return { clickValue: clickKnown ? p.clickValue : defaultClick(unit), clickKnown, travelUp: sameUnit ? p.travelUp : null, sameUnit }
}

const NO_KEYS: ReadonlySet<keyof Overrides> = new Set()
const YOURS = 'yours'
/** The source of a value that came with a shared link and that the stored overrides don't hold (see `linkedKeys`). */
export const LINK_SOURCE = 'link'
const sourced = <T,>(value: T, link: boolean): Sourced<T> => ({ value, trust: 'V', source: link ? LINK_SOURCE : YOURS })

/**
 * Preset values with the overrides applied; an overridden value's source becomes 'yours', or 'link' for a key in
 * `linkKeys` (what a shared link brought, see `linkedKeys`). Only the tag differs: the value is the same. Clicks stay at
 * the MRAD default unless overridden.
 */
export function resolvePreset(p: RealPreset, o: Overrides | undefined, linkKeys: ReadonlySet<keyof Overrides> = NO_KEYS): ResolvedPreset {
  const ov = o ?? {}
  const over = <T,>(v: T | undefined, base: Sourced<T>, key: keyof Overrides): Sourced<T> => (v === undefined ? base : sourced(v, linkKeys.has(key)))
  // Model and BC are a pair, and a table drag has neither: a BC alone keeps the preset's model, a model alone
  // (a BC belongs to its model) and anything on a table preset are ignored.
  let drag = p.drag
  if (ov.bc !== undefined && !('table' in p.drag.value)) drag = sourced({ model: ov.dragModel ?? p.drag.value.model, bc: ov.bc }, linkKeys.has('bc') || linkKeys.has('dragModel'))
  return {
    ...p,
    twistIn: over(ov.twistIn, p.twistIn, 'twistIn'),
    twist: ov.twist ?? p.twist,
    sightHeightMm: over(ov.sightHeightMm, p.sightHeightMm, 'sightHeightMm'),
    accuracyMoa: over(ov.accuracyMoa, p.accuracyMoa, 'accuracyMoa'),
    groupShots: ov.groupShots ?? p.groupShots,
    muzzleVelocityMs: over(ov.muzzleVelocityMs, p.muzzleVelocityMs, 'muzzleVelocityMs'),
    mvRefTempC: over(ov.mvRefTempC, p.mvRefTempC, 'mvRefTempC'),
    powderSensMsPerC: over(ov.powderSensMsPerC, p.powderSensMsPerC, 'powderSensMsPerC'),
    mvSdMs: ov.mvSdMs === undefined ? p.mvSdMs : sourced(ov.mvSdMs, linkKeys.has('mvSdMs')),
    drag,
    bullet: {
      massGr: over(ov.massGr, p.bullet.massGr, 'massGr'),
      diameterIn: over(ov.diameterIn, p.bullet.diameterIn, 'diameterIn'),
      lengthMm: ov.lengthMm === undefined ? p.bullet.lengthMm : sourced(ov.lengthMm, linkKeys.has('lengthMm')),
    },
    zeroM: ov.zeroM ?? DEFAULT_ZERO_M,
    zeroSet: ov.zeroM !== undefined,
    clickValue: ov.clickValue ?? defaultClick('mil'),
    travelUp: ov.travelUp ?? null,
    scopeUnit: ov.scopeUnit ?? null,
    truedAtM: ov.truedAtM ?? null,
    magnification: null,
    linkKeys,
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

type NumericOverride = Exclude<{ [K in keyof Overrides]-?: NonNullable<Overrides[K]> extends number ? K : never }[keyof Overrides], 'groupShots'>

/**
 * What each numeric override accepts, in stored units: the bounds of the menu field that writes it (M7), so the menus
 * and storage can't disagree. R13: every physical quantity has a minimum above zero. The click covers the chips of both
 * units (0.05–0.25), the travel 1 MRAD up to 200 MOA, the zero the stepper's 25–600 m.
 */
export const OVERRIDE_RANGES: Record<NumericOverride, { min: number; max: number }> = {
  sightHeightMm: { min: 20, max: 120 },
  accuracyMoa: { min: 0.1, max: 5 },
  twistIn: { min: 5, max: 20 },
  muzzleVelocityMs: { min: 200, max: 1300 },
  mvRefTempC: { min: -40, max: 60 },
  mvSdMs: { min: 0, max: 30 },
  powderSensMsPerC: { min: 0, max: 5 },
  bc: { min: 0.05, max: 1.2 },
  massGr: { min: 20, max: 1000 },
  diameterIn: { min: 0.17, max: 0.6 },
  lengthMm: { min: 10, max: 80 },
  zeroM: { min: 25, max: 600 },
  clickValue: { min: 0.05, max: 0.25 },
  travelUp: { min: 1, max: 200 },
  truedAtM: { min: 25, max: 2500 },
}

/** The turret travel the field accepts in each unit; storage and the scope menu share it. `OVERRIDE_RANGES.travelUp` is the union. */
export const TRAVEL_RANGES: Record<AngleUnit, { min: number; max: number }> = { mil: { min: 1, max: 60 }, moa: { min: 3.44, max: 200 } }

/** Field by field: a value outside its range is dropped, not clamped, since a clamped value isn't one the user set (M7). */
export function cleanOverrides(raw: unknown): Overrides {
  if (!isRecord(raw)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, { min, max }] of Object.entries(OVERRIDE_RANGES)) {
    const v = raw[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) out[k] = v
  }
  // The travel is checked against its own unit's bounds: the stored unit, else the MRAD resolvePreset falls back to.
  if (typeof out.travelUp === 'number') {
    const { min, max } = TRAVEL_RANGES[raw.scopeUnit === 'moa' ? 'moa' : 'mil']
    if (out.travelUp < min || out.travelUp > max) delete out.travelUp
  }
  if (raw.travelUp === null) out.travelUp = null
  if (raw.groupShots === 3 || raw.groupShots === 5) out.groupShots = raw.groupShots
  if (raw.dragModel === 'G1' || raw.dragModel === 'G7') out.dragModel = raw.dragModel
  if (raw.scopeUnit === 'mil' || raw.scopeUnit === 'moa') out.scopeUnit = raw.scopeUnit
  if (raw.twist === 'right' || raw.twist === 'left') out.twist = raw.twist
  // A trued distance without its MV means nothing.
  if (out.muzzleVelocityMs === undefined) delete out.truedAtM
  return out as Overrides
}

/** The stored presets' entries as they are, by preset id: `{ v: 1, presets }`, or an older map of presets at the top. */
export function storedPresets(raw: unknown): Record<string, unknown> {
  const src = isRecord(raw) && isRecord(raw.presets) ? raw.presets : raw
  return isRecord(src) ? src : {}
}

/** Anything stored is validated field by field: an unknown preset, a non-number and an out-of-range value are dropped, the rest is kept. */
export function readOverrides(raw: unknown): Record<string, Overrides> {
  const src = storedPresets(raw)
  const out: Record<string, Overrides> = {}
  for (const p of PRESETS) {
    if (!(p.id in src)) continue
    const o = cleanOverrides(src[p.id])
    if (Object.keys(o).length > 0) out[p.id] = o
  }
  return out
}

// A shared link carries the current preset's overrides (spec → Presets) as `o=`: their JSON, base64url, so the text
// holds only A–Z, a–z, 0–9, `-` and `_`, which URLSearchParams leaves as they are. JSON keeps every number exactly.

/** The overrides as a link's `o=` text; null when there are none. */
export function writeLinkOverrides(o: Overrides | undefined): string | null {
  if (o === undefined || Object.keys(o).length === 0) return null
  return btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A link's `o=` text, cleaned field by field like storage; null when nothing in it is usable. */
export function readLinkOverrides(text: string | null): Overrides | null {
  if (!text) return null
  try {
    const o = cleanOverrides(JSON.parse(atob(text.replace(/-/g, '+').replace(/_/g, '/'))))
    return Object.keys(o).length > 0 ? o : null
  } catch {
    return null
  }
}

// Fields that only mean something together: a BC and its model, a click and a travel and their unit, a trued
// distance and its MV. A link that has one of a group brings the whole group, so a half of the receiver's never pairs
// with the sender's (a stored MOA unit under the sender's MRAD travel, a G1 model under the sender's G7 BC).
const PAIRED: (keyof Overrides)[][] = [['bc', 'dragModel'], ['clickValue', 'travelUp', 'scopeUnit'], ['muzzleVelocityMs', 'truedAtM']]

/** A link's overrides on top of the stored ones: the link wins per field, and per group for the paired fields. */
export function linkOverrides(stored: Overrides | undefined, link: Overrides): Overrides {
  const out: Overrides = { ...stored, ...link }
  for (const group of PAIRED) {
    if (group.some((k) => k in link)) for (const k of group) if (!(k in link)) delete out[k]
  }
  return out
}

/**
 * The keys whose value in `merged` (stored overrides with a link's on top) came from the link: the stored set doesn't
 * have them or holds them differently. These read 'link' rather than 'yours'. Decided here, with the merge, and handed to
 * resolvePreset, so the menus and the calculation sheet read one source and the physics never sees the difference.
 */
export function linkedKeys(stored: Overrides | undefined, merged: Overrides | undefined): ReadonlySet<keyof Overrides> {
  const out = new Set<keyof Overrides>()
  for (const k of Object.keys(merged ?? {}) as (keyof Overrides)[]) if (stored?.[k] !== merged?.[k]) out.add(k)
  return out
}

/** Whether two override sets hold the same values. */
export function sameOverrides(a: Overrides | undefined, b: Overrides | undefined): boolean {
  const x = a ?? {}
  const y = b ?? {}
  const keys = Object.keys(x) as (keyof Overrides)[]
  return keys.length === Object.keys(y).length && keys.every((k) => k in y && x[k] === y[k])
}

export type Section = 'rifle' | 'round' | 'scope'
export const SECTIONS: Section[] = ['rifle', 'round', 'scope']
export const SECTION_KEYS: Record<Section, (keyof Overrides)[]> = {
  rifle: ['twistIn', 'twist', 'accuracyMoa', 'groupShots'],
  round: ['bc', 'dragModel', 'muzzleVelocityMs', 'truedAtM', 'mvRefTempC', 'powderSensMsPerC', 'mvSdMs', 'massGr', 'diameterIn', 'lengthMm'],
  scope: ['zeroM', 'clickValue', 'travelUp', 'scopeUnit', 'sightHeightMm'],
}

/** The section's override keys present in `own` (stored or from the link): the reset shows when non-empty. */
export function sectionKeysIn(own: Overrides | undefined, s: Section): (keyof Overrides)[] {
  return SECTION_KEYS[s].filter((k) => own !== undefined && k in own && own[k] !== undefined)
}

/** Fields that show as one: any key of a group in `own` counts the group once. */
const FIELD_GROUPS: Record<Section, (keyof Overrides)[][]> = {
  rifle: [['twistIn', 'twist'], ['accuracyMoa'], ['groupShots']],
  round: [['bc', 'dragModel'], ['muzzleVelocityMs', 'truedAtM'], ['mvRefTempC'], ['powderSensMsPerC'], ['mvSdMs'], ['massGr'], ['diameterIn'], ['lengthMm']],
  scope: [['zeroM'], ['sightHeightMm'], ['clickValue'], ['travelUp']],
}

/** The `{n} yours` chip: the section's visible fields holding an override. */
export function changedCount(p: ResolvedPreset, own: Overrides | undefined, s: Section, unit: AngleUnit): number {
  const present = new Set(sectionKeysIn(own, s))
  const sv = s === 'scope' ? scopeValues(p, unit) : null
  return FIELD_GROUPS[s].filter((g) => {
    if (!g.some((k) => present.has(k))) return false
    if (g[0] === 'clickValue') return sv!.clickKnown
    if (g[0] === 'travelUp') return sv!.travelUp !== null
    return true
  }).length
}

/** The patch that clears the section (keys set to undefined) and the undo that restores exactly what it removes. */
export function resetPatch(own: Overrides | undefined, s: Section): { patch: Overrides; undo: Overrides } {
  const patch: Record<string, undefined> = {}
  for (const k of SECTION_KEYS[s]) patch[k] = undefined
  const undo: Record<string, unknown> = {}
  for (const k of sectionKeysIn(own, s)) undo[k] = own![k]
  return { patch: patch as Overrides, undo: undo as Overrides }
}

export const PROFILES_KEY = 'gb.real.profiles'
const listeners = new Set<() => void>()
let cached: { raw: string | null; value: Record<string, Overrides> } | null = null

/** The stored text; null when there is none or storage is blocked. */
export function readProfilesRaw(): string | null {
  try {
    return localStorage.getItem(PROFILES_KEY)
  } catch {
    return null
  }
}

function parse(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw)
  } catch {
    // Corrupt storage: nothing overridden.
    return null
  }
}

function snapshot(): Record<string, Overrides> {
  const raw = readProfilesRaw()
  if (cached?.raw !== raw) cached = { raw, value: readOverrides(parse(raw)) }
  return cached.value
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const isPreset = (id: string) => PRESETS.some((p) => p.id === id)

/** What storage holds: its root when it is today's `{ v: 1, presets }` (a field this build doesn't know stays), and its presets' entries as stored. */
function stored(): { root: Record<string, unknown>; presets: Record<string, unknown> } {
  const parsed = parse(readProfilesRaw())
  return { root: isRecord(parsed) && isRecord(parsed.presets) ? parsed : {}, presets: storedPresets(parsed) }
}

const storedText = (root: Record<string, unknown>, presets: Record<string, unknown>) => JSON.stringify({ ...root, v: 1, presets })

/**
 * Merge a patch into one preset's overrides (an `undefined` field is removed); null resets the preset. Gives back the
 * preset's overrides as stored now.
 */
function save(presetId: string, patch: Overrides | null): Overrides | undefined {
  const all = { ...snapshot() }
  if (patch === null) delete all[presetId]
  else {
    const merged = { ...all[presetId], ...patch }
    for (const k of Object.keys(merged) as (keyof Overrides)[]) if (merged[k] === undefined) delete merged[k]
    const clean = cleanOverrides(merged)
    if (Object.keys(clean).length > 0) all[presetId] = clean
    else delete all[presetId]
  }
  // An entry this build doesn't know (the retired `custom` until its migration, or a later build's preset) stays as stored.
  const { root, presets } = stored()
  const kept = Object.entries(presets).filter(([id, e]) => !isPreset(id) && isRecord(e))
  const raw = storedText(root, { ...Object.fromEntries(kept), ...all })
  try {
    localStorage.setItem(PROFILES_KEY, raw)
    cached = { raw, value: all }
  } catch {
    // Blocked storage: keep it for this page view.
    cached = { raw: readProfilesRaw(), value: all }
  }
  listeners.forEach((l) => l())
  return all[presetId]
}

/**
 * Removes an entry this build doesn't read (the retired `custom`, once migrated) and keeps the rest as stored. The
 * overrides on screen don't change, so nobody is told. False when storage refused it.
 */
export function forgetStoredPreset(id: string): boolean {
  if (isPreset(id)) return false
  const value = snapshot()
  const { root, presets } = stored()
  const raw = storedText(root, Object.fromEntries(Object.entries(presets).filter(([k]) => k !== id)))
  try {
    localStorage.setItem(PROFILES_KEY, raw)
  } catch {
    return false
  }
  cached = { raw, value }
  return true
}

export function useOverrides(): [Record<string, Overrides>, (presetId: string, patch: Overrides | null) => Overrides | undefined] {
  const all = useSyncExternalStore(subscribe, snapshot)
  return [all, useCallback(save, [])]
}

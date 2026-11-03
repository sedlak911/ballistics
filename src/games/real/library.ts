import { useSyncExternalStore } from 'react'
import type { AngleUnit } from '../../engine/units'
import { migrateCustomPreset } from './migrate'
import { OVERRIDE_RANGES, TRAVEL_RANGES, type Overrides } from './profiles'

export const LIBRARY_KEY = 'gb.real.library'

export type RifleKey = 'twistIn' | 'twist' | 'accuracyMoa' | 'groupShots'
export type RoundKey = 'bc' | 'dragModel' | 'muzzleVelocityMs' | 'truedAtM' | 'mvRefTempC' | 'powderSensMsPerC' | 'mvSdMs' | 'massGr' | 'diameterIn' | 'lengthMm'
export type ScopeKey = 'zeroM' | 'clickValue' | 'travelUp' | 'scopeUnit' | 'sightHeightMm'

export interface CustomRifle extends Pick<Overrides, RifleKey> { id: string; name: string; barrelIn?: number; migratedFrom?: 'custom' }
export interface CustomRound extends Pick<Overrides, RoundKey> { id: string; rifleId: string; name: string; calibre?: string; mvBarrelIn?: number; overrides?: Overrides; migratedFrom?: 'custom' }
export interface CustomScope extends Pick<Overrides, ScopeKey> { id: string; rifleId: string; name: string; magnification?: number }
export interface Library { v: 1; rifles: CustomRifle[]; rounds: CustomRound[]; scopes: CustomScope[] }
export type ItemKind = 'rifle' | 'round' | 'scope'
/** What a delete removed, with each entry's former index, for Undo. */
export interface Removed { rifles: [number, unknown][]; rounds: [number, unknown][]; scopes: [number, unknown][] }

export const LIBRARY_RANGES = {
  barrelIn: { min: 4, max: 40 },
  mvBarrelIn: { min: 4, max: 40 },
  magnification: { min: 1, max: 60 },
} as const
export const NAME_MAX = 40
export const CALIBRE_MAX = 12

/**
 * A v4 UUID. `crypto.randomUUID` exists only in a secure context, so a page served over plain http (a phone on the dev
 * server across the LAN) builds one from `crypto.getRandomValues`, which every context has.
 */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const newId = (): string => `u-${uuid()}`

/** The form's entry bound for a field: `travelUp` is checked against `unit` (MRAD when not given). */
export function inRange(key: string, v: number, unit?: AngleUnit): boolean {
  if (!Number.isFinite(v)) return false
  const range = key === 'travelUp' ? TRAVEL_RANGES[unit ?? 'mil'] : (OVERRIDE_RANGES as Record<string, { min: number; max: number } | undefined>)[key] ?? (LIBRARY_RANGES as Record<string, { min: number; max: number } | undefined>)[key]
  return range !== undefined && v >= range.min && v <= range.max
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Field cleaners: a value of the right type comes back as it is (an out-of-range number stays), anything else is NO.
const NO = Symbol('no')
type Cleaner = (v: unknown) => unknown
const str: Cleaner = (v) => (typeof v === 'string' ? v.trim() : NO)
const num: Cleaner = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NO)
const oneOf = (...allowed: unknown[]): Cleaner => (v) => (allowed.includes(v) ? v : NO)
const numOrNull: Cleaner = (v) => (v === null ? null : num(v))
// A round's own overrides are cleaned by type only: no range check (ranges apply at resolution) and unknown keys stay.
const OVERRIDE_TYPES: Record<string, Cleaner> = {
  ...Object.fromEntries(Object.keys(OVERRIDE_RANGES).map((k) => [k, k === 'travelUp' ? numOrNull : num])),
  groupShots: oneOf(3, 5), dragModel: oneOf('G1', 'G7'), scopeUnit: oneOf('mil', 'moa'), twist: oneOf('right', 'left'),
}
function cleanOverridesByType(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue
    const c = OVERRIDE_TYPES[k] === undefined ? v : OVERRIDE_TYPES[k](v)
    if (c !== NO) out[k] = c
  }
  return out
}
const overrides: Cleaner = (v) => (isRecord(v) ? cleanOverridesByType(v) : NO)

const COMMON = { name: str }
const FIELDS: Record<ItemKind, Record<string, Cleaner>> = {
  rifle: { ...COMMON, barrelIn: num, twistIn: num, twist: oneOf('right', 'left'), accuracyMoa: num, groupShots: oneOf(3, 5), migratedFrom: oneOf('custom') },
  round: {
    ...COMMON, calibre: str, mvBarrelIn: num, bc: num, dragModel: oneOf('G1', 'G7'), muzzleVelocityMs: num, truedAtM: num, mvRefTempC: num,
    powderSensMsPerC: num, mvSdMs: num, massGr: num, diameterIn: num, lengthMm: num, overrides, migratedFrom: oneOf('custom'),
  },
  scope: { ...COMMON, magnification: num, zeroM: num, clickValue: num, travelUp: numOrNull, scopeUnit: oneOf('mil', 'moa'), sightHeightMm: num },
}
const ARRAY_KEY = { rifle: 'rifles', round: 'rounds', scope: 'scopes' } as const

/**
 * The values `raw` holds under `keys` that an item of `kind` takes, cleaned field by field as a read cleans them: a
 * value of the wrong type is left out, an out-of-range number stays (it is flagged in its field and counts as missing).
 */
export function itemFields(kind: ItemKind, raw: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    const clean = FIELDS[kind][k]
    if (clean === undefined || !(k in raw)) continue
    const v = clean(raw[k])
    if (v !== NO) out[k] = v
  }
  return out
}
const NEEDS_RIFLE: Record<ItemKind, boolean> = { rifle: false, round: true, scope: true }

/** The cleaned item for one raw entry; null when it isn't an object or can't be addressed (no id, or no rifle for a round or scope). */
function cleanItem<T>(kind: ItemKind, raw: unknown): T | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  if (NEEDS_RIFLE[kind] && typeof raw.rifleId !== 'string') return null
  const out: Record<string, unknown> = { id: raw.id }
  if (NEEDS_RIFLE[kind]) out.rifleId = raw.rifleId
  for (const [k, clean] of Object.entries(FIELDS[kind])) {
    if (!(k in raw)) continue
    const v = clean(raw[k])
    if (v !== NO) out[k] = v
  }
  return out as T
}

const EMPTY: Library = { v: 1, rifles: [], rounds: [], scopes: [] }

const cleanList = <T,>(kind: ItemKind, rawList: unknown[]): T[] => rawList.flatMap((e) => cleanItem<T>(kind, e) ?? [])

/** What a read keeps: the root as stored (so unknown fields survive), its raw arrays, and the cleaned view. */
interface State { root: Record<string, unknown>; raw: { rifles: unknown[]; rounds: unknown[]; scopes: unknown[] }; view: Library }

function parseState(parsed: unknown): State {
  const root = isRecord(parsed) ? parsed : {}
  const list = (k: string): unknown[] => (Array.isArray(root[k]) ? (root[k] as unknown[]) : [])
  const raw = { rifles: list('rifles'), rounds: list('rounds'), scopes: list('scopes') }
  const view: Library = { v: 1, rifles: cleanList('rifle', raw.rifles), rounds: cleanList('round', raw.rounds), scopes: cleanList('scope', raw.scopes) }
  return { root, raw, view }
}

/** The cleaned view of anything stored. */
export function readLibrary(raw: unknown): Library {
  return raw === null || raw === undefined ? { ...EMPTY } : parseState(typeof raw === 'string' ? safeParse(raw) : raw).view
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const listeners = new Set<() => void>()
let cached: { raw: string | null; state: State } | null = null

function readStored(): string | null {
  try {
    return localStorage.getItem(LIBRARY_KEY)
  } catch {
    return null
  }
}

function current(): State {
  const raw = readStored()
  if (cached?.raw !== raw) cached = { raw, state: parseState(raw === null ? null : safeParse(raw)) }
  return cached.state
}

/** The library as this page view has it: storage's, or what storage refused to take. */
export const currentLibrary = (): Library => current().view

/**
 * A field at the library's top, kept through every write: the JSON text of the `custom` entry of `gb.real.profiles`
 * whose values the migrated items last took (migrate.ts), so the same entry is never applied twice.
 */
export const MIGRATED_ENTRY_KEY = 'migratedCustomEntry'

/** A field at the library's top as this page view has it; undefined when there is none. */
export const libraryRootField = (key: string): unknown => current().root[key]

// A write from inside the snapshot (the migration) tells the other readers after the render, never during it.
let inSnapshot = false
const notify = () => listeners.forEach((l) => l())

/** A `v` a later release stored: this build reads it field by field, but never writes over it with its own, lower one. */
const laterV = (root: State['root']): boolean => typeof root.v === 'number' && root.v > 1

/**
 * Stores the state; the page view keeps it when storage refuses, or when storage holds a later release's `v` (a write
 * would lower it). Returns whether storage took it.
 */
function commit(raw: State['raw'], root: State['root']): boolean {
  const later = laterV(root)
  const next = { ...root, v: later ? root.v : 1, rifles: raw.rifles, rounds: raw.rounds, scopes: raw.scopes }
  const text = JSON.stringify(next)
  let ok = !later
  if (ok) {
    try {
      localStorage.setItem(LIBRARY_KEY, text)
    } catch {
      ok = false
    }
  }
  cached = { raw: ok ? text : readStored(), state: parseState(next) }
  if (!inSnapshot) notify()
  else if (listeners.size > 0) queueMicrotask(notify)
  return ok
}

/** `item` over the raw entry: fields the reader doesn't know stay, known ones come from `item`. */
function mergeRaw(kind: ItemKind, rawEntry: unknown, item: object): Record<string, unknown> {
  const known = FIELDS[kind]
  const out: Record<string, unknown> = {}
  if (isRecord(rawEntry)) for (const [k, v] of Object.entries(rawEntry)) if (!(k in known)) out[k] = v
  return Object.assign(out, item)
}

function nextRaw(kind: ItemKind, rawList: unknown[], items: { id: string }[]): unknown[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const seen = new Set<string>()
  const out: unknown[] = []
  for (const e of rawList) {
    const c = cleanItem<{ id: string }>(kind, e)
    if (c === null) out.push(e)
    else if (byId.has(c.id) && !seen.has(c.id)) {
      seen.add(c.id)
      out.push(mergeRaw(kind, e, byId.get(c.id)!))
    }
  }
  for (const i of items) if (!seen.has(i.id)) out.push({ ...i })
  return out
}

/**
 * Writes the view `next`, and `rootFields` at the top; entries it can't read, and fields it doesn't know, are kept.
 * False when storage refused, or holds a later release's `v` (the page view keeps it either way).
 */
export function writeLibrary(next: Library, rootFields: Record<string, unknown> = {}): boolean {
  const { root, raw } = current()
  const lists = { rifles: nextRaw('rifle', raw.rifles, next.rifles), rounds: nextRaw('round', raw.rounds, next.rounds), scopes: nextRaw('scope', raw.scopes, next.scopes) }
  return commit(lists, { ...root, ...rootFields })
}

export interface LibraryActions {
  addRifle(rifle: Omit<CustomRifle, 'id'>, round: Omit<CustomRound, 'id' | 'rifleId'>): { rifleId: string; roundId: string }
  addRound(round: Omit<CustomRound, 'id'>): string
  addScope(scope: Omit<CustomScope, 'id'>): string
  /** Merges a patch into one item; a key set to undefined is removed. */
  update(kind: ItemKind, id: string, patch: Record<string, unknown>): void
  /** Removes the item; a rifle takes its rounds and scopes with it. */
  remove(kind: ItemKind, id: string): Removed
  /** Puts removed entries back at their former indices. */
  restore(removed: Removed): void
}

const rawId = (e: unknown): unknown => (isRecord(e) ? e.id : undefined)
const rawRifleId = (e: unknown): unknown => (isRecord(e) ? e.rifleId : undefined)

const actions: LibraryActions = {
  addRifle(rifle, round) {
    const rifleId = newId()
    const roundId = newId()
    const lib = current().view
    writeLibrary({ ...lib, rifles: [...lib.rifles, { ...rifle, id: rifleId }], rounds: [...lib.rounds, { ...round, id: roundId, rifleId }] })
    return { rifleId, roundId }
  },
  addRound(round) {
    const id = newId()
    const lib = current().view
    writeLibrary({ ...lib, rounds: [...lib.rounds, { ...round, id }] })
    return id
  },
  addScope(scope) {
    const id = newId()
    const lib = current().view
    writeLibrary({ ...lib, scopes: [...lib.scopes, { ...scope, id }] })
    return id
  },
  update(kind, id, patch) {
    const lib = current().view
    const key = ARRAY_KEY[kind]
    const list = lib[key] as { id: string }[]
    const item = list.find((i) => i.id === id)
    if (item === undefined) return
    const merged: Record<string, unknown> = { ...item }
    for (const [k, v] of Object.entries(patch)) {
      const clean = FIELDS[kind][k]
      if (clean === undefined) continue
      if (v === undefined) delete merged[k]
      else if (kind === 'round' && k === 'overrides' && isRecord(v)) {
        // Merged over what is stored, so a key the patch doesn't touch stays; an undefined key is removed.
        const base: Record<string, unknown> = { ...(isRecord(merged.overrides) ? merged.overrides : {}) }
        for (const [ok, ov] of Object.entries(v)) {
          if (ov === undefined) delete base[ok]
          else Object.assign(base, cleanOverridesByType({ [ok]: ov }))
        }
        merged.overrides = base
      } else {
        const c = clean(v)
        if (c !== NO) merged[k] = c
      }
    }
    writeLibrary({ ...lib, [key]: list.map((i) => (i.id === id ? merged : i)) } as Library)
  },
  remove(kind, id) {
    const { root, raw } = current()
    const gone = { rifles: [] as [number, unknown][], rounds: [] as [number, unknown][], scopes: [] as [number, unknown][] }
    const keep = (key: keyof typeof gone, match: (e: unknown) => boolean): unknown[] =>
      raw[key].filter((e, i) => (match(e) ? (gone[key].push([i, e]), false) : true))
    const next = {
      rifles: kind === 'rifle' ? keep('rifles', (e) => rawId(e) === id) : raw.rifles,
      rounds: kind === 'round' ? keep('rounds', (e) => rawId(e) === id) : kind === 'rifle' ? keep('rounds', (e) => rawRifleId(e) === id) : raw.rounds,
      scopes: kind === 'scope' ? keep('scopes', (e) => rawId(e) === id) : kind === 'rifle' ? keep('scopes', (e) => rawRifleId(e) === id) : raw.scopes,
    }
    commit(next, root)
    return gone
  },
  restore(removed) {
    const { root, raw } = current()
    const put = (list: unknown[], entries: [number, unknown][]): unknown[] => {
      const out = [...list]
      for (const [i, e] of [...entries].sort((a, b) => a[0] - b[0])) out.splice(Math.min(i, out.length), 0, e)
      return out
    }
    commit({ rifles: put(raw.rifles, removed.rifles), rounds: put(raw.rounds, removed.rounds), scopes: put(raw.scopes, removed.scopes) }, root)
  },
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The library, after today's Custom preset has moved into it (migrate.ts: once, and at no cost after that). A migration
 * that throws leaves the library as read, so the page still opens; Custom stays in `gb.real.profiles` for the next load.
 */
function snapshot(): Library {
  inSnapshot = true
  try {
    migrateCustomPreset()
  } catch {
    // The library as read.
  } finally {
    inSnapshot = false
  }
  return current().view
}

export function useLibrary(): [Library, LibraryActions] {
  return [useSyncExternalStore(subscribe, snapshot), actions]
}

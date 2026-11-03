import type { AngleUnit } from '../../engine/units'
import { DISPLAY_KEY } from '../../lang'
import { readDisplay } from '../../settings/url'
import { LEGACY_CUSTOM_ID } from './data/presets'
import {
  currentLibrary, itemFields, libraryRootField, MIGRATED_ENTRY_KEY, newId, writeLibrary, type CustomRifle, type CustomRound, type CustomScope, type Library,
} from './library'
import { forgetStoredPreset, linkOverrides, readProfilesRaw, SECTION_KEYS, storedPresets, type Overrides } from './profiles'

// Today's Custom preset becomes your own rifle, round and scope (spec, "Migrating today's Custom").

/** What the migrated rifle, round and scope are called, in both languages. */
const NAME = 'Custom'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** The display angle as ⚙ stored it (`gb.display`); MRAD when none is stored, or it can't be read. */
function displayAngle(): AngleUnit {
  let stored: unknown = null
  try {
    stored = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? 'null')
  } catch {
    // Missing, corrupt or blocked: the default.
  }
  return readDisplay(new URLSearchParams(), isRecord(stored) ? stored : {}).angle
}

const KNOWN = new Set<string>([...SECTION_KEYS.rifle, ...SECTION_KEYS.round, ...SECTION_KEYS.scope])

/** Custom's stored entry as the rifle, the round and the scope take it, and what stays as stored in the round's `overrides`. */
interface Parts {
  rifle: Partial<Overrides>
  round: Partial<Overrides>
  scope: Partial<Overrides>
  rest: Record<string, unknown>
  /** The entry cleared the travel (a null travel, written with its unit). */
  clearsTravel: boolean
}

/**
 * Splits Custom's stored entry. Only the stored values move, never the old preset's placeholders: an optional field
 * stays empty, so its effect is off, and a required one leaves its item incomplete, which the main screen asks for.
 * - Each value is cleaned by type only, as a library read cleans it (library.ts itemFields): a wrong type is left out, and
 *   an out-of-range number stays in its field, flagged there and counted as missing, never dropped.
 * - The rifle takes the rifle keys, the round the round keys. A BC stored alone was typed with the model unchanged (a BC
 *   alone keeps the preset's model), so it takes `model`.
 * - The scope takes the scope keys. A click and a travel count only in the unit they were entered in (R2): without a
 *   stored unit they never counted, so they don't move. A null travel means none.
 * - The round's `overrides` keep, as stored: a key this build doesn't know, a trued distance without its MV, and a click
 *   or a travel without its unit. The library keeps them through every write; on a custom rifle they reach nothing but
 *   the generic scope, where R2 ignores a click without a unit, as before.
 */
function parts(entry: Record<string, unknown>, model: 'G1' | 'G7'): Parts {
  const rifle = itemFields('rifle', entry, SECTION_KEYS.rifle) as Partial<Overrides>
  const round = itemFields('round', entry, SECTION_KEYS.round) as Partial<Overrides>
  const typed = itemFields('scope', entry, SECTION_KEYS.scope) as Partial<Overrides>
  const rest: Record<string, unknown> = Object.fromEntries(Object.entries(entry).filter(([k]) => !KNOWN.has(k)))
  if (round.truedAtM !== undefined && round.muzzleVelocityMs === undefined) {
    rest.truedAtM = round.truedAtM
    delete round.truedAtM
  }
  if (round.bc !== undefined && round.dragModel === undefined) round.dragModel = model
  const clearsTravel = typed.travelUp === null && typed.scopeUnit !== undefined
  if (typed.travelUp === null) delete typed.travelUp
  const scope = { ...typed }
  if (typed.scopeUnit === undefined) {
    for (const k of ['clickValue', 'travelUp'] as const) {
      if (typed[k] !== undefined) rest[k] = typed[k]
      delete scope[k]
    }
  }
  return { rifle, round, scope, rest, clearsTravel }
}

const has = (o: object) => Object.keys(o).length > 0
const NAMED = { name: NAME } as const
const MIGRATED = { migratedFrom: LEGACY_CUSTOM_ID } as const

/** A new scope `Custom` for `rifleId`: its unit the stored one, else the display angle. */
const newScope = (rifleId: string, scope: Partial<Overrides>): CustomScope => ({ id: newId(), rifleId, ...NAMED, ...scope, scopeUnit: scope.scopeUnit ?? displayAngle() })

/**
 * The library with Custom's stored entry moved in as a rifle, a round and a scope, or null when nothing in it moves. The
 * entry is Custom's whole state, so a BC stored alone was Custom's G7.
 */
function withCustom(lib: Library, entry: Record<string, unknown>): Library | null {
  const p = parts(entry, 'G7')
  if (!has(p.rifle) && !has(p.round) && !has(p.scope)) return null
  const rifleId = newId()
  const rifle: CustomRifle = { id: rifleId, ...NAMED, ...p.rifle, ...MIGRATED }
  const round: CustomRound = { id: newId(), rifleId, ...NAMED, ...p.round, ...(has(p.rest) ? { overrides: p.rest as Overrides } : {}), ...MIGRATED }
  const scopes = has(p.scope) ? [newScope(rifleId, p.scope)] : []
  return { ...lib, rifles: [...lib.rifles, rifle], rounds: [...lib.rounds, round], scopes: [...lib.scopes, ...scopes] }
}

/** `edits` on top of an item's fields: per field, and per group for the paired ones, as a link's go on top (profiles.ts linkOverrides). */
const onTop = <T extends object>(item: T, edits: Partial<Overrides>): T => linkOverrides(item as Overrides, edits) as T

/**
 * The library with Custom's stored entry applied, as edits, to the items already migrated from it: a tab open since
 * before this release no longer finds Custom's values in storage, so what it stores under Custom is its edits. They are
 * applied as 0.1.3 wrote them:
 * - An MV clears its trued distance (that page wrote `truedAtM: undefined` with it), and a BC and its model go together.
 *   A BC alone was typed with the model unchanged, so it keeps the round's.
 * - A click or a travel in the scope's own unit is a change of that one field, as that page wrote it: the other stays,
 *   and a null travel clears the travel. With another unit the click and the travel were the old unit's, so the group
 *   goes whole.
 * - The scope is the migrated rifle's first, as `p=custom` opens it, or a new one when the edits need it.
 */
function withEdits(lib: Library, round: CustomRound, entry: Record<string, unknown>): Library {
  const p = parts(entry, round.dragModel ?? 'G7')
  const scope = lib.scopes.find((s) => s.rifleId === round.rifleId)
  const sameUnit = scope !== undefined && (p.scope.scopeUnit === undefined || p.scope.scopeUnit === scope.scopeUnit)
  const edited = (s: CustomScope): CustomScope => {
    if (!sameUnit) return onTop(s, p.scope)
    const out: CustomScope = { ...s, ...p.scope }
    if (p.clearsTravel) delete out.travelUp
    return out
  }
  const scopes = !has(p.scope) && !p.clearsTravel ? lib.scopes
    : scope === undefined ? (has(p.scope) ? [...lib.scopes, newScope(round.rifleId, p.scope)] : lib.scopes)
      : lib.scopes.map((s) => (s === scope ? edited(s) : s))
  const rest = (r: CustomRound) => (has(p.rest) ? { overrides: { ...r.overrides, ...p.rest } as Overrides } : {})
  return {
    ...lib,
    rifles: lib.rifles.map((r) => (r.id === round.rifleId ? onTop(r, p.rifle) : r)),
    rounds: lib.rounds.map((r) => (r === round ? { ...onTop(r, p.round), ...rest(r) } : r)),
    scopes,
  }
}

/** The `gb.real.profiles` text the migration last looked at, in this page view. */
let seen: string | null | undefined
/** The text of the Custom entry the items took in this page view (the library's top keeps it too: MIGRATED_ENTRY_KEY). */
let taken: string | undefined

/**
 * Moves today's Custom preset (`gb.real.profiles`' `custom` entry) into the library, once. The library snapshot runs it,
 * so every reader of the library sees the result; it does nothing until the stored text changes, so it costs one read.
 * - `custom` leaves `gb.real.profiles` only after the library took the items.
 * - The library notes the text of the entry its items took. When it already holds the migrated round, the same entry
 *   again (an earlier load stored the items but couldn't remove `custom`, or this view keeps what storage refused)
 *   changes nothing, so an edit made since stays. Another entry is an old tab's edits, applied to those items. Never a
 *   second copy.
 * - When storage refuses, the items stay in this page view (library.ts), and the next load tries again.
 */
export function migrateCustomPreset(): void {
  const raw = readProfilesRaw()
  if (raw === seen) return
  seen = raw
  if (raw === null) return
  const entry = storedPresets(parse(raw))[LEGACY_CUSTOM_ID]
  if (!isRecord(entry)) return
  const text = JSON.stringify(entry)
  const lib = currentLibrary()
  const migrated = lib.rounds.find((r) => r.migratedFrom === LEGACY_CUSTOM_ID)
  const next = migrated === undefined ? withCustom(lib, entry)
    : text === taken || text === libraryRootField(MIGRATED_ENTRY_KEY) ? lib
      : withEdits(lib, migrated, entry)
  if (next === null) return
  taken = text
  if (writeLibrary(next, { [MIGRATED_ENTRY_KEY]: text })) forgetStoredPreset(LEGACY_CUSTOM_ID)
}

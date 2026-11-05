import { useCallback, useMemo } from 'react'
import type { AngleUnit } from '../../engine/units'
import { DEFAULT_PRESET_ID, LEGACY_CUSTOM_ID, PRESETS, presetsOfRifle } from './data/presets'
import { inRange, useLibrary, type CustomRifle, type CustomRound, type CustomScope, type ItemKind, type Library, type LibraryActions } from './library'
import {
  cleanOverrides, DEFAULT_ZERO_M, defaultClick, linkOverrides, resolvePreset, SECTION_KEYS, SECTIONS, useOverrides,
  type Overrides, type ResolvedPreset, type Section,
} from './profiles'
import type { PresetOverrides, RealSetup } from './setup'
import type { RealPreset, Sourced } from './types'

/** The fields only a custom item has; the rest reuse the `Overrides` keys (Ruling 5). */
export type ItemField = 'name' | 'calibre' | 'barrelIn' | 'mvBarrelIn' | 'magnification'
export type LibraryField = keyof Overrides | ItemField
export interface FieldRef { section: Section; key: LibraryField }
/** What a field of the settings sheet writes, through `save(section, patch)`; a key set to undefined clears it. */
export type FieldPatch = Overrides & Partial<Record<ItemField, unknown>>

/**
 * The setup's rifle, round and scope, built-in or custom, resolved into the preset the solver and the tags read (spec,
 * "Concepts" and "Where edits go").
 */
export interface Selection {
  /** What the solver and the tags read. */
  preset: ResolvedPreset
  /**
   * The overrides under the preset's built-in values, which the sheet tags `yours` and counts: a built-in round's own
   * (a link's included); under a custom round, its rifle's first preset's stored rifle and scope values with the
   * round's own on top, or on a custom rifle the round's scope overrides alone. Items' own fields aren't in it.
   */
  own: Overrides | undefined
  /** The selected rifle's id, built-in or custom. */
  rifleId: string
  /** The custom rifle; null for a built-in one. */
  rifle: CustomRifle | null
  /** The custom round; null for a built-in one, or for an id this device doesn't have. */
  round: CustomRound | null
  /** The custom scope; null for the generic scope. */
  scope: CustomScope | null
  /** The required fields of the selected custom items that are missing or out of range; [] means computable. */
  incomplete: FieldRef[]
  /** The empty optional fields of the selected custom items, in UNSET_ORDER. */
  unset: FieldRef[]
  /** What a link named that this device doesn't have; only for a setup that came from a link (setup.ts useRealSetup). */
  linkMissing: 'rifle' | 'round' | 'scope' | null
}

/** The optional fields the main screen asks for, most useful first. */
export const UNSET_ORDER: (keyof Overrides)[] = ['mvSdMs', 'powderSensMsPerC', 'mvRefTempC', 'accuracyMoa', 'twistIn', 'lengthMm', 'diameterIn', 'travelUp']

/**
 * The source of a stand-in for a missing required value. The page doesn't solve an incomplete selection, so nobody
 * reads it; it only keeps the preset whole.
 */
export const PLACEHOLDER_SOURCE = 'missing'

/**
 * The selection lacks this required value: it is listed in `incomplete`. Its stand-in is never printed as a value (the
 * summaries and the tags print `—`). The zero and the click have no source to say so, so they are found here.
 */
export const lacks = (incomplete: readonly FieldRef[], section: Section, key: LibraryField): boolean =>
  incomplete.some((f) => f.section === section && f.key === key)

const NO_KEYS: ReadonlySet<keyof Overrides> = new Set()
const DEFAULT_PRESET = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
const RIFLE_AND_SCOPE: (keyof Overrides)[] = [...SECTION_KEYS.rifle, ...SECTION_KEYS.scope]
/** A custom rifle's generic scope: today's scope defaults, and a sight height nobody measured. */
const GENERIC_SIGHT: Sourced<number> = { value: 60, trust: 'N', source: 'default' }
const NO_BARREL: Sourced<string> = { value: '—', trust: 'N', source: 'not set' }
const NO_TEXT = '—'

const yours = <T>(value: T): Sourced<T> => ({ value, trust: 'V', source: 'yours' })
const placeholder = <T>(s: Sourced<T>): Sourced<T> => ({ value: s.value, trust: 'N', source: PLACEHOLDER_SOURCE })
const sectionOf = (key: keyof Overrides): Section => SECTIONS.find((s) => SECTION_KEYS[s].includes(key))!

/** The keys of `o` among `keys`, a key set to undefined included. */
function only<T extends object>(o: T | undefined, keys: readonly string[]): Partial<T> {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => keys.includes(k))) as Partial<T>
}

/** What the selected custom items lack, in the order they are found: rifle, round, scope. */
interface Gaps { incomplete: FieldRef[]; unset: Set<keyof Overrides> }

/** A stored number that counts: one within today's bounds (an out-of-range one is kept in storage, never used). */
const usable = (key: string, v: unknown, unit?: AngleUnit): v is number => typeof v === 'number' && inRange(key, v, unit)

/** A required value: yours, or the placeholder and the field listed as incomplete. */
function required(v: unknown, section: Section, key: keyof Overrides, stand: Sourced<number>, gaps: Gaps): Sourced<number> {
  if (usable(key, v)) return yours(v)
  gaps.incomplete.push({ section, key })
  return placeholder(stand)
}

/** An optional value: yours, or null and the field listed as not set. */
function optional(v: unknown, key: keyof Overrides, gaps: Gaps): Sourced<number> | null {
  if (usable(key, v)) return yours(v)
  gaps.unset.add(key)
  return null
}

/** A custom item's name, trimmed; null, and listed as incomplete, when it has none. */
function itemName(name: string | undefined, section: Section, gaps: Gaps): string | null {
  const n = typeof name === 'string' ? name.trim() : ''
  if (n !== '') return n
  gaps.incomplete.push({ section, key: 'name' })
  return null
}

type RifleParts = Pick<ResolvedPreset, 'rifle' | 'rifleShort' | 'barrel' | 'users' | 'twistIn' | 'twist' | 'accuracyMoa' | 'groupShots'>
type RoundParts = Pick<
  ResolvedPreset,
  'round' | 'short' | 'calibre' | 'muzzleVelocityMs' | 'truedAtM' | 'mvRefTempC' | 'powderSensMsPerC' | 'mvSdMs' | 'drag' | 'bullet'
>
type ScopeParts = Pick<ResolvedPreset, 'sightHeightMm' | 'zeroM' | 'zeroSet' | 'clickValue' | 'travelUp' | 'scopeUnit'>

function customRifle(r: CustomRifle, gaps: Gaps): RifleParts {
  const name = itemName(r.name, 'rifle', gaps) ?? NO_TEXT
  return {
    rifle: name,
    rifleShort: name.slice(0, 10).trim(),
    barrel: usable('barrelIn', r.barrelIn) ? yours(`${r.barrelIn}″`) : NO_BARREL,
    users: [],
    twistIn: optional(r.twistIn, 'twistIn', gaps),
    twist: r.twist ?? 'right',
    accuracyMoa: optional(r.accuracyMoa, 'accuracyMoa', gaps),
    groupShots: r.groupShots ?? 3,
  }
}

/** A custom round's fields; a missing required one stands in with `stand`'s value, which nobody reads. */
function customRound(r: CustomRound, stand: RealPreset, gaps: Gaps): RoundParts {
  const name = itemName(r.name, 'round', gaps) ?? NO_TEXT
  const massGr = required(r.massGr, 'round', 'massGr', stand.bullet.massGr, gaps)
  // The BC and its model are one field.
  const bcKnown = usable('bc', r.bc) && r.dragModel !== undefined
  if (!bcKnown) gaps.incomplete.push({ section: 'round', key: 'bc' })
  const mv = required(r.muzzleVelocityMs, 'round', 'muzzleVelocityMs', stand.muzzleVelocityMs, gaps)
  const calibre = typeof r.calibre === 'string' ? r.calibre.trim() : ''
  return {
    round: name,
    short: name.slice(0, 22).trim(),
    calibre: calibre !== '' ? calibre : name.slice(0, 8).trim(),
    muzzleVelocityMs: mv,
    // A trued distance without its MV means nothing.
    truedAtM: mv.source !== PLACEHOLDER_SOURCE && usable('truedAtM', r.truedAtM) ? r.truedAtM : null,
    mvRefTempC: optional(r.mvRefTempC, 'mvRefTempC', gaps),
    powderSensMsPerC: optional(r.powderSensMsPerC, 'powderSensMsPerC', gaps),
    mvSdMs: optional(r.mvSdMs, 'mvSdMs', gaps),
    drag: bcKnown ? yours({ model: r.dragModel!, bc: r.bc! }) : placeholder(stand.drag),
    bullet: {
      massGr,
      diameterIn: optional(r.diameterIn, 'diameterIn', gaps),
      lengthMm: optional(r.lengthMm, 'lengthMm', gaps),
    },
  }
}

/** A custom round's own overrides for the rifle and the generic scope; one out of range counts as not there. */
const roundOverrides = (r: CustomRound): Overrides => cleanOverrides(only(r.overrides, RIFLE_AND_SCOPE))

/** A click, its travel and their unit mean something only together (profiles.ts PAIRED). */
const CLICK_GROUP: (keyof Overrides)[] = ['clickValue', 'travelUp', 'scopeUnit']

/**
 * The rifle and generic-scope overrides in effect under a custom round. On a built-in rifle they are its first preset's
 * stored ones with the round's on top, per field, and per group for the paired fields, as a link's. On a custom rifle
 * they are the round's alone.
 */
function roundLayers(round: CustomRound, overrides: Record<string, Overrides>): Overrides {
  const first = presetsOfRifle(round.rifleId)[0]
  return first === undefined ? roundOverrides(round) : linkOverrides(only(overrides[first.id], RIFLE_AND_SCOPE), roundOverrides(round))
}

/** Scope overrides on top of a scope, as resolvePreset applies them. */
function withScope(s: ScopeParts, o: Overrides): ScopeParts {
  return {
    sightHeightMm: o.sightHeightMm === undefined ? s.sightHeightMm : yours(o.sightHeightMm),
    zeroM: o.zeroM ?? s.zeroM,
    zeroSet: o.zeroM !== undefined || s.zeroSet,
    clickValue: o.clickValue ?? s.clickValue,
    travelUp: o.travelUp === undefined ? s.travelUp : o.travelUp,
    scopeUnit: o.scopeUnit ?? s.scopeUnit,
  }
}

/**
 * A custom scope's fields in place of the generic ones; a missing required one keeps the generic value, which nobody
 * reads. A link's scope values no longer show, so they no longer read "from link".
 */
function customScope(p: ResolvedPreset, s: CustomScope, gaps: Gaps): ResolvedPreset {
  itemName(s.name, 'scope', gaps)
  const unit = s.scopeUnit
  if (unit === undefined) gaps.incomplete.push({ section: 'scope', key: 'scopeUnit' })
  const need = (key: 'clickValue' | 'zeroM', v: unknown, stand: number): number => {
    if (usable(key, v)) return v
    gaps.incomplete.push({ section: 'scope', key })
    return stand
  }
  const clickValue = need('clickValue', s.clickValue, p.clickValue)
  const zeroM = need('zeroM', s.zeroM, p.zeroM)
  const sight = required(s.sightHeightMm, 'scope', 'sightHeightMm', p.sightHeightMm, gaps)
  const travelUp = usable('travelUp', s.travelUp, unit) ? s.travelUp : null
  if (travelUp === null) gaps.unset.add('travelUp')
  return {
    ...p,
    scopeUnit: unit ?? p.scopeUnit,
    clickValue,
    zeroM,
    zeroSet: usable('zeroM', s.zeroM),
    sightHeightMm: sight,
    travelUp,
    magnification: usable('magnification', s.magnification) ? s.magnification : null,
    linkKeys: new Set([...p.linkKeys].filter((k) => !SECTION_KEYS.scope.includes(k))),
  }
}

/**
 * The required fields a custom item lacks, missing or out of range, found as `resolveSelection` finds them and in its
 * order, so the add form's Save refuses exactly what the resolver would mark incomplete.
 */
export function incompleteFields(kind: ItemKind, item: Record<string, unknown>): FieldRef[] {
  const gaps: Gaps = { incomplete: [], unset: new Set() }
  if (kind === 'rifle') customRifle(item as unknown as CustomRifle, gaps)
  else if (kind === 'round') customRound(item as unknown as CustomRound, DEFAULT_PRESET, gaps)
  else customScope(resolvePreset(DEFAULT_PRESET, undefined), item as unknown as CustomScope, gaps)
  return gaps.incomplete
}

/** The setup names the retired Custom preset and no custom round: `p=custom` from an old link or stored setup. */
export const isLegacy = (setup: RealSetup): boolean => setup.roundId === null && setup.presetId === LEGACY_CUSTOM_ID

/**
 * The selection the setup names, resolved against the library (spec, "Where edits go"):
 * - a built-in round: `resolvePreset(preset, own, linkKeys)`, as today;
 * - a custom round on a built-in rifle: the rifle's first preset, with that preset's stored rifle and scope overrides
 *   and then the round's own `overrides` on top, and the round's fields from the item;
 * - a custom round on a custom rifle: the rifle's fields from the item, the generic scope's defaults (sight height 60,
 *   tagged default) and the round's scope overrides on top;
 * - a custom scope of the selected rifle replaces the generic scope's fields.
 * An unknown round opens the default preset with its stored overrides; an unknown scope, or one of another rifle, gives
 * the generic scope. `linkMissing` names what a link from the URL had that this device doesn't: the rifle when `cf`
 * names one that isn't here, else the round, else the scope.
 *
 * The retired Custom preset's id without a `cr` (an old link or stored setup, `p=custom`) names the round migrated from
 * it (migrate.ts), with its rifle's first scope, so the answer is the one Custom gave. Without that round it is an unknown
 * round, and the custom rifle is what a link names. A link's `o=` holds Custom's values, so it is never read for it.
 */
export function resolveSelection(
  setup: RealSetup,
  library: Library,
  overrides: Record<string, Overrides>,
  own: Overrides | undefined,
  linkKeys: ReadonlySet<keyof Overrides>,
  fromUrl: boolean,
): Selection {
  const gaps: Gaps = { incomplete: [], unset: new Set() }
  const legacy = isLegacy(setup)
  const roundId = legacy ? library.rounds.find((r) => r.migratedFrom === LEGACY_CUSTOM_ID)?.id ?? null : setup.roundId
  const found = roundId === null ? undefined : library.rounds.find((r) => r.id === roundId)
  const rifle = found === undefined ? null : library.rifles.find((r) => r.id === found.rifleId) ?? null
  const first = found === undefined ? undefined : presetsOfRifle(found.rifleId)[0]
  // A round whose rifle is in neither list can't be computed: it counts as unknown.
  const round = found !== undefined && (rifle !== null || first !== undefined) ? found : null
  const roundMissing = (setup.roundId !== null || legacy) && round === null

  let preset: ResolvedPreset
  let shown: Overrides | undefined
  if (round === null) {
    // `own` is the URL's preset's; an unknown round shows the default preset, so its stored overrides.
    const p = roundMissing ? DEFAULT_PRESET : PRESETS.find((x) => x.id === setup.presetId) ?? DEFAULT_PRESET
    shown = roundMissing ? overrides[p.id] : own
    preset = roundMissing ? resolvePreset(p, shown) : resolvePreset(p, own, linkKeys)
  } else if (rifle !== null) {
    const rifleParts = customRifle(rifle, gaps)
    const generic: ScopeParts = { sightHeightMm: GENERIC_SIGHT, zeroM: DEFAULT_ZERO_M, zeroSet: false, clickValue: defaultClick('mil'), travelUp: null, scopeUnit: null }
    shown = only(roundOverrides(round), SECTION_KEYS.scope)
    preset = {
      id: round.id, rifleId: rifle.id, ...rifleParts, ...customRound(round, DEFAULT_PRESET, gaps),
      ...withScope(generic, shown), magnification: null, linkKeys: NO_KEYS,
    }
  } else {
    // The round's rifle is built-in, so it has a first preset.
    const p = first!
    shown = roundLayers(round, overrides)
    preset = { ...resolvePreset(p, shown), id: round.id, rifleId: round.rifleId, ...customRound(round, p, gaps), magnification: null, linkKeys: NO_KEYS }
  }
  const rifleId = preset.rifleId

  const scopeId = legacy && setup.scopeId === null && round !== null ? library.scopes.find((s) => s.rifleId === round.rifleId)?.id ?? null : setup.scopeId
  const foundScope = scopeId === null ? undefined : library.scopes.find((s) => s.id === scopeId)
  const scope = foundScope !== undefined && foundScope.rifleId === rifleId ? foundScope : null
  if (scope !== null) preset = customScope(preset, scope, gaps)

  let linkMissing: Selection['linkMissing'] = null
  if (fromUrl && roundMissing) {
    const rifleGone = legacy || (setup.customRifleId !== null && !library.rifles.some((r) => r.id === setup.customRifleId))
    linkMissing = rifleGone ? 'rifle' : 'round'
  } else if (fromUrl && setup.scopeId !== null && foundScope === undefined) linkMissing = 'scope'

  return {
    preset,
    own: shown,
    rifleId,
    rifle: round === null ? null : rifle,
    round,
    scope,
    incomplete: gaps.incomplete,
    unset: UNSET_ORDER.filter((k) => gaps.unset.has(k)).map((key) => ({ section: sectionOf(key), key })),
    linkMissing,
  }
}

/** Where a section's edit goes. */
export type EditTarget =
  /** The built-in round's preset overrides, today's PresetOverrides.save. */
  | { to: 'preset' }
  /** A custom item's own fields. */
  | { to: 'item'; kind: ItemKind; id: string }
  /** A custom round's `overrides`: the built-in rifle's values, and the generic scope's, under that round. */
  | { to: 'roundOverrides'; id: string }

/**
 * | Section        | Built-in round | Custom round, built-in rifle | Custom round, custom rifle |
 * |----------------|----------------|------------------------------|----------------------------|
 * | rifle          | preset         | roundOverrides               | item(rifle)                |
 * | round          | preset         | item(round)                  | item(round)                |
 * | scope, generic | preset         | roundOverrides               | roundOverrides             |
 * | scope, custom  | item(scope)    | item(scope)                  | item(scope)                |
 */
export function editTarget(sel: Selection, section: Section): EditTarget {
  if (section === 'scope' && sel.scope !== null) return { to: 'item', kind: 'scope', id: sel.scope.id }
  if (sel.round === null) return { to: 'preset' }
  if (section === 'round') return { to: 'item', kind: 'round', id: sel.round.id }
  if (section === 'rifle' && sel.rifle !== null) return { to: 'item', kind: 'rifle', id: sel.rifle.id }
  return { to: 'roundOverrides', id: sel.round.id }
}

/**
 * Where the selection goes when its custom item of `kind` is deleted (spec, deleting):
 * - a round to its rifle's first round: a built-in rifle's first preset, or a custom rifle's first other round, on the
 *   same scope;
 * - a scope to the generic scope, the display angle as it is;
 * - a rifle, with its rounds and scopes, to the default preset.
 */
export function deleteFallback(sel: Selection, kind: ItemKind, library: Library): Partial<RealSetup> {
  if (kind === 'scope') return { scopeId: null }
  if (kind === 'round' && sel.rifle === null) return { presetId: presetsOfRifle(sel.rifleId)[0].id, roundId: null, customRifleId: null }
  const other = kind === 'round' ? library.rounds.find((r) => r.rifleId === sel.rifleId && r.id !== sel.round?.id) : undefined
  if (other !== undefined) return { roundId: other.id }
  return { presetId: DEFAULT_PRESET_ID, roundId: null, customRifleId: null, scopeId: null }
}

/**
 * A change of the setup with the ids this device doesn't have dropped, keeping what is on screen: an unknown round
 * gives way to the preset shown (the default one), an unknown scope, or one of another rifle, to the generic scope, and
 * a custom rifle id that isn't the selected rifle goes. A field the change sets to a new value is the change's; one it
 * leaves as it is, or doesn't name, drops its unknown id. `{}` gives the drop alone.
 *
 * The retired Custom preset's id gives way to what it opened: the migrated round with its rifle and scope by their ids
 * (`cr`, `cf`, `cs`), beside the default preset, which a link then opens on a device without them; or, with nothing
 * migrated, the default preset shown. So no edit ever lands on `custom` again.
 */
export function dropUnknown(setup: RealSetup, sel: Selection, patch: Partial<RealSetup>): Partial<RealSetup> {
  const next = { ...patch }
  const leaves = (k: keyof RealSetup) => !(k in patch) || patch[k] === setup[k]
  if (setup.roundId !== null && sel.round === null && leaves('roundId')) {
    next.roundId = null
    if (leaves('presetId')) next.presetId = sel.preset.id
  }
  if (setup.customRifleId !== null && setup.customRifleId !== sel.rifle?.id && leaves('customRifleId')) next.customRifleId = null
  if (setup.scopeId !== null && sel.scope === null && leaves('scopeId')) next.scopeId = null
  // The setup's ids are empty here, so what the change names is the change's, even an empty one (the generic scope).
  if (isLegacy(setup) && leaves('presetId')) {
    next.presetId = DEFAULT_PRESET_ID
    if (sel.round !== null && !('roundId' in patch)) {
      next.roundId = sel.round.id
      if (!('customRifleId' in patch)) next.customRifleId = sel.rifle?.id ?? null
      if (!('scopeId' in patch) && sel.scope !== null) next.scopeId = sel.scope.id
    }
  }
  return next
}

/**
 * The page's selection, and the one `save(section, patch)` every field of the settings sheet writes through: to the
 * built-in round's preset overrides (`po.save`), to a custom item, or to a custom round's `overrides`. The first change
 * of the setup after a link with ids this device doesn't have drops them (`dropUnknown`): `update` and `savePreset`
 * are the setup's own with that drop, and `save` moves the setup with its edit. A preset edit moves it in the same
 * write, so the edit lands on the preset that stays on screen.
 */
export function useSelection(setup: RealSetup, setSetup: (p: Partial<RealSetup>) => void, po: PresetOverrides, fromUrl: boolean): {
  sel: Selection
  library: Library
  actions: LibraryActions
  save: (section: Section, patch: FieldPatch) => void
  update: (patch: Partial<RealSetup>) => void
  savePreset: (patch: Overrides | null) => void
} {
  const [library, actions] = useLibrary()
  const [overrides] = useOverrides()
  const { own, linkKeys, save: writePreset } = po
  const sel = useMemo(() => resolveSelection(setup, library, overrides, own, linkKeys, fromUrl), [setup, library, overrides, own, linkKeys, fromUrl])
  const move = useMemo(() => {
    const drop = dropUnknown(setup, sel, {})
    return Object.keys(drop).length > 0 ? drop : undefined
  }, [setup, sel])
  const update = useCallback((patch: Partial<RealSetup>) => setSetup(dropUnknown(setup, sel, patch)), [setSetup, setup, sel])
  const savePreset = useCallback(
    (patch: Overrides | null) => (move === undefined ? writePreset(patch) : writePreset(patch, move)),
    [writePreset, move],
  )
  const save = useCallback(
    (section: Section, patch: FieldPatch) => {
      const target = editTarget(sel, section)
      if (target.to === 'preset') {
        // An unknown round shows the default preset, and no `o=` goes with `cr=`: the move puts that preset in the setup.
        savePreset(patch)
        return
      }
      if (target.to === 'item') actions.update(target.kind, target.id, { ...patch })
      else {
        // Only the section's own keys: a round's overrides keep whatever else they hold. A field writes only the half of
        // the click group it changed, and the top layer's group replaces the whole group below it (roundLayers). So the
        // write starts from the group in effect, and the round's overrides always hold a whole group, as a link does.
        const write = only(patch, SECTION_KEYS[section])
        const group = CLICK_GROUP.some((k) => k in write) ? only(roundLayers(sel.round!, overrides), CLICK_GROUP) : {}
        actions.update('round', target.id, { overrides: { ...group, ...write } })
      }
      if (move !== undefined) setSetup(move)
    },
    [sel, overrides, actions, savePreset, move, setSetup],
  )
  return { sel, library, actions, save, update, savePreset }
}

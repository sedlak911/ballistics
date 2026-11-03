import type { ReactNode } from 'react'
import type { AngleUnit, UnitSystem } from '../../../engine/units'
import { fmtDistance } from '../../../format'
import type { T } from '../../../i18n'
import type { Lang } from '../../../settings/url'
import { inRange, type CustomRifle, type CustomRound, type CustomScope, type LIBRARY_RANGES } from '../library'
import { LINK_SOURCE, type OVERRIDE_RANGES, type Overrides, type ResolvedPreset } from '../profiles'
import type { FieldPatch, LibraryField } from '../selection'
import type { Sourced } from '../types'
import { sourceMaker } from './realText'

/** A field that holds a number: an override's, or one only a custom item has. */
export type NumericField = keyof typeof OVERRIDE_RANGES | keyof typeof LIBRARY_RANGES
/** A field that holds one of a few choices. */
export type PickField = 'twist' | 'groupShots' | 'dragModel' | 'scopeUnit'
type Picks = { [K in PickField]: NonNullable<Overrides[K]> }

/**
 * What the settings sheet's field components read and write, whatever holds the values: a built-in preset with the
 * overrides under it (`presetFields`), a custom item (`itemFields`) or one not yet saved (`draftFields`).
 */
export interface Fields {
  t: T
  sys: UnitSystem
  lang: Lang
  /** What a field shows; null when not set. A stored out-of-range number is shown, and `bad` flags it. */
  num(k: NumericField): number | null
  /**
   * The stored value counts as missing in the formulas: outside today's bounds (`inRange`, the travel in the scope's own
   * unit), as the selection reads it. The field shows it flagged (NumberField `outOfRange`).
   */
  bad(k: NumericField): boolean
  /** A choice; a missing one is the default the selection resolves it to. */
  pick<K extends PickField>(k: K): NonNullable<Overrides[K]>
  /** A custom item's text, empty when it has none; `barrel` is a built-in rifle's as its preset gives it (`475 mm`). */
  text(k: 'name' | 'calibre' | 'barrel'): string
  /** The label row's tag: today's Source for a preset, `yours` for an item, nothing for a draft. */
  source(k: LibraryField): ReactNode
  /** Custom items and drafts: optional fields say `optional`, show `not set` and clear to not set. */
  custom: boolean
  /** A required field a refused Save asks for (the add form's draft only): flagged and empty until it is filled. */
  need(k: LibraryField): boolean
  /** Writes a patch; a key set to undefined clears it. */
  set(patch: Record<string, unknown>): void
}

/** The language and the unit system the fields speak in: `lang` for a number inside a sentence (realText.ts plain). */
export interface FieldEnv { t: T; sys: UnitSystem; lang: Lang }

/** A tag of a value with no preset source: yours or from a link (accent), the default, or not known (muted). */
export function plainTag(kind: 'yours' | 'link' | 'default' | 'unknown', t: T): ReactNode {
  const word = { yours: 'rm.src.yours', link: 'rm.src.link', default: 'rm.src.default', unknown: 'rm.unknown' } as const
  return (
    <span className="rm-src">
      <span className={kind === 'yours' || kind === 'link' ? 'tag acc' : 'tag muted'}>{t(word[kind])}</span>
    </span>
  )
}

const truedTag = (d: number, { t, sys }: FieldEnv): ReactNode => (
  <span className="rm-src"><span className="tag acc">{t('rm.src.trued', { d: fmtDistance(d, sys) })}</span></span>
)

/**
 * Where a preset value comes from: yours, from a link, the default, an estimate (trust N, dashed) or the preset's
 * maker. The prompt asks for a measurement of a value nobody measured. Only an override is yours: an untouched value
 * with trust N is an estimate, as the calculation sheet tags it.
 */
function sourceTag(s: Sourced<unknown>, env: FieldEnv, prompt?: string, trued?: number | null): ReactNode {
  if (trued != null) return truedTag(trued, env)
  const { t } = env
  const yours = s.source === 'yours'
  const link = s.source === LINK_SOURCE
  const estimate = !yours && !link && s.trust === 'N'
  return (
    <span className="rm-src">
      {yours ? (
        <span className="tag acc">{t('rm.src.yours')}</span>
      ) : link ? (
        <span className="tag acc">{t('rm.src.link')}</span>
      ) : s.source === 'default' ? (
        // A custom rifle's generic scope: today's default value (spec, "Required and optional fields").
        <span className="tag muted">{t('rm.src.default')}</span>
      ) : estimate ? (
        <span className="tag muted rm-est" title={s.source}>{t('rm.src.estimate')}</span>
      ) : (
        <span className="tag muted" title={s.source}>{t('rm.src.preset', { src: sourceMaker(s.source) })}</span>
      )}
      {estimate && prompt && <span className="rm-prompt">{prompt}</span>}
    </span>
  )
}

/**
 * A built-in preset's fields, with the overrides under them (`own`, a link's included; under a custom round its own
 * layers, see Selection.own). A click and its travel are set only with the unit they were entered in (R2): without a
 * stored unit they read as not set. A built-in round without a BC has a measured drag table.
 */
export function presetFields(preset: ResolvedPreset, own: Overrides | undefined, save: (patch: FieldPatch) => void, env: FieldEnv): Fields {
  const p = preset
  const drag = p.drag.value
  const table = 'table' in drag
  const unitSet = p.scopeUnit !== null
  const nums: Partial<Record<NumericField, number | null>> = {
    twistIn: p.twistIn?.value, accuracyMoa: p.accuracyMoa?.value, muzzleVelocityMs: p.muzzleVelocityMs.value, truedAtM: p.truedAtM,
    mvRefTempC: p.mvRefTempC?.value, powderSensMsPerC: p.powderSensMsPerC?.value, mvSdMs: p.mvSdMs?.value, bc: table ? null : drag.bc,
    massGr: p.bullet.massGr.value, diameterIn: p.bullet.diameterIn?.value, lengthMm: p.bullet.lengthMm?.value,
    sightHeightMm: p.sightHeightMm.value, zeroM: p.zeroM, clickValue: unitSet ? p.clickValue : null, travelUp: unitSet ? p.travelUp : null,
    magnification: p.magnification,
  }
  const picks: Picks = { twist: p.twist, groupShots: p.groupShots, dragModel: table ? 'G7' : drag.model, scopeUnit: p.scopeUnit ?? 'mil' }
  const sourced: Partial<Record<LibraryField, Sourced<unknown> | null>> = {
    barrelIn: p.barrel, twistIn: p.twistIn, accuracyMoa: p.accuracyMoa, muzzleVelocityMs: p.muzzleVelocityMs, mvRefTempC: p.mvRefTempC,
    powderSensMsPerC: p.powderSensMsPerC, mvSdMs: p.mvSdMs, bc: p.drag, dragModel: p.drag, massGr: p.bullet.massGr,
    diameterIn: p.bullet.diameterIn, lengthMm: p.bullet.lengthMm, sightHeightMm: p.sightHeightMm,
  }
  const mine = (k: keyof Overrides) => (p.linkKeys.has(k) ? 'link' : 'yours')
  return {
    ...env,
    num: (k) => nums[k] ?? null,
    // The overrides under a preset, a custom round's included, are range-checked where they are read (cleanOverrides),
    // so no value a preset's field shows is out of range.
    bad: () => false,
    pick: (k) => picks[k],
    text: (k) => (k === 'barrel' ? p.barrel.value : k === 'calibre' ? p.calibre : ''),
    source: (k) => {
      // The scope's values have no preset source: the zero is yours once stored; the click and travel are yours when the
      // field shows them, which only the field knows (R2), so it asks only then.
      if (k === 'zeroM') return plainTag(own?.zeroM !== undefined ? mine('zeroM') : 'default', env.t)
      if (k === 'clickValue' || k === 'travelUp' || k === 'scopeUnit') return plainTag(mine(k), env.t)
      const s = sourced[k]
      if (s === undefined) return null
      if (s === null) return plainTag('unknown', env.t)
      if (k === 'muzzleVelocityMs') return sourceTag(s, env, env.t('rm.chrono'), p.truedAtM)
      return sourceTag(s, env, k === 'sightHeightMm' ? env.t('rm.measureIt') : undefined)
    },
    custom: false,
    need: () => false,
    set: (patch) => save(patch as FieldPatch),
  }
}

/** The defaults the selection resolves a custom item's missing choice to (selection.ts customRifle; Ruling 8 for the model). */
const PICK_DEFAULTS: Picks = { twist: 'right', groupShots: 3, dragModel: 'G7', scopeUnit: 'mil' }

/** A custom item's or a draft's values, read as stored: an out-of-range number is shown, never dropped. */
function stored(rec: Record<string, unknown>, env: FieldEnv): Omit<Fields, 'source' | 'set'> {
  return {
    ...env,
    num: (k) => (typeof rec[k] === 'number' ? rec[k] : null),
    bad: (k) => typeof rec[k] === 'number' && !inRange(k, rec[k], k === 'travelUp' ? (rec.scopeUnit as AngleUnit | undefined) : undefined),
    pick: <K extends PickField>(k: K) => (rec[k] ?? PICK_DEFAULTS[k]) as Picks[K],
    text: (k) => (typeof rec[k] === 'string' ? rec[k] : ''),
    custom: true,
    need: () => false,
  }
}

/** A custom rifle, round or scope: its fields are its own, each set one tagged yours (a trued MV says where). */
export function itemFields(item: CustomRifle | CustomRound | CustomScope, save: (patch: FieldPatch) => void, env: FieldEnv): Fields {
  const rec = item as unknown as Record<string, unknown>
  return {
    ...stored(rec, env),
    source: (k) => {
      if (k === 'muzzleVelocityMs' && typeof rec.muzzleVelocityMs === 'number' && typeof rec.truedAtM === 'number') return truedTag(rec.truedAtM, env)
      return rec[k] != null ? plainTag('yours', env.t) : null
    },
    set: (patch) => save(patch as FieldPatch),
  }
}

/** An item not yet saved, held by the form: nothing in it comes from anywhere yet, so no field has a tag. */
export function draftFields(
  draft: Record<string, unknown>,
  setDraft: (update: (d: Record<string, unknown>) => Record<string, unknown>) => void,
  env: FieldEnv,
): Fields {
  return {
    ...stored(draft, env),
    source: () => null,
    set: (patch) => setDraft((d) => {
      const next = { ...d }
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k]
        else next[k] = v
      }
      return next
    }),
  }
}

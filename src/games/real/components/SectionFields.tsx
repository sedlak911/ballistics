/** The rifle, round and scope fields of the REAL settings sheet, shared with the add form (LibraryForm). */
import { useId, useState, type ReactNode } from 'react'
import { ChipGroup } from '../../../components/ChipGroup'
import { NumberField } from '../../../components/NumberField'
import { Segmented } from '../../../components/Segmented'
import { Stepper } from '../../../components/Stepper'
import { TextField } from '../../../components/TextField'
import { fromDisplay, LENGTH_TO_MM, MASS_TO_G, toDisplay, type AngleUnit } from '../../../engine/units'
import { fmtDistance } from '../../../format'
import { mvForBarrel } from '../barrel'
import { CALIBRE_MAX, LIBRARY_RANGES, NAME_MAX } from '../library'
import type { RealProfile } from '../profile'
import { CLICK_CHIPS, DEFAULT_ZERO_M, defaultClick, OVERRIDE_RANGES, TRAVEL_RANGES, type ResolvedPreset } from '../profiles'
import { trueReal } from '../solve'
import type { Station } from '../station'
import { plainTag, type Fields } from './fields'
import { clickLabel, plain } from './realText'

// What a field accepts, in the stored units: the overrides' own ranges (profiles.ts), so what a field writes is what
// storage keeps. A preset's stored value outside them is dropped (M7); a custom item's is kept and shows flagged.
const R = OVERRIDE_RANGES
const MV = R.muzzleVelocityMs
const BC = R.bc
const MASS_GR = R.massGr
const DIAMETER_IN = R.diameterIn
const LENGTH_MM = R.lengthMm
const TWIST_IN = R.twistIn
const SIGHT_MM = R.sightHeightMm
const ACCURACY_MOA = R.accuracyMoa
const MV_SD = R.mvSdMs
const POWDER_SENS = R.powderSensMsPerC
const MV_TEMP_C = R.mvRefTempC
// Turret travel is 1–60 MRAD; in MOA that is ×3.438, held to the 200 the store accepts.
const TRAVEL = TRAVEL_RANGES
const ZERO = { ...R.zeroM, step: 25 }
const MAGNIFICATION = LIBRARY_RANGES.magnification
const TRUE_DISTANCE_M = R.truedAtM
// The dial figure read at the distance: anything the load can't produce is refused by trueReal, not by the box.
const OBSERVED = { min: 0.01, max: 1000 }

const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
const ceilTo = (v: number, d: number) => Math.ceil(v * 10 ** d - 1e-9) / 10 ** d
const floorTo = (v: number, d: number) => Math.floor(v * 10 ** d + 1e-9) / 10 ** d
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * A stored quantity in the display unit, `per` stored units per displayed one. The shown value is rounded for reading;
 * a typed value converts back clamped to the stored range, so rounding can never push it outside the bounds.
 */
function scaled(per: number, digits: number, range: { min: number; max: number }) {
  return {
    show: (stored: number) => roundTo(stored / per, digits),
    store: (value: number) => clamp(value * per, range.min, range.max),
    min: ceilTo(range.min / per, digits),
    max: floorTo(range.max / per, digits),
  }
}

/** A field's head: the label left, where the value comes from right. */
function Head({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="rs-field-head">
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

/**
 * An optional field's own props. On a custom item or a draft it says `optional`, shows `not set` and clears to not set.
 * A built-in value never counts as not set, so a preset's field needs a value, except where no preset has one
 * (`unknown`: the SD, the bullet length and the travel).
 */
function optional(f: Fields, clear: () => void, unknownOnPreset = false) {
  if (f.custom) return { mark: f.t('lib.optional'), placeholder: f.t('lib.notSet'), onClear: clear }
  return unknownOnPreset ? { placeholder: f.t('rm.unknown'), onClear: clear } : {}
}

/** A custom item's name: it can't be empty, and the box holds it at NAME_MAX characters. */
function NameField({ f }: { f: Fields }) {
  return (
    <div className="rm-field">
      <TextField label={f.t('lib.name')} value={f.text('name')} maxLength={NAME_MAX} required needed={f.need('name')}
        invalidText={f.t('lib.nameNeed')} onChange={(name) => f.set({ name })} />
    </div>
  )
}

/**
 * The add form shows a kind's fields in two groups, the required ones and then the optional ones: a field component
 * given a `part` shows only that group, and never the section's own extras (the truing, the reading). Without one it
 * shows every field, as the section does.
 */
type Part = 'required' | 'optional'

/** A rifle's fields. A custom rifle adds its name and its barrel length; a built-in one shows its barrel as given. */
export function RifleFields({ f, part }: { f: Fields; part?: Part }) {
  const { t, sys } = f
  const range = (min: number, max: number) => t('rm.range', { min, max })
  const clear = (k: string) => () => f.set({ [k]: undefined })
  const len = sys === 'metric' ? 'mm' : 'in'
  const barrel = scaled(LENGTH_TO_MM[len] / LENGTH_TO_MM.in, len === 'mm' ? 0 : 2, LIBRARY_RANGES.barrelIn)
  const barrelIn = f.num('barrelIn')
  if (part === 'required') return <div className="rm-grid">{f.custom && <NameField f={f} />}</div>
  return (
    <div className="rm-grid">
      {f.custom && part === undefined && <NameField f={f} />}
      <div className="rm-field">
        {f.custom ? (
          <NumberField label={t('lib.barrel')} value={barrelIn === null ? null : barrel.show(barrelIn)} unit={len} min={barrel.min} max={barrel.max}
            step={len === 'mm' ? 5 : 0.5} invalidText={range(barrel.min, barrel.max)} onChange={(v) => f.set({ barrelIn: barrel.store(v) })}
            aside={f.source('barrelIn')} outOfRange={f.bad('barrelIn')} {...optional(f, clear('barrelIn'))} />
        ) : (
          <>
            <Head label={t('rm.barrel')}>{f.source('barrelIn')}</Head>
            <span className="rm-read">{f.text('barrel')}</span>
          </>
        )}
      </div>
      <div className="rm-field">
        <NumberField label={t('rm.twist')} value={f.num('twistIn')} unit={t('rm.twistUnit')} min={TWIST_IN.min} max={TWIST_IN.max} step={0.25}
          invalidText={range(TWIST_IN.min, TWIST_IN.max)} onChange={(v) => f.set({ twistIn: v })} aside={f.source('twistIn')} outOfRange={f.bad('twistIn')}
          {...optional(f, clear('twistIn'))} />
        <Segmented label={t('rm.twistDir')} value={f.pick('twist')} onChange={(twist) => f.set({ twist })}
          options={[{ value: 'right', label: t('rm.twistRight') }, { value: 'left', label: t('rm.twistLeft') }]} />
      </div>
      <div className="rm-field">
        <NumberField label={t('rm.accuracy')} value={f.num('accuracyMoa')} unit="MOA" min={ACCURACY_MOA.min} max={ACCURACY_MOA.max} step={0.1}
          invalidText={range(ACCURACY_MOA.min, ACCURACY_MOA.max)} onChange={(v) => f.set({ accuracyMoa: v })} aside={f.source('accuracyMoa')} outOfRange={f.bad('accuracyMoa')}
          {...optional(f, clear('accuracyMoa'))} />
      </div>
      <div className="rm-field">
        <Head label={t('rm.shots')} />
        <Segmented label={t('rm.shots')} value={String(f.pick('groupShots')) as '3' | '5'} onChange={(v) => f.set({ groupShots: v === '5' ? 5 : 3 })}
          options={[{ value: '3', label: '3' }, { value: '5', label: '5' }]} />
      </div>
    </div>
  )
}

/** What the truing solves with: the whole selection as the page has it. */
interface TruingWith {
  preset: ResolvedPreset
  profile: RealProfile
  station: Station
  unit: AngleUnit
  distanceM: number
}

/**
 * A round's fields. A custom round adds its name and calibre. `truing` adds `True the muzzle velocity ›` under the MV;
 * without it (a draft, or a selection that can't be computed) there is none. The add form's required group puts the
 * mass first, in the order the selection names what is missing.
 */
export function RoundFields({ f, truing, part, rifleBarrelIn }: {
  f: Fields
  truing?: TruingWith
  part?: Part
  /** The selected rifle's barrel in inches, when it is known: with the round's `mvBarrelIn` it gives the MV hint. */
  rifleBarrelIn?: number | null
}) {
  const { t, sys } = f
  const range = (min: number, max: number) => t('rm.range', { min, max })
  const clear = (k: string) => () => f.set({ [k]: undefined })
  // A built-in round without a BC has a measured drag table, shown read-only.
  const table = !f.custom && f.num('bc') === null
  const model = f.pick('dragModel')
  // The model and its BC are a pair: choosing the other model stores nothing until a BC for it is typed.
  const [pending, setPending] = useState<'G1' | 'G7' | null>(null)
  const [trueOpen, setTrueOpen] = useState(false)
  const truingId = useId()

  const mass = sys === 'metric' ? 'g' : 'gr'
  const massS = scaled(MASS_TO_G[mass] / MASS_TO_G.gr, mass === 'g' ? 2 : 1, MASS_GR)
  const lenUnit = sys === 'metric' ? 'mm' : 'in'
  const diameter = scaled(LENGTH_TO_MM[lenUnit] / LENGTH_TO_MM.in, lenUnit === 'mm' ? 2 : 3, DIAMETER_IN)
  const length = scaled(LENGTH_TO_MM[lenUnit], lenUnit === 'mm' ? 1 : 2, LENGTH_MM)
  const shown = (v: number | null, s: { show: (v: number) => number }) => (v === null ? null : s.show(v))
  // The row's arrow is drawn apart from its words, so it can turn when the truing is open.
  const truingText = t('rs.trueOpen').replace(/\s*›\s*$/, '')

  const nameField = f.custom && <NameField f={f} />
  const calibreField = f.custom && (
    <div className="rm-field">
      <TextField label={t('lib.calibre')} value={f.text('calibre')} maxLength={CALIBRE_MAX} mark={t('lib.optional')} placeholder={t('lib.notSet')}
        onChange={(v) => f.set({ calibre: v === '' ? undefined : v })} />
    </div>
  )
  const bcField = (
    <div className="rm-field">
      {table ? (
        <>
          <Head label={t('rm.bc')}>{f.source('bc')}</Head>
          <span className="rm-read">{t('rm.curve')}</span>
        </>
      ) : (
        <NumberField label={t('rm.bc')} value={f.num('bc')} unit={pending ?? model} units={['G1', 'G7']}
          onUnit={(u) => setPending(u === model ? null : (u as 'G1' | 'G7'))} min={BC.min} max={BC.max} step={0.001}
          needed={pending !== null || f.need('bc')} aside={f.source('bc')} outOfRange={f.bad('bc')}
          invalidText={pending ? t('rm.bcNeed', { model: pending, min: BC.min, max: BC.max }) : range(BC.min, BC.max)}
          onChange={(v) => {
            // A custom round stores its model with every BC: the two are one field (a BC alone leaves it incomplete).
            if (pending) {
              f.set({ dragModel: pending, bc: v })
              setPending(null)
            } else f.set(f.custom ? { dragModel: model, bc: v } : { bc: v })
          }} />
      )}
    </div>
  )
  const mvBarrel = scaled(LENGTH_TO_MM[lenUnit] / LENGTH_TO_MM.in, lenUnit === 'mm' ? 0 : 2, LIBRARY_RANGES.mvBarrelIn)
  const mvBarrelIn = f.num('mvBarrelIn')
  const mv = f.num('muzzleVelocityMs')
  const hint = f.custom && part === undefined && mv !== null && mvBarrelIn !== null && rifleBarrelIn != null && !f.bad('muzzleVelocityMs') && !f.bad('mvBarrelIn')
    ? mvForBarrel(mv, mvBarrelIn, rifleBarrelIn) : null
  // Inside a sentence, as the summaries write numbers: Czech with a decimal comma (`16,5″`).
  const inches = (v: number) => `${plain(Number(v.toFixed(1)), f.lang)}″`
  const mvField = (
    <div className="rm-field">
      <NumberField label={t('rm.mv')} value={f.num('muzzleVelocityMs')} unit="m/s" min={MV.min} max={MV.max}
        invalidText={range(MV.min, MV.max)} onChange={(v) => f.set({ muzzleVelocityMs: v, truedAtM: undefined })}
        aside={f.source('muzzleVelocityMs')} outOfRange={f.bad('muzzleVelocityMs')} needed={f.need('muzzleVelocityMs')} />
      {hint && rifleBarrelIn != null && mvBarrelIn !== null && (
        <div className="est mv-hint">
          <p>
            <b>≈</b> {t('lib.mvHint', {
              box: inches(mvBarrelIn), yours: inches(rifleBarrelIn), delta: `${hint.deltaMs < 0 ? '−' : '+'}${Math.abs(hint.deltaMs)}`,
            })} {t('lib.mvHintNote')}
          </p>
          <button type="button" className="btn ghost" onClick={() => f.set({ muzzleVelocityMs: hint.mvMs, mvBarrelIn: rifleBarrelIn, truedAtM: undefined })}>
            {t('lib.mvHintApply', { mv: plain(hint.mvMs, f.lang) })}
          </button>
        </div>
      )}
    </div>
  )
  const mvBarrelField = f.custom && (
    <div className="rm-field">
      <NumberField label={t('lib.mvBarrel')} value={mvBarrelIn === null ? null : mvBarrel.show(mvBarrelIn)} unit={lenUnit} min={mvBarrel.min} max={mvBarrel.max}
        step={lenUnit === 'mm' ? 5 : 0.5} invalidText={range(mvBarrel.min, mvBarrel.max)} onChange={(v) => f.set({ mvBarrelIn: mvBarrel.store(v) })}
        aside={f.source('mvBarrelIn')} outOfRange={f.bad('mvBarrelIn')} {...optional(f, clear('mvBarrelIn'))} />
    </div>
  )
  const tempField = (
    <div className="rm-field">
      <NumberField label={t('rm.mvTemp')} value={f.num('mvRefTempC')} unit="°C" min={MV_TEMP_C.min} max={MV_TEMP_C.max}
        invalidText={range(MV_TEMP_C.min, MV_TEMP_C.max)} onChange={(v) => f.set({ mvRefTempC: v })} aside={f.source('mvRefTempC')} outOfRange={f.bad('mvRefTempC')}
        {...optional(f, clear('mvRefTempC'))} />
    </div>
  )
  const sensField = (
    <div className="rm-field">
      <NumberField label={t('rm.sens')} value={f.num('powderSensMsPerC')} unit={t('rm.sensUnit')} min={POWDER_SENS.min} max={POWDER_SENS.max} step={0.1}
        invalidText={range(POWDER_SENS.min, POWDER_SENS.max)} onChange={(v) => f.set({ powderSensMsPerC: v })}
        aside={f.source('powderSensMsPerC')} outOfRange={f.bad('powderSensMsPerC')} {...optional(f, clear('powderSensMsPerC'))} />
    </div>
  )
  const sdField = (
    <div className="rm-field">
      <NumberField label={t('rm.sd')} value={f.num('mvSdMs')} unit="m/s" min={MV_SD.min} max={MV_SD.max} step={0.5}
        invalidText={range(MV_SD.min, MV_SD.max)} onChange={(v) => f.set({ mvSdMs: v })} aside={f.source('mvSdMs')} outOfRange={f.bad('mvSdMs')}
        {...optional(f, clear('mvSdMs'), true)} />
    </div>
  )
  const massField = (
    <div className="rm-field">
      <NumberField label={t('rm.mass')} value={shown(f.num('massGr'), massS)} unit={mass} min={massS.min} max={massS.max} step={mass === 'g' ? 0.1 : 1}
        invalidText={range(massS.min, massS.max)} onChange={(v) => f.set({ massGr: massS.store(v) })} aside={f.source('massGr')}
        outOfRange={f.bad('massGr')} needed={f.need('massGr')} />
    </div>
  )
  const diameterField = (
    <div className="rm-field">
      <NumberField label={t('rm.diam')} value={shown(f.num('diameterIn'), diameter)} unit={lenUnit} min={diameter.min} max={diameter.max}
        step={lenUnit === 'mm' ? 0.1 : 0.001} invalidText={range(diameter.min, diameter.max)} onChange={(v) => f.set({ diameterIn: diameter.store(v) })}
        aside={f.source('diameterIn')} outOfRange={f.bad('diameterIn')} {...optional(f, clear('diameterIn'))} />
    </div>
  )
  const lengthField = (
    <div className="rm-field">
      <NumberField label={t('rm.len')} value={shown(f.num('lengthMm'), length)} unit={lenUnit} min={length.min} max={length.max}
        step={lenUnit === 'mm' ? 0.5 : 0.05} invalidText={range(length.min, length.max)} onChange={(v) => f.set({ lengthMm: length.store(v) })}
        aside={f.source('lengthMm')} outOfRange={f.bad('lengthMm')} {...optional(f, clear('lengthMm'), true)} />
    </div>
  )

  if (part === 'required') return <div className="rm-grid">{nameField}{massField}{bcField}{mvField}</div>
  if (part === 'optional') return <div className="rm-grid">{mvBarrelField}{calibreField}{tempField}{sensField}{sdField}{diameterField}{lengthField}</div>
  return (
    <>
      <div className="rm-grid">
        {nameField}
        {calibreField}
        {bcField}
        {mvField}
        {mvBarrelField}
      </div>

      {truing && (
        <div className="rs-sub">
          <button type="button" className="rs-sub-row" aria-expanded={trueOpen} aria-controls={truingId} onClick={() => setTrueOpen((o) => !o)}>
            <span>{truingText}</span>
            <span className="rs-sub-chev" aria-hidden="true">›</span>
          </button>
          <div id={truingId} hidden={!trueOpen}>
            {trueOpen && <Truing f={f} {...truing} />}
          </div>
        </div>
      )}

      <div className="rm-grid">
        {tempField}
        {sensField}
        {sdField}
        {massField}
        {diameterField}
        {lengthField}
      </div>
    </>
  )
}

/**
 * Truing: the distance and the dial figure you needed there, in calm air, give the muzzle velocity. A figure that
 * doesn't fit the load at that distance is refused with a message, and nothing is stored. The MV field above it shows
 * the result and its `trued at` tag.
 */
function Truing({ f, preset, profile, station, unit, distanceM }: { f: Fields } & TruingWith) {
  const { t, sys } = f
  const angle = unit === 'mil' ? 'MRAD' : 'MOA'
  const distUnit = toDisplay(1, 'distance', sys).unit
  const [dist, setDist] = useState(() => Math.round(toDisplay(distanceM, 'distance', sys).value))
  // What the two boxes hold right now (null: empty or invalid): the button trues from these alone.
  const [distNow, setDistNow] = useState<number | null>(dist)
  const [obs, setObs] = useState<number | null>(null)
  const [obsNow, setObsNow] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)
  const dMin = ceilTo(toDisplay(TRUE_DISTANCE_M.min, 'distance', sys).value, 0)
  const dMax = floorTo(toDisplay(TRUE_DISTANCE_M.max, 'distance', sys).value, 0)

  const go = () => {
    if (obsNow === null || distNow === null) {
      setMsg({ bad: true, text: t('rm.trueNeed') })
      return
    }
    const m = fromDisplay(distNow, 'distance', sys)
    const mv = trueReal(preset, profile, station, unit, m, obsNow)
    if (mv === null) {
      setMsg({ bad: true, text: t('rm.trueRefuse') })
      return
    }
    const stored = roundTo(mv, 1)
    f.set({ muzzleVelocityMs: stored, truedAtM: m })
    setMsg({ bad: false, text: t('rm.trueDone', { mv: stored }) })
  }

  return (
    <div className="rs-true">
      <span className="rm-note">{t('rm.trueNote')}</span>
      <div className="rm-grid">
        <div className="rm-field">
          <NumberField label={t('rm.trueDist')} value={dist} unit={distUnit} min={dMin} max={dMax} step={10}
            invalidText={t('rm.range', { min: dMin, max: dMax })} onChange={(v) => { setDist(v); setMsg(null) }} onDraft={setDistNow} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.trueObs', { unit: angle })} value={obs} unit={angle} min={OBSERVED.min} max={OBSERVED.max} step={0.1}
            invalidText={t('rm.range', { min: OBSERVED.min, max: OBSERVED.max })} onChange={(v) => { setObs(v); setMsg(null) }} onDraft={setObsNow}
            onClear={() => { setObs(null); setMsg(null) }} />
        </div>
      </div>
      <button type="button" className="btn ghost" onClick={go}>{t('rm.trueGo')}</button>
      {msg && <p className={msg.bad ? 'rm-msg bad' : 'rm-msg'} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
    </div>
  )
}

/**
 * The click and travel a scope has in `unit` (R2), from its fields, as scopeValues gives them for a resolved preset:
 * stored values count only when they were entered in this unit (a click must also be one of the unit's chips), else
 * the unit's default click and an unknown travel. A custom scope without a click shows none, since it needs one.
 */
function scopeIn(f: Fields, unit: AngleUnit) {
  const click = f.num('clickValue')
  const travel = f.num('travelUp')
  const sameUnit = f.pick('scopeUnit') === unit && (click !== null || travel !== null)
  const clickKnown = sameUnit && click !== null && CLICK_CHIPS[unit].includes(click)
  return {
    clickValue: clickKnown ? click : f.custom && click === null ? null : defaultClick(unit),
    clickKnown,
    travelUp: sameUnit ? travel : null,
    sameUnit,
  }
}

/** A custom scope's click and travel that a change of unit took away, and the unit they were in. */
export interface KeptScope { unit: AngleUnit; clickValue?: number; travelUp?: number }

/**
 * A scope's fields, in `unit`. A custom scope adds its name and magnification; its unit is its turrets' (Ruling 7),
 * so the unit control writes it as well as calling `setUnit`. The reading (`mode`) is the section's, not the scope's.
 */
export function ScopeFields({ f, unit, setUnit, mode, setMode, keep, part }: {
  f: Fields
  unit: AngleUnit
  setUnit: (u: AngleUnit) => void
  mode?: RealProfile['mode']
  setMode?: (m: RealProfile['mode']) => void
  /** What a change of unit took away, held by the caller so it outlasts the fields (a collapsed section); else they hold it. */
  keep?: [KeptScope | null, (k: KeptScope | null) => void]
  part?: Part
}) {
  const { t, sys } = f
  const angle = unit === 'mil' ? 'MRAD' : 'MOA'
  const scope = scopeIn(f, unit)
  const travel = TRAVEL[unit]
  const len = sys === 'metric' ? 'mm' : 'in'
  const sight = scaled(LENGTH_TO_MM[len], 2, SIGHT_MM)
  const sightMm = f.num('sightHeightMm')
  const magnification = f.num('magnification')
  const range = (min: number, max: number) => t('rm.range', { min, max })
  // A custom scope's zero is its own. Without one it shows not set, flagged, and its first step gives the 100 m a new
  // scope starts at (Ruling 8); one stored outside today's bounds shows as stored, flagged, and counts as missing. A
  // built-in scope always has one.
  const zeroM = f.num('zeroM')
  const zeroAsked = (f.custom && zeroM === null) || (zeroM !== null && f.bad('zeroM'))
  const local = useState<KeptScope | null>(null)
  const [kept, setKept] = keep ?? local
  // A custom scope's click and travel in its old unit aren't its own in a new one, and a click can't be converted to a
  // chip: moving the scope to another unit clears them, so the click is asked for, never guessed. They are kept aside,
  // and come back if the scope returns to their unit.
  const moveTo = (u: AngleUnit): Record<string, unknown> => {
    const from = f.pick('scopeUnit')
    if (u === from) return { scopeUnit: u }
    const back = kept?.unit === u ? kept : null
    setKept({ unit: from, clickValue: f.num('clickValue') ?? undefined, travelUp: f.num('travelUp') ?? undefined })
    return { scopeUnit: u, clickValue: back?.clickValue, travelUp: back?.travelUp }
  }
  // Every click or travel write carries its unit (R2). Values stored in another unit aren't this scope's: writing one of
  // the two re-bases the other, so a value never changes unit unseen. A built-in scope's goes to this unit's default
  // click or an unknown travel; a custom scope moves to this unit, as its unit control does, and never stores a default.
  const rebase = () => (f.custom ? moveTo(unit) : { clickValue: scope.clickValue ?? undefined, travelUp: undefined })
  const write = (patch: Record<string, unknown>) => f.set({ ...(scope.sameUnit ? {} : rebase()), ...patch, scopeUnit: unit })
  const chooseUnit = (u: AngleUnit) => {
    if (f.custom) f.set(moveTo(u))
    setUnit(u)
  }

  return (
    <div className="rm-grid">
      {part !== 'optional' && (
        <>
          {f.custom && <NameField f={f} />}
          <div className="rm-field">
            <Head label={t('rm.unit')} />
            <Segmented label={t('rm.unit')} value={unit} onChange={chooseUnit} options={[{ value: 'mil', label: 'MRAD' }, { value: 'moa', label: 'MOA' }]} />
          </div>
          <div className="rm-field">
            <Head label={t('rm.click')}>{scope.clickKnown ? f.source('clickValue') : scope.clickValue !== null && plainTag('default', t)}</Head>
            <ChipGroup label={t('rm.click')} value={scope.clickValue} onChange={(v) => write({ clickValue: v })}
              options={CLICK_CHIPS[unit].map((v) => ({ value: v, label: clickLabel(v) }))} />
            {/* The chips have no message of their own: one under them asks for the click. */}
            {f.need('clickValue') && <p className="number-field-error" role="alert">{t('lib.clickNeed')}</p>}
          </div>
          <div className="rm-field">
            <Head label={t('rm.zero')}>{f.source('zeroM')}</Head>
            <Stepper label={t('rm.zero')} value={f.custom ? zeroM : zeroM ?? DEFAULT_ZERO_M} start={DEFAULT_ZERO_M} min={ZERO.min} max={ZERO.max} step={ZERO.step}
              format={(m) => fmtDistance(m, sys)} onChange={(z) => f.set({ zeroM: z })} decLabel={t('step.dec', { what: t('rm.zero') })}
              incLabel={t('step.inc', { what: t('rm.zero') })} invalid={zeroAsked}
              invalidText={t('lib.zeroNeed', { min: fmtDistance(ZERO.min, sys), max: fmtDistance(ZERO.max, sys) })} />
          </div>
          <div className="rm-field">
            <NumberField label={t('rm.sight')} value={sightMm === null ? null : sight.show(sightMm)} unit={len} min={sight.min} max={sight.max}
              step={len === 'mm' ? 1 : 0.1} invalidText={range(sight.min, sight.max)} onChange={(v) => f.set({ sightHeightMm: sight.store(v) })}
              aside={f.source('sightHeightMm')} outOfRange={f.bad('sightHeightMm')} needed={f.need('sightHeightMm')} />
          </div>
        </>
      )}
      {part !== 'required' && (
        <>
          <div className="rm-field">
            <NumberField label={t('rm.travel')} value={scope.travelUp} unit={angle} min={travel.min} max={travel.max} step={1}
              invalidText={range(travel.min, travel.max)} onChange={(v) => write({ travelUp: v })}
              aside={scope.travelUp !== null ? f.source('travelUp') : !f.custom && plainTag('unknown', t)} outOfRange={scope.travelUp !== null && f.bad('travelUp')}
              {...optional(f, () => write({ travelUp: f.custom ? undefined : null }), true)} />
          </div>
          {f.custom && (
            <div className="rm-field">
              <NumberField label={t('lib.magnification')} value={magnification} unit="×" min={MAGNIFICATION.min} max={MAGNIFICATION.max} step={1}
                invalidText={range(MAGNIFICATION.min, MAGNIFICATION.max)} onChange={(v) => f.set({ magnification: v })} aside={f.source('magnification')}
                outOfRange={f.bad('magnification')} {...optional(f, () => f.set({ magnification: undefined }))} />
            </div>
          )}
        </>
      )}
      {mode !== undefined && setMode && (
        <div className="rm-field">
          <Head label={t('rm.mode')} />
          <Segmented label={t('rm.mode')} value={mode} onChange={setMode} className="rm-mode"
            options={[{ value: 'dial', label: t('rm.modeDial') }, { value: 'hold', label: t('rm.modeHold') }]} />
        </div>
      )}
    </div>
  )
}

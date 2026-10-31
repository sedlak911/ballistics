import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { ChipGroup } from '../../../components/ChipGroup'
import { ListPicker } from '../../../components/ListPicker'
import { NumberField } from '../../../components/NumberField'
import { Popover } from '../../../components/Popover'
import { Segmented } from '../../../components/Segmented'
import { Stepper } from '../../../components/Stepper'
import { fromDisplay, LENGTH_TO_MM, MASS_TO_G, toDisplay, type AngleUnit, type UnitSystem } from '../../../engine/units'
import { fmtDistance } from '../../../format'
import type { T } from '../../../i18n'
import { useSettings } from '../../../settings/SettingsContext'
import { rifles, roundsFor } from '../data/presets'
import { useRealProfile, type RealProfile } from '../profile'
import { CLICK_CHIPS, LINK_SOURCE, OVERRIDE_RANGES, scopeValues, TRAVEL_RANGES, type Overrides, type ResolvedPreset } from '../profiles'
import type { RealSetup } from '../setup'
import { trueReal } from '../solve'
import type { Station } from '../station'
import type { Sourced } from '../types'
import { clickLabel, NBSP, rifleTagText, sourceMaker } from './realText'
import './menus.css'

type Menu = 'rifle' | 'cog' | 'round' | 'scope'

// What a field accepts, in the stored units: the overrides' own ranges (profiles.ts), so what a field writes is what
// storage keeps, and a stored value outside them is dropped (M7).
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
const TRUE_DISTANCE_M = R.truedAtM
// The dial figure read at the distance: anything the load can't produce is refused by trueReal, not by the box.
const OBSERVED = { min: 0.01, max: 1000 }

function CogIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M16.1 8.1L18.5 8.8L18.5 11.2L16.1 11.9L15.7 13L16.9 15.2L15.2 16.9L13 15.7L11.9 16.1L11.2 18.5L8.8 18.5L8.1 16.1L7 15.7L4.8 16.9L3.1 15.2L4.3 13L3.9 11.9L1.5 11.2L1.5 8.8L3.9 8.1L4.3 7L3.1 4.8L4.8 3.1L7 4.3L8.1 3.9L8.8 1.5L11.2 1.5L11.9 3.9L13 4.3L15.2 3.1L16.9 4.8L15.7 7Z" />
      <circle cx="10" cy="10" r="2.6" />
    </svg>
  )
}

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

interface Ctx {
  preset: ResolvedPreset
  own: Overrides | undefined
  set: (patch: Overrides) => void
  t: T
  sys: UnitSystem
}

/**
 * Where a value comes from, after its field: yours, an estimate (trust N, dashed) or the preset's maker. The prompt asks
 * for a measurement. Only an override is yours: Custom's untouched `your entry` placeholders are estimates (I4), as the
 * calculation sheet tags them.
 */
function Source({ s, c, prompt, trued }: { s: Sourced<unknown>; c: Ctx; prompt?: string; trued?: number | null }) {
  const yours = s.source === 'yours'
  const link = s.source === LINK_SOURCE
  const estimate = !yours && !link && s.trust === 'N'
  return (
    <span className="rm-src">
      {trued != null ? (
        <span className="tag acc">{c.t('rm.src.trued', { d: fmtDistance(trued, c.sys) })}</span>
      ) : yours ? (
        <span className="tag acc">{c.t('rm.src.yours')}</span>
      ) : link ? (
        <span className="tag acc">{c.t('rm.src.link')}</span>
      ) : estimate ? (
        <span className="tag muted rm-est" title={s.source}>{c.t('rm.src.estimate')}</span>
      ) : (
        <span className="tag muted" title={s.source}>{c.t('rm.src.preset', { src: sourceMaker(s.source) })}</span>
      )}
      {estimate && trued == null && prompt && <span className="rm-prompt">{prompt}</span>}
    </span>
  )
}

/** The source of a scope value, which has no preset source: yours, the default, or not known. */
function Plain({ kind, c }: { kind: 'yours' | 'link' | 'default' | 'unknown'; c: Ctx }) {
  const word = { yours: 'rm.src.yours', link: 'rm.src.link', default: 'rm.src.default', unknown: 'rm.unknown' } as const
  return (
    <span className="rm-src">
      <span className={kind === 'yours' || kind === 'link' ? 'tag acc' : 'tag muted'}>{c.t(word[kind])}</span>
    </span>
  )
}

function TagButton({ btn, open, label, onClick, className, title, children }: {
  btn: RefObject<HTMLButtonElement | null>
  open: boolean
  label: string
  onClick: () => void
  className?: string
  title?: string
  children: ReactNode
}) {
  return (
    <button ref={btn} type="button" className={`tag tag-btn${className ? ` ${className}` : ''}`} aria-haspopup="dialog" aria-expanded={open}
      aria-label={label} title={title} onClick={onClick}>
      {children}
    </button>
  )
}

/**
 * The setup as tags that open small menus: the rifle (behind its cog the barrel, twist and its direction, accuracy, sight height and the MV
 * truing), the round and the scope. One menu at a time; picking a rifle closes its menu. Every edit goes to the
 * overrides of the current preset (`save`), so a preset keeps what was set on it.
 */
export function RealMenus({ setup, update, preset, own, save, station }: {
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  preset: ResolvedPreset
  /** The current preset's overrides as the page uses them (a shared link's included). */
  own: Overrides | undefined
  save: (patch: Overrides | null) => void
  station: Station
}) {
  const { display, setDisplay, t } = useSettings()
  const [profile, setProfile] = useRealProfile()
  const [open, setOpen] = useState<Menu | null>(null)
  const rifleTag = useRef<HTMLButtonElement>(null)
  const cogTag = useRef<HTMLButtonElement>(null)
  const roundTag = useRef<HTMLButtonElement>(null)
  const scopeTag = useRef<HTMLButtonElement>(null)
  const toggle = (m: Menu) => setOpen((o) => (o === m ? null : m))
  const close = () => setOpen(null)

  const sys = display.system
  const unit = display.angle
  const set = (patch: Overrides) => save(patch)
  const c: Ctx = { preset, own, set, t, sys }
  const scope = scopeValues(preset, unit)

  const [rifleName, rifleLength] = rifleTagText(preset.rifle, preset.barrel.value).split(' · ')
  const rifleText = rifleLength ? `${rifleName} · ${rifleLength}` : rifleName
  // The scope tag is unit · click · zero, `MRAD · 0.1 · zero 100` (spec): the zero in the distance unit without its
  // label, so a phone fits the strip in two rows; its accessible name keeps the label. The mode shows in the answer's
  // keys (`Elevation · dial`).
  const unitLabel = unit === 'mil' ? 'MRAD' : 'MOA'
  const click = clickLabel(scope.clickValue)
  const zero = Math.round(toDisplay(preset.zeroM, 'distance', sys).value)
  const scopeText = `${unitLabel} · ${click} · ${t('rm.tagZero')} ${zero}`

  return (
    <div className="setup-tags" data-testid="real-strip">
      <span className="tag-pair">
        <TagButton btn={rifleTag} open={open === 'rifle'} label={`${t('rm.rifle')}: ${rifleText}`} onClick={() => toggle('rifle')}>
          <b>{rifleName}</b>{rifleLength && ` · ${rifleLength}`}
        </TagButton>
        <TagButton btn={cogTag} open={open === 'cog'} label={t('rm.cog')} title={t('rm.cog')} className="cog" onClick={() => toggle('cog')}>
          <CogIcon />
        </TagButton>
      </span>
      <TagButton btn={roundTag} open={open === 'round'} label={`${t('rm.round')}: ${preset.short}`} title={preset.round}
        onClick={() => toggle('round')}>
        <b>{preset.short}</b>
      </TagButton>
      <TagButton btn={scopeTag} open={open === 'scope'} label={`${t('rm.scope')}: ${scopeText}${NBSP}${toDisplay(1, 'distance', sys).unit}`}
        onClick={() => toggle('scope')}>
        <b>{unitLabel}</b> · {click} · {t('rm.tagZero')} <b>{zero}</b>
      </TagButton>

      <Popover open={open === 'rifle'} onClose={close} anchorRef={rifleTag} label={t('rm.rifle')} className="rm-menu rm-narrow">
        <ListPicker label={t('rm.rifle')} value={preset.rifle}
          onChange={(rifle) => {
            // A pick selects that rifle's first round; the rifle already chosen keeps its round.
            if (rifle !== preset.rifle) update({ presetId: roundsFor(rifle)[0].id })
            close()
          }}
          filterLabel={t('pick.filterIn', { what: t('rm.rifle') })} noMatch={t('pick.noMatch')} maxRows={8}
          items={rifles().map((r) => ({ id: r, label: r }))} />
      </Popover>

      <Popover open={open === 'cog'} onClose={close} anchorRef={cogTag} label={t('rm.cog')} className="rm-menu">
        <CogFields key={setup.presetId} c={c} profile={profile} station={station} unit={unit} distanceM={setup.distanceM}
          reset={() => save(null)} />
      </Popover>

      <Popover open={open === 'round'} onClose={close} anchorRef={roundTag} label={t('rm.round')} className="rm-menu">
        <RoundFields key={setup.presetId} c={c} pick={(id) => { update({ presetId: id }); close() }} />
      </Popover>

      <Popover open={open === 'scope'} onClose={close} anchorRef={scopeTag} label={t('rm.scopeMenu')} className="rm-menu rm-narrow">
        <ScopeFields c={c} unit={unit} setUnit={(angle) => setDisplay({ angle })} mode={profile.mode} setMode={(mode) => setProfile({ mode })} />
      </Popover>
    </div>
  )
}

function CogFields({ c, profile, station, unit, distanceM, reset }: {
  c: Ctx
  profile: RealProfile
  station: Station
  unit: AngleUnit
  distanceM: number
  reset: () => void
}) {
  const { preset: p, own, set, t, sys } = c
  const len = sys === 'metric' ? 'mm' : 'in'
  const sight = scaled(LENGTH_TO_MM[len], 2, SIGHT_MM)
  const range = (min: number, max: number) => t('rm.range', { min, max })
  return (
    <>
      <div className="rm-grid">
        <div className="rm-field">
          <span className="label">{t('rm.barrel')}</span>
          <span className="rm-read">{p.barrel.value}</span>
          <Source s={p.barrel} c={c} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.twist')} value={p.twistIn.value} unit={t('rm.twistUnit')} min={TWIST_IN.min} max={TWIST_IN.max} step={0.25}
            invalidText={range(TWIST_IN.min, TWIST_IN.max)} onChange={(v) => set({ twistIn: v })} />
          <Segmented label={t('rm.twistDir')} value={p.twist} onChange={(twist) => set({ twist })}
            options={[{ value: 'right', label: t('rm.twistRight') }, { value: 'left', label: t('rm.twistLeft') }]} />
          <Source s={p.twistIn} c={c} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.accuracy')} value={p.accuracyMoa.value} unit="MOA" min={ACCURACY_MOA.min} max={ACCURACY_MOA.max} step={0.1}
            invalidText={range(ACCURACY_MOA.min, ACCURACY_MOA.max)} onChange={(v) => set({ accuracyMoa: v })} />
          <Source s={p.accuracyMoa} c={c} />
        </div>
        <div className="rm-field">
          <span className="label">{t('rm.shots')}</span>
          <Segmented label={t('rm.shots')} value={String(p.groupShots) as '3' | '5'} onChange={(v) => set({ groupShots: v === '5' ? 5 : 3 })}
            options={[{ value: '3', label: '3' }, { value: '5', label: '5' }]} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.sight')} value={sight.show(p.sightHeightMm.value)} unit={len} min={sight.min} max={sight.max} step={len === 'mm' ? 1 : 0.1}
            invalidText={range(sight.min, sight.max)} onChange={(v) => set({ sightHeightMm: sight.store(v) })} />
          <Source s={p.sightHeightMm} c={c} prompt={t('rm.measureIt')} />
        </div>
      </div>

      <Truing c={c} profile={profile} station={station} unit={unit} distanceM={distanceM} />

      <button type="button" className="btn ghost" disabled={own === undefined} onClick={reset}>{t('rm.reset')}</button>
    </>
  )
}

/**
 * Truing: the distance and the dial figure you needed there, in calm air, give the muzzle velocity. A figure that
 * doesn't fit the load at that distance is refused with a message, and nothing is stored.
 */
function Truing({ c, profile, station, unit, distanceM }: {
  c: Ctx
  profile: RealProfile
  station: Station
  unit: AngleUnit
  distanceM: number
}) {
  const { preset: p, set, t, sys } = c
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
    const mv = trueReal(p, profile, station, unit, m, obsNow)
    if (mv === null) {
      setMsg({ bad: true, text: t('rm.trueRefuse') })
      return
    }
    const stored = roundTo(mv, 1)
    set({ muzzleVelocityMs: stored, truedAtM: m })
    setMsg({ bad: false, text: t('rm.trueDone', { mv: stored }) })
  }

  return (
    <div className="rm-true">
      <div className="rm-title">
        <span className="label">{t('rm.true')}</span>
        <span className="rm-note">{t('rm.trueNote')}</span>
      </div>
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
      <p className="rm-read-line">
        <span className="label">{t('rm.mv')}</span>
        <span className="num">{p.muzzleVelocityMs.value}</span> <span className="unit">m/s</span>
        <Source s={p.muzzleVelocityMs} c={c} prompt={t('rm.chrono')} trued={p.truedAtM} />
      </p>
    </div>
  )
}

function RoundFields({ c, pick }: { c: Ctx; pick: (presetId: string) => void }) {
  const { preset: p, set, t, sys } = c
  const rounds = roundsFor(p.rifle)
  const range = (min: number, max: number) => t('rm.range', { min, max })
  const drag = p.drag.value
  // The model and its BC are a pair: choosing the other model stores nothing until a BC for it is typed.
  const [pending, setPending] = useState<'G1' | 'G7' | null>(null)

  const mass = sys === 'metric' ? 'g' : 'gr'
  const massS = scaled(MASS_TO_G[mass] / MASS_TO_G.gr, mass === 'g' ? 2 : 1, MASS_GR)
  const lenUnit = sys === 'metric' ? 'mm' : 'in'
  const diameter = scaled(LENGTH_TO_MM[lenUnit] / LENGTH_TO_MM.in, lenUnit === 'mm' ? 2 : 3, DIAMETER_IN)
  const length = scaled(LENGTH_TO_MM[lenUnit], lenUnit === 'mm' ? 1 : 2, LENGTH_MM)

  return (
    <>
      {rounds.length > 1 && (
        <ListPicker label={t('rm.round')} value={p.id} onChange={pick} filterLabel={t('pick.filterIn', { what: t('rm.round') })}
          noMatch={t('pick.noMatch')} maxRows={8} items={rounds.map((r) => ({ id: r.id, label: r.round }))} />
      )}
      <div className="rm-grid">
        <div className="rm-field rm-wide">
          {'table' in drag ? (
            <>
              <span className="label">{t('rm.bc')}</span>
              <span className="rm-read">{t('rm.curve')}</span>
            </>
          ) : (
            <NumberField label={t('rm.bc')} value={drag.bc} unit={pending ?? drag.model} units={['G1', 'G7']}
              onUnit={(u) => setPending(u === drag.model ? null : (u as 'G1' | 'G7'))} min={BC.min} max={BC.max} step={0.001}
              needed={pending !== null}
              invalidText={pending ? t('rm.bcNeed', { model: pending, min: BC.min, max: BC.max }) : range(BC.min, BC.max)}
              onChange={(v) => {
                if (pending) {
                  set({ dragModel: pending, bc: v })
                  setPending(null)
                } else set({ bc: v })
              }} />
          )}
          <Source s={p.drag} c={c} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.mv')} value={p.muzzleVelocityMs.value} unit="m/s" min={MV.min} max={MV.max}
            invalidText={range(MV.min, MV.max)} onChange={(v) => set({ muzzleVelocityMs: v, truedAtM: undefined })} />
          <Source s={p.muzzleVelocityMs} c={c} prompt={t('rm.chrono')} trued={p.truedAtM} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.mvTemp')} value={p.mvRefTempC.value} unit="°C" min={MV_TEMP_C.min} max={MV_TEMP_C.max}
            invalidText={range(MV_TEMP_C.min, MV_TEMP_C.max)} onChange={(v) => set({ mvRefTempC: v })} />
          <Source s={p.mvRefTempC} c={c} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.sens')} value={p.powderSensMsPerC.value} unit={t('rm.sensUnit')} min={POWDER_SENS.min} max={POWDER_SENS.max} step={0.1}
            invalidText={range(POWDER_SENS.min, POWDER_SENS.max)} onChange={(v) => set({ powderSensMsPerC: v })} />
          <Source s={p.powderSensMsPerC} c={c} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.sd')} value={p.mvSdMs?.value ?? null} unit="m/s" min={MV_SD.min} max={MV_SD.max} step={0.5}
            placeholder={t('rm.unknown')} invalidText={range(MV_SD.min, MV_SD.max)} onChange={(v) => set({ mvSdMs: v })}
            onClear={() => set({ mvSdMs: undefined })} />
          {p.mvSdMs ? <Source s={p.mvSdMs} c={c} /> : <Plain kind="unknown" c={c} />}
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.mass')} value={massS.show(p.bullet.massGr.value)} unit={mass} min={massS.min} max={massS.max} step={mass === 'g' ? 0.1 : 1}
            invalidText={range(massS.min, massS.max)} onChange={(v) => set({ massGr: massS.store(v) })} />
          <Source s={p.bullet.massGr} c={c} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.diam')} value={diameter.show(p.bullet.diameterIn.value)} unit={lenUnit} min={diameter.min} max={diameter.max}
            step={lenUnit === 'mm' ? 0.1 : 0.001} invalidText={range(diameter.min, diameter.max)} onChange={(v) => set({ diameterIn: diameter.store(v) })} />
          <Source s={p.bullet.diameterIn} c={c} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.len')} value={p.bullet.lengthMm ? length.show(p.bullet.lengthMm.value) : null} unit={lenUnit} min={length.min} max={length.max}
            step={lenUnit === 'mm' ? 0.5 : 0.05} placeholder={t('rm.unknown')} invalidText={range(length.min, length.max)}
            onChange={(v) => set({ lengthMm: length.store(v) })} onClear={() => set({ lengthMm: undefined })} />
          {p.bullet.lengthMm ? <Source s={p.bullet.lengthMm} c={c} /> : <Plain kind="unknown" c={c} />}
        </div>
      </div>
    </>
  )
}

function ScopeFields({ c, unit, setUnit, mode, setMode }: {
  c: Ctx
  unit: AngleUnit
  setUnit: (u: AngleUnit) => void
  mode: RealProfile['mode']
  setMode: (m: RealProfile['mode']) => void
}) {
  const { preset: p, own, set, t, sys } = c
  const angle = unit === 'mil' ? 'MRAD' : 'MOA'
  const scope = scopeValues(p, unit)
  const travel = TRAVEL[unit]
  // Every click or travel write carries its unit (R2). Values stored in another unit aren't this scope's: writing one of
  // the two re-bases the other to this unit's default click or an unknown travel, so a value never changes unit unseen.
  const write = (patch: Pick<Overrides, 'clickValue' | 'travelUp'>) =>
    set({ ...(scope.sameUnit ? {} : { clickValue: scope.clickValue, travelUp: undefined }), ...patch, scopeUnit: unit })

  return (
    <>
      <div className="rm-field">
        <span className="label">{t('rm.unit')}</span>
        <Segmented label={t('rm.unit')} value={unit} onChange={setUnit} options={[{ value: 'mil', label: 'MRAD' }, { value: 'moa', label: 'MOA' }]} />
      </div>
      <div className="rm-field">
        <span className="label">{t('rm.click')}</span>
        <ChipGroup label={t('rm.click')} value={scope.clickValue} onChange={(v) => write({ clickValue: v })}
          options={CLICK_CHIPS[unit].map((v) => ({ value: v, label: clickLabel(v) }))} />
        <Plain kind={scope.clickKnown ? (p.linkKeys.has('clickValue') ? 'link' : 'yours') : 'default'} c={c} />
      </div>
      <div className="rm-field">
        <span className="label">{t('rm.zero')}</span>
        <Stepper label={t('rm.zero')} value={p.zeroM} min={ZERO.min} max={ZERO.max} step={ZERO.step} format={(m) => fmtDistance(m, sys)}
          onChange={(z) => set({ zeroM: z })} decLabel={t('step.dec', { what: t('rm.zero') })} incLabel={t('step.inc', { what: t('rm.zero') })} />
        <Plain kind={own?.zeroM !== undefined ? (p.linkKeys.has('zeroM') ? 'link' : 'yours') : 'default'} c={c} />
      </div>
      <div className="rm-field">
        <span className="label">{t('rm.mode')}</span>
        <Segmented label={t('rm.mode')} value={mode} onChange={setMode} className="rm-mode"
          options={[{ value: 'dial', label: t('rm.modeDial') }, { value: 'hold', label: t('rm.modeHold') }]} />
      </div>
      <div className="rm-field">
        <NumberField label={t('rm.travel')} value={scope.travelUp} unit={angle} min={travel.min} max={travel.max} step={1} placeholder={t('rm.unknown')}
          invalidText={t('rm.range', { min: travel.min, max: travel.max })} onChange={(v) => write({ travelUp: v })}
          onClear={() => write({ travelUp: null })} />
        <Plain kind={scope.travelUp !== null ? (p.linkKeys.has('travelUp') ? 'link' : 'yours') : 'unknown'} c={c} />
      </div>
    </>
  )
}

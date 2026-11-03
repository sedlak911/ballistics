import { Fragment, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChipGroup } from '../../../components/ChipGroup'
import { ListPicker, type PickerItem } from '../../../components/ListPicker'
import { NumberField } from '../../../components/NumberField'
import { Segmented } from '../../../components/Segmented'
import { Stepper } from '../../../components/Stepper'
import { ToastSlot } from '../../../components/Toast'
import { useModalSheet } from '../../../components/useModalSheet'
import { fromDisplay, LENGTH_TO_MM, MASS_TO_G, toDisplay, type AngleUnit, type UnitSystem } from '../../../engine/units'
import { fmtDistance } from '../../../format'
import type { T } from '../../../i18n'
import { useSettings } from '../../../settings/SettingsContext'
import { rifles, roundsFor } from '../data/presets'
import { useRealProfile, type RealProfile } from '../profile'
import {
  changedCount, CLICK_CHIPS, LINK_SOURCE, OVERRIDE_RANGES, scopeValues, SECTIONS, TRAVEL_RANGES, type Overrides, type ResolvedPreset, type Section,
} from '../profiles'
import type { RealSetup } from '../setup'
import { trueReal } from '../solve'
import type { Station } from '../station'
import type { Sourced } from '../types'
import { CartridgeIcon, ReticleIcon, RifleIcon } from './icons'
import { clickLabel, sectionSummary, sourceMaker } from './realText'
import './menus.css'
import './settings.css'

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

const ICONS: Record<Section, () => ReactNode> = { rifle: RifleIcon, round: CartridgeIcon, scope: ReticleIcon }
const TITLES = { rifle: 'rm.rifle', round: 'rm.round', scope: 'rm.scope' } as const

/**
 * The REAL settings (spec §1): one modal sheet, the whole screen on a phone and a side sheet on a desktop, with the
 * rifle, the round and the scope as sections that expand in place, several at a time. It opens on the section its tag
 * asked for and gives the focus back to that tag. Every edit goes to the current preset's overrides (`save`), so a
 * preset keeps what was set on it; picking another rifle or round keeps the sheet open on the new preset.
 */
export function RealSettings({ initial, onClose, returnFocus, setup, update, preset, own, save, station, headerAction, sectionFoot }: {
  /** The section the tag asked for: expanded and in view, the others collapsed. */
  initial: Section
  onClose: () => void
  returnFocus: RefObject<HTMLElement | null>
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  preset: ResolvedPreset
  /** The current preset's overrides as the page uses them (a shared link's included). */
  own: Overrides | undefined
  save: (patch: Overrides | null) => void
  station: Station
  /** In the header, before the ✕. */
  headerAction?: ReactNode
  /** At the end of an expanded section. */
  sectionFoot?: (s: Section) => ReactNode
}) {
  const { display, setDisplay, t } = useSettings()
  const [profile, setProfile] = useRealProfile()
  const [expanded, setExpanded] = useState<ReadonlySet<Section>>(() => new Set([initial]))
  const ref = useRef<HTMLDivElement>(null)
  // The tag's section header takes the focus, which also brings it into view.
  const first = useRef<HTMLButtonElement>(null)
  const trap = useModalSheet(ref, first, onClose, returnFocus)
  const titleId = useId()

  const sys = display.system
  const unit = display.angle
  const c: Ctx = { preset, own, set: save, t, sys }
  const toggle = (s: Section) => setExpanded((e) => {
    const next = new Set(e)
    if (!next.delete(s)) next.add(s)
    return next
  })

  const fields = (s: Section) => {
    if (s === 'rifle') return <RifleFields c={c} update={update} />
    if (s === 'scope') {
      return <ScopeFields c={c} unit={unit} setUnit={(angle) => setDisplay({ angle })} mode={profile.mode} setMode={(mode) => setProfile({ mode })} />
    }
    // The round's fields hold a pending drag model and the truing's boxes: a new preset starts them afresh.
    return (
      <>
        <RoundPick c={c} pick={(id) => update({ presetId: id })} />
        <RoundFields key={setup.presetId} c={c} profile={profile} station={station} unit={unit} distanceM={setup.distanceM} />
      </>
    )
  }

  // On <body>, so no sticky bar or stacked column paints over it.
  return createPortal(
    <div className="rs-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="rs-sheet panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={trap}>
        <div className="rs-head">
          <h2 id={titleId}>{t('rs.title')}</h2>
          {headerAction}
          <button type="button" className="rs-close" aria-label={t('rs.close')} onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="rs-body">
          {SECTIONS.map((s) => (
            <SectionBlock key={s} s={s} title={t(TITLES[s])} open={expanded.has(s)} onToggle={() => toggle(s)}
              headRef={s === initial ? first : undefined} count={changedCount(preset, own, s, unit)}
              summary={sectionSummary(s, preset, unit, sys, t, display.lang)} chip={(n) => t('rs.yours', { n })}>
              {fields(s)}
              {sectionFoot?.(s)}
            </SectionBlock>
          ))}
        </div>
        {/* The page's toast (a reset's Undo) shows here while the sheet is open: last in its Tab order, read in the modal. */}
        <ToastSlot />
      </div>
    </div>,
    document.body,
  )
}

/**
 * One section: the whole header row is the button (icon, title, the `{n} yours` chip, the summary and a chevron),
 * inside a heading; the body under it while expanded. The section is a region named by its title.
 */
function SectionBlock({ s, title, open, onToggle, headRef, count, summary, chip, children }: {
  s: Section
  title: string
  open: boolean
  onToggle: () => void
  headRef?: RefObject<HTMLButtonElement | null>
  count: number
  summary: string
  chip: (n: number) => string
  children: ReactNode
}) {
  const id = useId()
  const Icon = ICONS[s]
  return (
    <section className={`rs-sec${open ? ' open' : ''}`} aria-labelledby={`${id}-t`}>
      <h3 className="rs-sec-hh">
        <button ref={headRef} type="button" className="rs-sec-h" aria-expanded={open} aria-controls={`${id}-b`}
          aria-labelledby={`${id}-n`} aria-describedby={`${id}-s`} onClick={onToggle}>
          <span className="rs-icon"><Icon /></span>
          <span className="rs-sec-t">
            <span id={`${id}-n`} className="rs-sec-name">
              <span id={`${id}-t`}>{title}</span>
              {count > 0 && <> <span className="rs-chip">{chip(count)}</span></>}
            </span>
            <Summary id={`${id}-s`} text={summary} />
          </span>
          <span className="rs-chev" aria-hidden="true">
            <svg width="14" height="9" viewBox="0 0 14 9" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M1.5 1.5L7 7L12.5 1.5" />
            </svg>
          </span>
        </button>
      </h3>
      <div id={`${id}-b`} className="rs-sec-b" hidden={!open}>{open && children}</div>
    </section>
  )
}

/**
 * A section's reset (spec §1), for its `sectionFoot`: a quiet text button, right-aligned after a hairline. It goes with
 * the values it clears, so the focus moves to the section's header first, staying in the sheet. A tap leaves the page
 * where it is; a key press (a click of detail 0) brings the header into view, so the focus is seen.
 */
export function SectionReset({ label, onReset }: { label: string; onReset: () => void }) {
  return (
    <div className="rs-reset">
      <button type="button" onClick={(e) => {
        e.currentTarget.closest('.rs-sec')?.querySelector<HTMLElement>('.rs-sec-h')?.focus({ preventScroll: e.detail > 0 })
        onReset()
      }}>
        {label}
      </button>
    </div>
  )
}

/** The summary's items each kept whole: a line breaks only after a `·`, so none starts with one. */
function Summary({ id, text }: { id: string; text: string }) {
  const items = text.split(' · ')
  return (
    <span id={id} className="rs-sum">
      {items.map((item, n) => (
        <Fragment key={n}>
          <span className="rs-sum-i">{item}{n < items.length - 1 && ' ·'}</span>
          {n < items.length - 1 && ' '}
        </Fragment>
      ))}
    </span>
  )
}

/** A choice as one row, the current name and `›`, that opens the list in place; a pick closes it and keeps the focus on the row. */
function Pick({ label, value, text, items, onPick, t }: {
  label: string
  value: string
  text: string
  items: PickerItem[]
  onPick: (id: string) => void
  t: T
}) {
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  const id = useId()
  return (
    <div className="rs-pick">
      <button ref={row} type="button" className="rs-pick-row" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="rs-pick-name">{text}</span>
        <span className="rs-pick-chev" aria-hidden="true">›</span>
      </button>
      <div id={id} hidden={!open}>
        {open && (
          <ListPicker label={label} value={value} filterLabel={t('pick.filterIn', { what: label })} noMatch={t('pick.noMatch')} maxRows={8}
            items={items} onChange={(v) => {
              setOpen(false)
              row.current?.focus()
              onPick(v)
            }} />
        )}
      </div>
    </div>
  )
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
 * Where a value comes from, on its label's row: yours, an estimate (trust N, dashed) or the preset's maker. The prompt
 * asks for a measurement. Only an override is yours: Custom's untouched `your entry` placeholders are estimates (I4),
 * as the calculation sheet tags them.
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

function RifleFields({ c, update }: { c: Ctx; update: (patch: Partial<RealSetup>) => void }) {
  const { preset: p, set, t } = c
  const range = (min: number, max: number) => t('rm.range', { min, max })
  // A pick selects that rifle's first round; the rifle already chosen keeps its round.
  const pick = (rifle: string) => {
    if (rifle !== p.rifle) update({ presetId: roundsFor(rifle)[0].id })
  }
  return (
    <>
      <Pick label={t('rm.rifle')} value={p.rifle} text={p.rifle} t={t} items={rifles().map((r) => ({ id: r, label: r }))} onPick={pick} />
      <div className="rm-grid">
        <div className="rm-field">
          <Head label={t('rm.barrel')}><Source s={p.barrel} c={c} /></Head>
          <span className="rm-read">{p.barrel.value}</span>
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.twist')} value={p.twistIn.value} unit={t('rm.twistUnit')} min={TWIST_IN.min} max={TWIST_IN.max} step={0.25}
            invalidText={range(TWIST_IN.min, TWIST_IN.max)} onChange={(v) => set({ twistIn: v })} aside={<Source s={p.twistIn} c={c} />} />
          <Segmented label={t('rm.twistDir')} value={p.twist} onChange={(twist) => set({ twist })}
            options={[{ value: 'right', label: t('rm.twistRight') }, { value: 'left', label: t('rm.twistLeft') }]} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.accuracy')} value={p.accuracyMoa.value} unit="MOA" min={ACCURACY_MOA.min} max={ACCURACY_MOA.max} step={0.1}
            invalidText={range(ACCURACY_MOA.min, ACCURACY_MOA.max)} onChange={(v) => set({ accuracyMoa: v })} aside={<Source s={p.accuracyMoa} c={c} />} />
        </div>
        <div className="rm-field">
          <Head label={t('rm.shots')} />
          <Segmented label={t('rm.shots')} value={String(p.groupShots) as '3' | '5'} onChange={(v) => set({ groupShots: v === '5' ? 5 : 3 })}
            options={[{ value: '3', label: '3' }, { value: '5', label: '5' }]} />
        </div>
      </div>
    </>
  )
}

/** The round picker, only when the rifle has more than one round. Outside the keyed fields, so a pick keeps its focus. */
function RoundPick({ c, pick }: { c: Ctx; pick: (presetId: string) => void }) {
  const { preset: p, t } = c
  const rounds = roundsFor(p.rifle)
  if (rounds.length < 2) return null
  return <Pick label={t('rm.round')} value={p.id} text={p.round} t={t} items={rounds.map((r) => ({ id: r.id, label: r.round }))} onPick={pick} />
}

function RoundFields({ c, profile, station, unit, distanceM }: {
  c: Ctx
  profile: RealProfile
  station: Station
  unit: AngleUnit
  distanceM: number
}) {
  const { preset: p, set, t, sys } = c
  const range = (min: number, max: number) => t('rm.range', { min, max })
  const drag = p.drag.value
  // The model and its BC are a pair: choosing the other model stores nothing until a BC for it is typed.
  const [pending, setPending] = useState<'G1' | 'G7' | null>(null)
  const [truing, setTruing] = useState(false)
  const truingId = useId()

  const mass = sys === 'metric' ? 'g' : 'gr'
  const massS = scaled(MASS_TO_G[mass] / MASS_TO_G.gr, mass === 'g' ? 2 : 1, MASS_GR)
  const lenUnit = sys === 'metric' ? 'mm' : 'in'
  const diameter = scaled(LENGTH_TO_MM[lenUnit] / LENGTH_TO_MM.in, lenUnit === 'mm' ? 2 : 3, DIAMETER_IN)
  const length = scaled(LENGTH_TO_MM[lenUnit], lenUnit === 'mm' ? 1 : 2, LENGTH_MM)
  // The row's arrow is drawn apart from its words, so it can turn when the truing is open.
  const truingText = t('rs.trueOpen').replace(/\s*›\s*$/, '')

  return (
    <>
      <div className="rm-grid">
        <div className="rm-field">
          {'table' in drag ? (
            <>
              <Head label={t('rm.bc')}><Source s={p.drag} c={c} /></Head>
              <span className="rm-read">{t('rm.curve')}</span>
            </>
          ) : (
            <NumberField label={t('rm.bc')} value={drag.bc} unit={pending ?? drag.model} units={['G1', 'G7']}
              onUnit={(u) => setPending(u === drag.model ? null : (u as 'G1' | 'G7'))} min={BC.min} max={BC.max} step={0.001}
              needed={pending !== null} aside={<Source s={p.drag} c={c} />}
              invalidText={pending ? t('rm.bcNeed', { model: pending, min: BC.min, max: BC.max }) : range(BC.min, BC.max)}
              onChange={(v) => {
                if (pending) {
                  set({ dragModel: pending, bc: v })
                  setPending(null)
                } else set({ bc: v })
              }} />
          )}
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.mv')} value={p.muzzleVelocityMs.value} unit="m/s" min={MV.min} max={MV.max}
            invalidText={range(MV.min, MV.max)} onChange={(v) => set({ muzzleVelocityMs: v, truedAtM: undefined })}
            aside={<Source s={p.muzzleVelocityMs} c={c} prompt={t('rm.chrono')} trued={p.truedAtM} />} />
        </div>
      </div>

      <div className="rs-sub">
        <button type="button" className="rs-sub-row" aria-expanded={truing} aria-controls={truingId} onClick={() => setTruing((o) => !o)}>
          <span>{truingText}</span>
          <span className="rs-sub-chev" aria-hidden="true">›</span>
        </button>
        <div id={truingId} hidden={!truing}>
          {truing && <Truing c={c} profile={profile} station={station} unit={unit} distanceM={distanceM} />}
        </div>
      </div>

      <div className="rm-grid">
        <div className="rm-field">
          <NumberField label={t('rm.mvTemp')} value={p.mvRefTempC.value} unit="°C" min={MV_TEMP_C.min} max={MV_TEMP_C.max}
            invalidText={range(MV_TEMP_C.min, MV_TEMP_C.max)} onChange={(v) => set({ mvRefTempC: v })} aside={<Source s={p.mvRefTempC} c={c} />} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.sens')} value={p.powderSensMsPerC.value} unit={t('rm.sensUnit')} min={POWDER_SENS.min} max={POWDER_SENS.max} step={0.1}
            invalidText={range(POWDER_SENS.min, POWDER_SENS.max)} onChange={(v) => set({ powderSensMsPerC: v })}
            aside={<Source s={p.powderSensMsPerC} c={c} />} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.sd')} value={p.mvSdMs?.value ?? null} unit="m/s" min={MV_SD.min} max={MV_SD.max} step={0.5}
            placeholder={t('rm.unknown')} invalidText={range(MV_SD.min, MV_SD.max)} onChange={(v) => set({ mvSdMs: v })}
            onClear={() => set({ mvSdMs: undefined })} aside={p.mvSdMs ? <Source s={p.mvSdMs} c={c} /> : <Plain kind="unknown" c={c} />} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.mass')} value={massS.show(p.bullet.massGr.value)} unit={mass} min={massS.min} max={massS.max} step={mass === 'g' ? 0.1 : 1}
            invalidText={range(massS.min, massS.max)} onChange={(v) => set({ massGr: massS.store(v) })} aside={<Source s={p.bullet.massGr} c={c} />} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.diam')} value={diameter.show(p.bullet.diameterIn.value)} unit={lenUnit} min={diameter.min} max={diameter.max}
            step={lenUnit === 'mm' ? 0.1 : 0.001} invalidText={range(diameter.min, diameter.max)} onChange={(v) => set({ diameterIn: diameter.store(v) })}
            aside={<Source s={p.bullet.diameterIn} c={c} />} />
        </div>
        <div className="rm-field">
          <NumberField label={t('rm.len')} value={p.bullet.lengthMm ? length.show(p.bullet.lengthMm.value) : null} unit={lenUnit} min={length.min} max={length.max}
            step={lenUnit === 'mm' ? 0.5 : 0.05} placeholder={t('rm.unknown')} invalidText={range(length.min, length.max)}
            onChange={(v) => set({ lengthMm: length.store(v) })} onClear={() => set({ lengthMm: undefined })}
            aside={p.bullet.lengthMm ? <Source s={p.bullet.lengthMm} c={c} /> : <Plain kind="unknown" c={c} />} />
        </div>
      </div>
    </>
  )
}

/**
 * Truing: the distance and the dial figure you needed there, in calm air, give the muzzle velocity. A figure that
 * doesn't fit the load at that distance is refused with a message, and nothing is stored. The MV field above it shows
 * the result and its `trued at` tag.
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
  const len = sys === 'metric' ? 'mm' : 'in'
  const sight = scaled(LENGTH_TO_MM[len], 2, SIGHT_MM)
  const range = (min: number, max: number) => t('rm.range', { min, max })
  // Every click or travel write carries its unit (R2). Values stored in another unit aren't this scope's: writing one of
  // the two re-bases the other to this unit's default click or an unknown travel, so a value never changes unit unseen.
  const write = (patch: Pick<Overrides, 'clickValue' | 'travelUp'>) =>
    set({ ...(scope.sameUnit ? {} : { clickValue: scope.clickValue, travelUp: undefined }), ...patch, scopeUnit: unit })
  const mine = (key: keyof Overrides) => (p.linkKeys.has(key) ? 'link' : 'yours')

  return (
    <div className="rm-grid">
      <div className="rm-field">
        <Head label={t('rm.unit')} />
        <Segmented label={t('rm.unit')} value={unit} onChange={setUnit} options={[{ value: 'mil', label: 'MRAD' }, { value: 'moa', label: 'MOA' }]} />
      </div>
      <div className="rm-field">
        <Head label={t('rm.click')}><Plain kind={scope.clickKnown ? mine('clickValue') : 'default'} c={c} /></Head>
        <ChipGroup label={t('rm.click')} value={scope.clickValue} onChange={(v) => write({ clickValue: v })}
          options={CLICK_CHIPS[unit].map((v) => ({ value: v, label: clickLabel(v) }))} />
      </div>
      <div className="rm-field">
        <Head label={t('rm.zero')}><Plain kind={own?.zeroM !== undefined ? mine('zeroM') : 'default'} c={c} /></Head>
        <Stepper label={t('rm.zero')} value={p.zeroM} min={ZERO.min} max={ZERO.max} step={ZERO.step} format={(m) => fmtDistance(m, sys)}
          onChange={(z) => set({ zeroM: z })} decLabel={t('step.dec', { what: t('rm.zero') })} incLabel={t('step.inc', { what: t('rm.zero') })} />
      </div>
      <div className="rm-field">
        <NumberField label={t('rm.sight')} value={sight.show(p.sightHeightMm.value)} unit={len} min={sight.min} max={sight.max} step={len === 'mm' ? 1 : 0.1}
          invalidText={range(sight.min, sight.max)} onChange={(v) => set({ sightHeightMm: sight.store(v) })}
          aside={<Source s={p.sightHeightMm} c={c} prompt={t('rm.measureIt')} />} />
      </div>
      <div className="rm-field">
        <NumberField label={t('rm.travel')} value={scope.travelUp} unit={angle} min={travel.min} max={travel.max} step={1} placeholder={t('rm.unknown')}
          invalidText={range(travel.min, travel.max)} onChange={(v) => write({ travelUp: v })}
          onClear={() => write({ travelUp: null })} aside={<Plain kind={scope.travelUp !== null ? mine('travelUp') : 'unknown'} c={c} />} />
      </div>
      <div className="rm-field">
        <Head label={t('rm.mode')} />
        <Segmented label={t('rm.mode')} value={mode} onChange={setMode} className="rm-mode"
          options={[{ value: 'dial', label: t('rm.modeDial') }, { value: 'hold', label: t('rm.modeHold') }]} />
      </div>
    </div>
  )
}

import { Fragment, useEffect, useId, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ListPicker, type PickerItem } from '../../../components/ListPicker'
import { ToastSlot } from '../../../components/Toast'
import { useModalSheet } from '../../../components/useModalSheet'
import { type AngleUnit } from '../../../engine/units'
import type { T } from '../../../i18n'
import { useSettings } from '../../../settings/SettingsContext'
import { barrelLengthIn } from '../barrel'
import { presetsOfRifle, rifleIds } from '../data/presets'
import { installPlatform, isStandalone } from '../../../install'
import { inRange, useLibrary, type ItemKind } from '../library'
import { useRealProfile } from '../profile'
import {
  changedCount, SECTIONS, type Section,
} from '../profiles'
import type { FieldPatch, Selection } from '../selection'
import type { RealSetup } from '../setup'
import type { Station } from '../station'
import { itemFields, presetFields, type Fields } from './fields'
import { CartridgeIcon, CloseIcon, ReticleIcon, RifleIcon } from './icons'
import { AddNote, LibraryForm, type Saved } from './LibraryForm'
import { RifleFields, RoundFields, ScopeFields, type KeptScope } from './SectionFields'
import { sectionSummary } from './realText'
import './menus.css'
import './settings.css'

const ICONS: Record<Section, () => ReactNode> = { rifle: RifleIcon, round: CartridgeIcon, scope: ReticleIcon }
const TITLES = { rifle: 'rm.rifle', round: 'rm.round', scope: 'rm.scope' } as const
const ADD = { rifle: 'lib.addRifle', round: 'lib.addRound', scope: 'lib.addScope' } as const
const DELETE = { rifle: 'lib.delete.rifle', round: 'lib.delete.round', scope: 'lib.delete.scope' } as const

/** The generic scope's id in the scope picker; a custom item's id always starts with `u-`. */
const GENERIC = 'generic'

/** A custom rifle's barrel as the MV hint reads it: one outside today's bounds counts as missing, as in the selection. */
const customBarrelIn = (v: number | undefined): number | null => (v !== undefined && inRange('barrelIn', v) ? v : null)

/**
 * The REAL settings (spec §1): one modal sheet, the whole screen on a phone and a side sheet on a desktop, with the
 * rifle, the round and the scope as sections that expand in place, several at a time. It opens on the section its tag
 * asked for and gives the focus back to that tag. Each section starts with its picker: the custom items first, marked,
 * then the built-in ones. Its fields read and write through `Fields`: a custom item's own, else the preset's with the
 * overrides under them. Every edit goes through `save(section, patch)`, which writes it where the selection keeps it (a
 * built-in round's preset overrides, a custom item, or a custom round's own overrides), so a preset keeps what was set
 * on it; picking another rifle, round or scope keeps the sheet open on the new selection. Each list ends with `+ Add …`,
 * which opens the add form (LibraryForm) in place of the section's fields; a saved item becomes the selection. A custom
 * item's section ends with its delete, but a custom rifle's only round has none (Ruling 13).
 */
export function RealSettings({ initial, onClose, returnFocus, setup, update, sel, save, onDelete, station, headerAction, sectionFoot }: {
  /** The section the tag asked for: expanded and in view, the others collapsed. */
  initial: Section
  onClose: () => void
  returnFocus: RefObject<HTMLElement | null>
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  sel: Selection
  save: (section: Section, patch: FieldPatch) => void
  /** Deletes the selected custom item of that kind (the page moves the selection and offers the Undo). */
  onDelete: (kind: ItemKind) => void
  station: Station
  /** In the header, before the ✕. */
  headerAction?: ReactNode
  /** At the end of an expanded section. */
  sectionFoot?: (s: Section) => ReactNode
}) {
  const { display, setDisplay, t } = useSettings()
  const [profile, setProfile] = useRealProfile()
  const [library] = useLibrary()
  const [expanded, setExpanded] = useState<ReadonlySet<Section>>(() => new Set([initial]))
  // The sections showing their add form.
  // The note's Continue was just pressed: the form it opens takes the focus.
  const [afterNote, setAfterNote] = useState(false)
  const [adding, setAdding] = useState<ReadonlySet<Section>>(() => new Set())
  const ref = useRef<HTMLDivElement>(null)
  // The tag's section header takes the focus, which also brings it into view.
  const first = useRef<HTMLButtonElement>(null)
  const trap = useModalSheet(ref, first, onClose, returnFocus)
  const titleId = useId()

  // Picking a custom scope turns the display angle to its unit (Ruling 7), and so does the scope section's unit control.
  // Each comes with a write of the setup or of a custom scope, which may drop a link's unknown ids from the URL
  // (selection.ts dropUnknown). Both writes carry the whole link, so the angle's waits for the render that has the
  // other in the URL and builds on it; `setAngle` asks for that render when nothing else does.
  const angleNext = useRef<AngleUnit | null>(null)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const angle = angleNext.current
    if (angle === null) return
    angleNext.current = null
    if (angle !== display.angle) setDisplay({ angle })
  })
  const setAngle = (angle: AngleUnit) => {
    angleNext.current = angle
    rerender()
  }

  // What a change of unit took from each custom scope, kept while the sheet is open (ScopeFields).
  const [keptScopes, setKeptScopes] = useState<Record<string, KeptScope | null>>({})
  const keepFor = (id: string): [KeptScope | null, (k: KeptScope | null) => void] =>
    [keptScopes[id] ?? null, (k) => setKeptScopes((all) => ({ ...all, [id]: k }))]

  const sys = display.system
  const unit = display.angle
  const preset = sel.preset
  const setAdd = (s: Section, on: boolean) => setAdding((a) => {
    const next = new Set(a)
    if (on) next.add(s)
    else next.delete(s)
    return next
  })
  const toggle = (s: Section) => {
    // Folding a section away drops its form unsaved, as Cancel does.
    if (expanded.has(s)) setAdd(s, false)
    setExpanded((e) => {
      const next = new Set(e)
      if (!next.delete(s)) next.add(s)
      return next
    })
  }

  /** The custom item a section shows, if any; its fields are its own and nothing in them overrides a preset. */
  const itemOf = (s: Section) => (s === 'rifle' ? sel.rifle : s === 'round' ? sel.round : sel.scope)
  const fieldsOf = (s: Section): Fields => {
    const item = itemOf(s)
    const write = (patch: FieldPatch) => save(s, patch)
    const env = { t, sys, lang: display.lang }
    return item !== null ? itemFields(item, write, env) : presetFields(preset, sel.own, write, env)
  }

  const customTag = t('lib.custom')
  const custom = (id: string, name: string): PickerItem => ({ id, label: name.trim() || '—', tag: customTag, tagMuted: true })
  const rounds = library.rounds.filter((r) => r.rifleId === sel.rifleId)
  const scopes = library.scopes.filter((x) => x.rifleId === sel.rifleId)
  const deletable = (s: Section) => itemOf(s) !== null && !(s === 'round' && sel.rifle !== null && rounds.length < 2)

  // A rifle selects its first round, on the generic scope; the rifle already chosen keeps its round. A custom rifle
  // without a round (only storage can hold one) has nothing to compute, so it can't be picked.
  const pickRifle = (id: string) => {
    if (id === sel.rifleId) return
    if (!library.rifles.some((r) => r.id === id)) {
      update({ presetId: presetsOfRifle(id)[0].id, roundId: null, customRifleId: null, scopeId: null })
      return
    }
    const round = library.rounds.find((r) => r.rifleId === id)
    if (round !== undefined) update({ roundId: round.id, customRifleId: id, scopeId: null })
  }
  // Another round of the same rifle keeps the rifle's custom scope.
  const pickRound = (id: string) => {
    if (rounds.some((r) => r.id === id)) update({ roundId: id, customRifleId: sel.rifle?.id ?? null })
    else update({ presetId: id, roundId: null, customRifleId: null })
  }
  const pickScope = (id: string) => {
    const scope = scopes.find((x) => x.id === id)
    if (scope?.scopeUnit !== undefined) angleNext.current = scope.scopeUnit
    update({ scopeId: scope === undefined ? null : id })
  }
  // A saved item is selected as a pick would select it: a new rifle with its first round on the generic scope, a new
  // round keeping the rifle's custom scope, a new scope turning the display angle to its unit.
  const saved = (s: Section, item: Saved) => {
    setAdd(s, false)
    if (item.kind === 'rifle') update({ roundId: item.roundId, customRifleId: item.rifleId, scopeId: null })
    else if (item.kind === 'round') update({ roundId: item.roundId, customRifleId: sel.rifle?.id ?? null })
    else {
      angleNext.current = item.scopeUnit
      update({ scopeId: item.scopeId })
    }
  }
  // While its form is open, a section shows the form in place of its own fields (and the truing); the picker stays.
  const add = (s: Section) => ({ label: t(ADD[s]), open: adding.has(s), onAdd: () => setAdd(s, !adding.has(s)) })
  // On an iPhone in Safari the first add shows the note instead (Ruling 14); `Continue anyway` remembers it for good.
  const noteDue = !profile.addNoteSeen && installPlatform() === 'ios' && !isStandalone()
  const form = (s: Section) => noteDue
    ? <AddNote onContinue={() => {
      setAfterNote(true)
      setProfile({ addNoteSeen: true })
    }} />
    : <LibraryForm kind={s} rifleId={sel.rifleId} onSaved={(item) => saved(s, item)} onCancel={() => setAdd(s, false)} focusFirst={afterNote} />

  // The pickers sit outside the keyed fields, so a pick keeps its focus.
  const fields = (s: Section) => {
    const f = fieldsOf(s)
    if (s === 'rifle') {
      const items = [...library.rifles.map((r) => custom(r.id, r.name)), ...rifleIds().map((id) => ({ id, label: presetsOfRifle(id)[0].rifle }))]
      return (
        <>
          <Pick label={t('rm.rifle')} value={sel.rifleId} text={preset.rifle} t={t} items={items} onPick={pickRifle} add={add('rifle')} />
          {adding.has('rifle') ? form('rifle') : <RifleFields key={sel.rifle?.id ?? 'preset'} f={f} />}
        </>
      )
    }
    if (s === 'scope') {
      const items = [{ id: GENERIC, label: t('lib.generic') }, ...scopes.map((x) => custom(x.id, x.name))]
      return (
        <>
          <Pick label={t('rm.scope')} value={sel.scope?.id ?? GENERIC} text={sel.scope === null ? t('lib.generic') : sel.scope.name.trim() || '—'} t={t}
            items={items} onPick={pickScope} add={add('scope')} />
          {adding.has('scope') ? form('scope') : (
            <ScopeFields key={sel.scope?.id ?? GENERIC} f={f} unit={unit} setUnit={setAngle} mode={profile.mode}
              setMode={(mode) => setProfile({ mode })} keep={sel.scope === null ? undefined : keepFor(sel.scope.id)} />
          )}
        </>
      )
    }
    // The round's fields hold a pending drag model and the truing's boxes: a new round starts them afresh. The truing
    // solves the selection, so it waits until nothing required is missing.
    const items = [...rounds.map((r) => custom(r.id, r.name)), ...presetsOfRifle(sel.rifleId).map((p) => ({ id: p.id, label: p.round }))]
    return (
      <>
        <Pick label={t('rm.round')} value={sel.round?.id ?? preset.id} text={preset.round} t={t} items={items} onPick={pickRound} add={add('round')} />
        {adding.has('round') ? form('round') : (
          <RoundFields key={preset.id} f={f} rifleBarrelIn={sel.rifle !== null ? customBarrelIn(sel.rifle.barrelIn) : barrelLengthIn(preset.barrel.value)}
            truing={sel.incomplete.length === 0 ? { preset, profile, station, unit, distanceM: setup.distanceM } : undefined} />
        )}
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
          <button type="button" className="icon-btn" aria-label={t('rs.close')} title={t('rs.close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="rs-body">
          {SECTIONS.map((s) => (
            <SectionBlock key={s} s={s} title={t(TITLES[s])} open={expanded.has(s)} onToggle={() => toggle(s)}
              headRef={s === initial ? first : undefined} count={itemOf(s) === null ? changedCount(preset, sel.own, s, unit) : 0}
              summary={sectionSummary(s, preset, unit, sys, t, display.lang, sel.incomplete)} chip={(n) => t('rs.yours', { n })}>
              {fields(s)}
              {!adding.has(s) && sectionFoot?.(s)}
              {!adding.has(s) && deletable(s) && <SectionReset label={t(DELETE[s])} onReset={() => onDelete(s)} />}
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
 * A section's reset (spec §1), for its `sectionFoot`, and a custom item's delete: a quiet text button, right-aligned
 * after a hairline. It goes with the values it clears, or the item, so the focus moves to the section's header first,
 * staying in the sheet. A tap leaves the page where it is; a key press (a click of detail 0) brings the header into
 * view, so the focus is seen.
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

/**
 * A choice as one row, the current name and `›`, that opens the list in place; a pick closes it and keeps the focus on
 * the row. `add` ends the list with its `+ Add …` row, which opens and closes the section's form (`add.open`): while the
 * form is open the list's rows step aside. When it closes, the focus comes back to `+ Add …`, or to the row once a save
 * has made the new item the choice, which closes the list.
 */
function Pick({ label, value, text, items, onPick, t, add }: {
  label: string
  value: string
  text: string
  items: PickerItem[]
  onPick: (id: string) => void
  t: T
  add?: { label: string; open: boolean; onAdd: () => void }
}) {
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  const addRow = useRef<HTMLButtonElement>(null)
  const id = useId()
  const adding = add?.open ?? false
  // A form closing on a new choice (a save) closes the list, as a pick does (state adjusted during render, not in an effect).
  const [seen, setSeen] = useState({ adding, value })
  if (seen.adding !== adding || seen.value !== value) {
    if (seen.adding && !adding && seen.value !== value) setOpen(false)
    setSeen({ adding, value })
  }
  const wasAdding = useRef(adding)
  useEffect(() => {
    if (wasAdding.current && !adding) (addRow.current ?? row.current)?.focus()
    wasAdding.current = adding
  }, [adding])
  return (
    <div className="rs-pick">
      <button ref={row} type="button" className="rs-pick-row" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="rs-pick-name">{text}</span>
        <span className="rs-pick-chev" aria-hidden="true">›</span>
      </button>
      <div id={id} hidden={!open}>
        {open && !adding && (
          <ListPicker label={label} value={value} filterLabel={t('pick.filterIn', { what: label })} noMatch={t('pick.noMatch')} maxRows={8}
            items={items} onChange={(v) => {
              setOpen(false)
              row.current?.focus()
              onPick(v)
            }} />
        )}
        {open && add && (
          <button ref={addRow} type="button" className="row rs-pick-add" aria-expanded={adding} onClick={add.onAdd}>{add.label}</button>
        )}
      </div>
    </div>
  )
}

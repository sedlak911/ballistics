import { useEffect, useId, useRef, useState } from 'react'
import type { AngleUnit } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import { useLibrary, type CustomRifle, type CustomRound, type CustomScope, type ItemKind } from '../library'
import { DEFAULT_ZERO_M } from '../profiles'
import { incompleteFields } from '../selection'
import { draftFields, type Fields } from './fields'
import { RifleFields, RoundFields, ScopeFields } from './SectionFields'

/** What a save added, for the section to select. */
export type Saved =
  | { kind: 'rifle'; rifleId: string; roundId: string }
  | { kind: 'round'; roundId: string }
  | { kind: 'scope'; scopeId: string; scopeUnit: AngleUnit }

type Draft = Record<string, unknown>

/**
 * The starting values (Ruling 8): visible choices that Save confirms, and every required number empty. A scope's unit
 * is the display angle's and its zero 100 m.
 */
const START = {
  rifle: (): Draft => ({ twist: 'right', groupShots: 3 }),
  round: (): Draft => ({ dragModel: 'G7' }),
  scope: (angle: AngleUnit): Draft => ({ scopeUnit: angle, zeroM: DEFAULT_ZERO_M }),
}

/**
 * A new rifle, round or scope, in place of its section's fields (spec, "Adding"): the required fields, a hairline, the
 * optional ones, then Save and Cancel. A new rifle's form asks for its first round too, since a rifle without one can't
 * be computed. The draft lives here, and nothing is stored before Save. Save stores only an item the selection would
 * find complete (`incompleteFields`) with no field showing a bad entry; else it flags what is asked for and moves the
 * focus to the first such field.
 */
export function LibraryForm({ kind, rifleId, onSaved, onCancel, focusFirst }: {
  kind: ItemKind
  /** The rifle a new round or scope belongs to. */
  rifleId: string
  onSaved: (saved: Saved) => void
  onCancel: () => void
  /** Opens with the focus on the first field: after the iPhone note, whose button the focus was on. */
  focusFirst?: boolean
}) {
  const { display, t } = useSettings()
  const [, actions] = useLibrary()
  const env = { t, sys: display.system, lang: display.lang }
  const [rifle, setRifle] = useState(START.rifle)
  const [round, setRound] = useState(START.round)
  const [scope, setScope] = useState(() => START.scope(display.angle))
  // Counts the refused saves: from the first on, each required field still missing is flagged.
  const [refusals, setRefusals] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const drafts: Partial<Record<ItemKind, Draft>> = kind === 'rifle' ? { rifle, round } : kind === 'round' ? { round } : { scope }
  const missing = (k: ItemKind) => (drafts[k] === undefined ? [] : incompleteFields(k, drafts[k]))
  const fields = (k: ItemKind, draft: Draft, setDraft: typeof setRifle): Fields => {
    const asked = refusals > 0 ? new Set(missing(k).map((g) => g.key)) : null
    return { ...draftFields(draft, setDraft, env), need: (key) => asked?.has(key) ?? false }
  }

  useEffect(() => {
    if (focusFirst) ref.current?.querySelector<HTMLElement>('input')?.focus()
  }, [focusFirst])

  // After a refusal, the focus goes to the first field with a message: its box, or the click's first chip.
  useEffect(() => {
    if (refusals === 0) return
    ref.current?.querySelector('[role="alert"]')?.closest('.rm-field')?.querySelector<HTMLElement>('input, button')?.focus()
  }, [refusals])

  const save = () => {
    const gaps = (['rifle', 'round', 'scope'] as const).flatMap(missing)
    if (gaps.length > 0 || ref.current?.querySelector('[aria-invalid="true"]')) {
      setRefusals((n) => n + 1)
      return
    }
    // The drafts hold only what their fields wrote, each of its field's type.
    if (kind === 'rifle') onSaved({ kind, ...actions.addRifle(rifle as Omit<CustomRifle, 'id'>, round as Omit<CustomRound, 'id' | 'rifleId'>) })
    else if (kind === 'round') onSaved({ kind, roundId: actions.addRound({ ...round, rifleId } as Omit<CustomRound, 'id'>) })
    else onSaved({ kind, scopeId: actions.addScope({ ...scope, rifleId } as Omit<CustomScope, 'id'>), scopeUnit: scope.scopeUnit as AngleUnit })
  }

  const rifleFields = fields('rifle', rifle, setRifle)
  const roundFields = fields('round', round, setRound)
  const scopeFields = fields('scope', scope, setScope)
  // The scope's unit is the draft's: the display angle follows it only on Save.
  const scopeUnit = scopeFields.pick('scopeUnit')
  return (
    <div ref={ref} className="lib-form">
      {kind === 'rifle' && (
        <>
          <RifleFields f={rifleFields} part="required" />
          <div className="lib-optional"><RifleFields f={rifleFields} part="optional" /></div>
          <h4 className="h-panel">{t('lib.firstRound')}</h4>
        </>
      )}
      {kind === 'scope' ? (
        <>
          <ScopeFields f={scopeFields} unit={scopeUnit} setUnit={() => {}} part="required" />
          <div className="lib-optional"><ScopeFields f={scopeFields} unit={scopeUnit} setUnit={() => {}} part="optional" /></div>
        </>
      ) : (
        <>
          <RoundFields f={roundFields} part="required" />
          <div className="lib-optional"><RoundFields f={roundFields} part="optional" /></div>
        </>
      )}
      <div className="lib-actions">
        <button type="button" className="btn primary" onClick={save}>{t('lib.save')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('lib.cancel')}</button>
      </div>
    </div>
  )
}

/**
 * On an iPhone in Safari, before the first own item: the home-screen app keeps its own storage, so what is entered here
 * would not be there. It stands in for the form until `Continue anyway`, which the profile remembers. `How` shows
 * 0.1.3's steps. It has no Cancel of its own: the section's `+ Add …` row, still in view, closes it.
 */
export function AddNote({ onContinue }: { onContinue: () => void }) {
  const { t } = useSettings()
  const [how, setHow] = useState(false)
  const textId = useId()
  return (
    <div className="lib-note" role="group" aria-labelledby={textId}>
      <p id={textId} className="rm-msg">{t('lib.ios.text')}</p>
      {how && <p className="rm-msg">{t('install.ios')}</p>}
      <div className="lib-actions">
        {/* The focus goes to the first button, as it would to the form's first field; closing the note returns it to `+ Add …` (Pick). */}
        <button type="button" className="btn ghost" aria-expanded={how} autoFocus onClick={() => setHow((h) => !h)}>{t('lib.ios.how')}</button>
        <button type="button" className="btn primary" onClick={onContinue}>{t('lib.ios.go')}</button>
      </div>
    </div>
  )
}

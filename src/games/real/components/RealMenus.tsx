import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { toDisplay } from '../../../engine/units'
import { routeHref } from '../../../routeHref'
import { useSettings } from '../../../settings/SettingsContext'
import type { ItemKind } from '../library'
import { scopeValues, sectionKeysIn, type Overrides, type Section } from '../profiles'
import { editTarget, lacks, type FieldPatch, type Selection } from '../selection'
import type { RealSetup } from '../setup'
import type { Station } from '../station'
import { clickLabel, MISSING, NBSP, rifleTagText } from './realText'
import { PHONE, useMedia } from '../../../components/useMedia'
import type { ToastInput } from '../../../components/Toast'
import { CartridgeIcon, ReticleIcon, RifleIcon, ShareIcon } from './icons'
import { RealSettings, SectionReset } from './RealSettings'

const RESET = { rifle: 'rs.reset.rifle', round: 'rs.reset.round', scope: 'rs.reset.scope' } as const
const SHARE_CUSTOM = { rifle: 'lib.shareCustom.rifle', round: 'lib.shareCustom.round', scope: 'lib.shareCustom.scope' } as const

/** The settings sheet open at a section, and what gets the focus back when it closes: a tag, or a line of the main screen. */
export interface SheetAt { section: Section; returnFocus: RefObject<HTMLElement | null> }

/** The share toasts whose field has taken the focus already. */
const focused = new WeakSet<object>()

/** The link to copy by hand, selected when it first appears. */
function LinkField({ href, label, once }: { href: string; label: string; once: object }) {
  const ref = useRef<HTMLInputElement>(null)
  // Only the first mount of a given toast takes the focus; the toast moving between the sheet and the page remounts it.
  useEffect(() => {
    if (focused.has(once)) return
    focused.add(once)
    ref.current?.focus()
    ref.current?.select()
  }, [once])
  return <input ref={ref} type="text" readOnly className="rs-link" aria-label={label} value={href} />
}

function TagButton({ btn, open, label, onClick, title, children }: {
  btn: RefObject<HTMLButtonElement | null>
  open: boolean
  label: string
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button ref={btn} type="button" className="tag tag-btn" aria-haspopup="dialog" aria-expanded={open}
      aria-label={label} title={title} onClick={onClick}>
      {children}
    </button>
  )
}

/**
 * The setup as three tags, the rifle, the round and the scope. Each opens the settings sheet (`RealSettings`) on its
 * own section. The page holds where the sheet is open, so the main screen's lines open it too, and the sheet gives the
 * focus back to whatever opened it. A section whose edits go to a built-in round's preset ends with its reset while it
 * holds any override key, stored or from a link; a custom item's section, and every section under a custom round, has
 * none (Ruling 6).
 */
export function RealMenus({ setup, update, sel, own, save, station, sheet, onSheet, onReset, onDelete, show, onSheetClosed }: {
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  sel: Selection
  /** The current preset's overrides as the page uses them (a shared link's included); undefined under a custom round. */
  own: Overrides | undefined
  /** Writes a section's edit where the selection keeps it (selection.ts editTarget). */
  save: (section: Section, patch: FieldPatch) => void
  station: Station
  /** Where the settings sheet is open; null while it is closed. */
  sheet: SheetAt | null
  /** Opens the sheet at a section (a tag passes its own ref), or closes it with null. */
  onSheet: (next: SheetAt | null) => void
  /** Clears the section's overrides on the current preset (the page offers the Undo). */
  onReset: (s: Section) => void
  /** Deletes the selected custom item of that kind (the page moves the selection and offers the Undo). */
  onDelete: (kind: ItemKind) => void
  /** The page's toast. */
  show: (t: ToastInput) => void
  /** The sheet closed: the page drops a toast that only made sense inside it (the copy-by-hand link). */
  onSheetClosed: () => void
}) {
  const { display, t } = useSettings()
  const phone = useMedia(PHONE)
  const open = sheet?.section ?? null
  const rifleTag = useRef<HTMLButtonElement>(null)
  const roundTag = useRef<HTMLButtonElement>(null)
  const scopeTag = useRef<HTMLButtonElement>(null)

  // The sheet gives the focus back to what opened it. A line of the main screen may be gone by then (the incomplete
  // line, once the sheet completed its item): its section's tag takes the focus instead.
  const last = useRef<SheetAt | null>(null)
  useEffect(() => {
    const was = last.current
    last.current = sheet
    if (sheet !== null || was === null || was.returnFocus.current?.isConnected) return
    const tag = { rifle: rifleTag, round: roundTag, scope: scopeTag }[was.section]
    tag.current?.focus()
  }, [sheet])

  const sys = display.system
  const unit = display.angle
  const preset = sel.preset
  const scope = scopeValues(preset, unit)

  // A custom rifle's name is the user's, whole (the phone's `rifleShort` cuts it to 10), with its barrel, tagged yours,
  // when it is set (selection.ts customRifle).
  const [rifleName, rifleLength] = sel.rifle === null
    ? rifleTagText(preset.rifle, preset.barrel.value).split(' · ')
    : [preset.rifle, preset.barrel.source === 'yours' ? preset.barrel.value : undefined]
  const rifleText = rifleLength ? `${rifleName} · ${rifleLength}` : rifleName
  // The scope tag is unit · click · zero, `MRAD · 0.1 · zero 100` (spec): the zero in the distance unit without its
  // label, so a phone fits the strip in two rows; its accessible name keeps the label. The mode shows in the answer's
  // keys (`Elevation · dial`).
  // A click or a zero an incomplete selection lacks shows `—`, never its stand-in.
  const unitLabel = unit === 'mil' ? 'MRAD' : 'MOA'
  const click = lacks(sel.incomplete, 'scope', 'clickValue') ? MISSING : clickLabel(scope.clickValue)
  const noZero = lacks(sel.incomplete, 'scope', 'zeroM')
  const zero = noZero ? MISSING : String(Math.round(toDisplay(preset.zeroM, 'distance', sys).value))
  const scopeText = `${unitLabel} · ${click} · ${t('rm.tagZero')} ${zero}`
  const zeroUnit = noZero ? '' : `${NBSP}${toDisplay(1, 'distance', sys).unit}`

  // Copies the link; with no clipboard, or one that refuses, the link stays in a toast to copy by hand. A selection
  // with a custom item says what others get instead, for its first custom kind: rifle, round, scope.
  const share = () => {
    const href = routeHref()
    const once = {}
    const kind = sel.rifle !== null ? 'rifle' : sel.round !== null ? 'round' : sel.scope !== null ? 'scope' : null
    const custom = kind === null ? null : <p className="rs-share-note">{t(SHARE_CUSTOM[kind])}</p>
    const byHand = () => show({
      text: t('rs.copyHand'),
      body: <><LinkField href={href} label={t('rs.copyHand')} once={once} />{custom}</>,
      durationMs: null,
    })
    try {
      navigator.clipboard.writeText(href).then(() => show({ text: t('rs.copied'), body: custom }), byHand)
    } catch {
      byHand()
    }
  }

  return (
    <div className="setup-tags" data-testid="real-strip">
      <TagButton btn={rifleTag} open={open === 'rifle'} label={`${t('rm.rifle')}: ${rifleText}`} onClick={() => onSheet({ section: 'rifle', returnFocus: rifleTag })}>
        <RifleIcon />
        <span className="tag-text">
          {phone ? <b>{preset.rifleShort}</b> : <><b>{rifleName}</b>{rifleLength && ` · ${rifleLength}`}</>}
        </span>
      </TagButton>
      <TagButton btn={roundTag} open={open === 'round'} label={`${t('rm.round')}: ${preset.short}`} title={preset.round}
        onClick={() => onSheet({ section: 'round', returnFocus: roundTag })}>
        <CartridgeIcon />
        <span className="tag-text"><b>{phone ? preset.calibre : preset.short}</b></span>
      </TagButton>
      <TagButton btn={scopeTag} open={open === 'scope'} label={`${t('rm.scope')}: ${scopeText}${zeroUnit}`}
        onClick={() => onSheet({ section: 'scope', returnFocus: scopeTag })}>
        <ReticleIcon />
        <span className="tag-text">
          {phone ? <><b>{unitLabel}</b> {zero}</> : <><b>{unitLabel}</b> · {click} · {t('rm.tagZero')} <b>{zero}</b></>}
        </span>
      </TagButton>

      {/* Keyed by the section, so each opening is a fresh sheet that returns the focus to what opened it. */}
      {sheet && (
        <RealSettings key={sheet.section} initial={sheet.section} onClose={() => { onSheet(null); onSheetClosed() }} returnFocus={sheet.returnFocus}
          headerAction={<button type="button" className="icon-btn" aria-label={t('rs.share')} title={t('rs.share')} onClick={share}><ShareIcon /></button>}
          setup={setup} update={update} sel={sel} save={save} onDelete={onDelete} station={station}
          sectionFoot={(s) => editTarget(sel, s).to === 'preset' && sectionKeysIn(own, s).length > 0
            && <SectionReset label={t(RESET[s])} onReset={() => onReset(s)} />} />
      )}
    </div>
  )
}

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { toDisplay } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import { scopeValues, sectionKeysIn, type Overrides, type ResolvedPreset, type Section } from '../profiles'
import type { RealSetup } from '../setup'
import type { Station } from '../station'
import { clickLabel, NBSP, rifleTagText } from './realText'
import { PHONE, useMedia } from '../../../components/useMedia'
import type { ToastInput } from '../../../components/Toast'
import { CartridgeIcon, ReticleIcon, RifleIcon, ShareIcon } from './icons'
import { RealSettings, SectionReset } from './RealSettings'

const RESET = { rifle: 'rs.reset.rifle', round: 'rs.reset.round', scope: 'rs.reset.scope' } as const

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
 * own section, and the sheet gives the focus back to the tag that opened it. A section holding any override key, stored
 * or from a link, ends with its reset.
 */
export function RealMenus({ setup, update, preset, own, save, station, onReset, show, onSheetClosed }: {
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  preset: ResolvedPreset
  /** The current preset's overrides as the page uses them (a shared link's included). */
  own: Overrides | undefined
  save: (patch: Overrides | null) => void
  station: Station
  /** Clears the section's overrides on the current preset (the page offers the Undo). */
  onReset: (s: Section) => void
  /** The page's toast. */
  show: (t: ToastInput) => void
  /** The sheet closed: the page drops a toast that only made sense inside it (the copy-by-hand link). */
  onSheetClosed: () => void
}) {
  const { display, t } = useSettings()
  const phone = useMedia(PHONE)
  const [open, setOpen] = useState<Section | null>(null)
  const rifleTag = useRef<HTMLButtonElement>(null)
  const roundTag = useRef<HTMLButtonElement>(null)
  const scopeTag = useRef<HTMLButtonElement>(null)
  const tags: Record<Section, RefObject<HTMLButtonElement | null>> = { rifle: rifleTag, round: roundTag, scope: scopeTag }

  const sys = display.system
  const unit = display.angle
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

  // Copies the link; with no clipboard, or one that refuses, the link stays in a toast to copy by hand.
  const share = () => {
    const href = location.href
    const once = {}
    const byHand = () => show({
      text: t('rs.copyHand'),
      body: <LinkField href={href} label={t('rs.copyHand')} once={once} />,
      durationMs: null,
    })
    try {
      navigator.clipboard.writeText(href).then(() => show({ text: t('rs.copied') }), byHand)
    } catch {
      byHand()
    }
  }

  return (
    <div className="setup-tags" data-testid="real-strip">
      <TagButton btn={rifleTag} open={open === 'rifle'} label={`${t('rm.rifle')}: ${rifleText}`} onClick={() => setOpen('rifle')}>
        <RifleIcon />
        <span className="tag-text">
          {phone ? <b>{preset.rifleShort}</b> : <><b>{rifleName}</b>{rifleLength && ` · ${rifleLength}`}</>}
        </span>
      </TagButton>
      <TagButton btn={roundTag} open={open === 'round'} label={`${t('rm.round')}: ${preset.short}`} title={preset.round}
        onClick={() => setOpen('round')}>
        <CartridgeIcon />
        <span className="tag-text"><b>{phone ? preset.calibre : preset.short}</b></span>
      </TagButton>
      <TagButton btn={scopeTag} open={open === 'scope'} label={`${t('rm.scope')}: ${scopeText}${NBSP}${toDisplay(1, 'distance', sys).unit}`}
        onClick={() => setOpen('scope')}>
        <ReticleIcon />
        <span className="tag-text">
          {phone ? <><b>{unitLabel}</b> {zero}</> : <><b>{unitLabel}</b> · {click} · {t('rm.tagZero')} <b>{zero}</b></>}
        </span>
      </TagButton>

      {/* Keyed by the section, so each opening is a fresh sheet that returns the focus to its own tag. */}
      {open && (
        <RealSettings key={open} initial={open} onClose={() => { setOpen(null); onSheetClosed() }} returnFocus={tags[open]}
          headerAction={<button type="button" className="icon-btn" aria-label={t('rs.share')} title={t('rs.share')} onClick={share}><ShareIcon /></button>}
          setup={setup} update={update} preset={preset} own={own} save={save} station={station}
          sectionFoot={(s) => sectionKeysIn(own, s).length > 0 && <SectionReset label={t(RESET[s])} onReset={() => onReset(s)} />} />
      )}
    </div>
  )
}

import { useRef, type CSSProperties, type ReactNode } from 'react'
import { HeaderSlot } from '../../../components/HeaderSlot'
import { Segmented } from '../../../components/Segmented'
import { PHONE, useMedia } from '../../../components/useMedia'
import { useWheelSteps } from '../../../components/useWheelSteps'
import { useSettings } from '../../../settings/SettingsContext'
import { ratingsFor, topPenetratedClass, type Shift } from '../penetration'
import type { AimZone } from '../profile'
import { NIJ_CLASSES, type GzwAmmo } from '../types'
import type { VerdictResult } from '../verdict'
import { PenStrip } from './PenStrip'
import { pct, verdictLine } from './verdictText'
import './focus.css'

const step = (i: number) => ({ '--i': i }) as CSSProperties

/** A big figure of the answer: hold over or lead, with its unit and a line under it. */
export interface Figure {
  key: string
  label: string
  value: string
  unit: string
  sub?: string
}

/**
 * The one view: the answer and the inputs that change mid-fight. The setup reads as tags in the header; the scope,
 * toolbar and import come from the workbench page.
 */
export function FocusView({ firstSetup, tags, importControl, scope, verdict, zone, onZone, spreadKnown, hold, lead, ammo, shift, energyNote, toolbar, formatDistance, onScopeWheel }: {
  /** Shown in place of the setup strip until the first-visit setup is done. */
  firstSetup?: ReactNode
  tags: ReactNode
  importControl: ReactNode
  scope: ReactNode
  verdict: VerdictResult
  zone: AimZone
  onZone: (z: AimZone) => void
  spreadKnown: boolean
  hold: Figure
  lead: Figure
  ammo: GzwAmmo
  /** Classes armor counts tougher at this distance, and the energy left in words. */
  shift: Shift
  energyNote: string
  toolbar: ReactNode
  formatDistance: (m: number) => string
  /** The wheel over the scope, in whole steps (wheel up = farther). */
  onScopeWheel: (steps: number) => void
}) {
  const { t } = useSettings()
  const phone = useMedia(PHONE)
  const scopeRef = useRef<HTMLDivElement>(null)
  // Not during the first visit: that page scrolls, and the distance is not the question yet.
  useWheelSteps(scopeRef, onScopeWheel, { enabled: !firstSetup })
  const setupTags = <div className="setup-tags" data-testid="setup-strip">{tags}</div>
  // Armor by class alone: the toughest class this round usually gets through at this distance, the strip for the rest.
  const pen = ratingsFor(ammo, shift)
  const unknown = pen.source === 'none'
  const top = unknown ? null : topPenetratedClass(pen.ratings)
  // The chance is a figure inside a translated sentence: split the sentence around it.
  const [before, after] = t('fv.chance', { zone: t(`v.${zone}`), p: '\u0001' }).split('\u0001')

  return (
    <div className={`focus${firstSetup ? ' first' : ''}`}>
      {firstSetup ? <div className="first-setup-slot">{firstSetup}</div> : phone ? (
        <div className="strip enter" style={step(0)}>{setupTags}</div>
      ) : (
        <HeaderSlot>{setupTags}</HeaderSlot>
      )}

      <div className="focus-grid enter" style={step(1)}>
        <div className="focus-scope" ref={scopeRef}>
          <div className="glow" aria-hidden="true" />
          {scope}
        </div>
        <div className="answer">
          <div className="answer-k">
            <span className={`key v-${verdict.verdict}`}>{t('fv.verdict')}</span>
            <div className="answer-opts" data-testid="answer-opts">
              <span className="label" aria-hidden="true">{t('wb.aimZone')}</span>
              <Segmented className="words" label={t('wb.aimZone')} value={zone} onChange={onZone}
                options={[{ value: 'head', label: t('v.head') }, { value: 'chest', label: t('v.chest') }]} />
            </div>
          </div>
          <div className={`verdict-big v-${verdict.verdict}`} data-testid="focus-verdict">{verdictLine(verdict, t, formatDistance)}</div>
          <p className="verdict-sub" data-testid="focus-sentence">
            {before}<span className="num">{pct(verdict[zone])}</span>{after}
            {verdict.dominant !== null && ` ${t('v.biggest', { s: t(`err.${verdict.dominant}`) })}.`}
            {!spreadKnown && <span className="warn"> {t('v.noSpread')}</span>}
          </p>

          <div className="pair">
            {[hold, lead].map((c) => (
              <div key={c.key}>
                <div className="key">{c.label}</div>
                <div className="v num">{c.value}<span className="unit">{c.unit}</span></div>
                {c.sub && <div className="s">{c.sub}</div>}
              </div>
            ))}
          </div>

          <div className="armor-line" data-testid="focus-armor">
            <div className="what">
              <b>{unknown ? t('armor.noData') : top === null ? t('pen.noClass') : t('pen.upTo')}</b>
            </div>
            <div className={`c ${top === null ? 'none word' : 'pen'}`}>{top === null ? t('pen.noneShort') : NIJ_CLASSES[top]}</div>
            {shift > 0 && !unknown && <small className="energy num">{energyNote}</small>}
            <PenStrip ratings={pen.ratings} highlight={top ?? undefined} disagree={pen.disagree} unknown={unknown} labels />
          </div>
        </div>
      </div>

      <div className="focus-toolbar enter" style={step(2)}>{toolbar}</div>
      <div className="focus-foot enter" style={step(3)}>
        {!firstSetup && importControl}
        <p className="est"><b>≈</b> {t('wb.estimate')}</p>
      </div>
    </div>
  )
}

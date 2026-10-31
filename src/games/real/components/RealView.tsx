import { useRef, type CSSProperties, type ReactNode } from 'react'
import { HeaderSlot } from '../../../components/HeaderSlot'
import { ScopeView } from '../../../components/ScopeView'
import { angleOfOffset, radFromAngle, SPEED_TO_MS, type AngleUnit, type UnitSystem } from '../../../engine/units'
import { fmtDistance } from '../../../format'
import { useSettings } from '../../../settings/SettingsContext'
import type { WindUnit } from '../profile'
import type { RealSolution } from '../solve'
import { CalcSheet } from './CalcSheet'
import {
  arrowed,
  chanceText,
  clickDigits,
  clicksText,
  dec,
  LEFT_RIGHT,
  lengthText,
  NBSP,
  rounded,
  sensitivityWind,
  SENSITIVITY_STEP,
  sizeText,
  UP_DOWN,
  windText,
} from './realText'
import { len } from './calcText'
import './real.css'

const step = (i: number) => ({ '--i': i }) as CSSProperties

export interface RealViewProps {
  solution: RealSolution
  mode: 'dial' | 'hold'
  distanceM: number
  targetCm: number
  windUnit: WindUnit
  system: UnitSystem
  phone: boolean
  /** Hold mode: the hold point falls beyond the reticle, so the answer adds the dial line. */
  offView: boolean
  /** The bottom bar: the toolbar under the answer on desktop; on a phone it fixes itself to the bottom. */
  bar: ReactNode
  /** The rifle, round and scope tags: in the header on desktop, a strip under it on a phone. */
  tags?: ReactNode
  /** The station line, under the tags. */
  station?: ReactNode
  /** A line between the tags and the station line: that the view shows a shared link's values. */
  note?: ReactNode
  /** The weather from By location is older than 3 h (it needs the clock, so the page decides). */
  staleWeather?: boolean
  /** Whether the calculation sheet is open; the page asks the solver for the shares only then (R9). */
  calcOpen: boolean
  onCalc: (open: boolean) => void
}

/**
 * The REAL main screen: the scope setting for the first shot, in dial mode (the figures) or hold mode (the reticle
 * with the figures under it), then the hit line on a large screen, the warnings and the calculation button. It only
 * renders the solution it is given.
 */
export function RealView({ solution: s, mode, distanceM, targetCm, windUnit, system, phone, offView, bar, tags, station, note, staleWeather, calcOpen, onCalc }: RealViewProps) {
  const { t, display } = useSettings()
  const calcBtn = useRef<HTMLButtonElement>(null)
  const lang = display.lang
  const unit: AngleUnit = s.unit
  const unitLabel = unit === 'mil' ? 'MRAD' : 'MOA'
  // The click the dial used, for the dialled figure's decimals.
  const click = s.inputs.find((i) => i.key === 'clickValue')?.value ?? 0.1
  const digits = clickDigits(click)

  const key = (what: 'elevation' | 'windage', how: 'dial' | 'hold') => (
    <div className="key">{t(`real.${what}`)}<em>· {t(`real.${how}`)}</em></div>
  )
  const hero = (id: 'elevation' | 'windage', v: number) => (
    <div className="real-hero num" data-testid={`real-${id}`}>
      {arrowed(v, id === 'elevation' ? UP_DOWN : LEFT_RIGHT)}<span className="unit">{unitLabel}</span>
    </div>
  )

  // The dial: clicks with their direction and what half a click leaves, in cm at the distance; or, when the turret
  // runs out, what it dials and what the reticle has to hold.
  const { clicks, dialed, remainder, hold } = s.dial
  const n = Math.abs(clicks)
  const capped = rounded(hold, digits) > 0
  const dir = clicks > 0 ? ` ${t('real.up')}` : clicks < 0 ? ` ${t('real.down')}` : ''
  const dialText = capped
    ? t('real.dialHold', { d: dec(dialed, digits, lang), clicks: clicksText(n, t, lang), h: `↑${dec(hold, digits, lang)}` })
    : `${clicksText(n, t, lang)}${dir} · ${t('real.leftOver', { l: lengthText(radFromAngle(remainder, unit) * distanceM, system) })}`

  // Which mark of the reticle goes on the target: a hold left puts the target right of centre.
  const w = rounded(s.windage, 1)
  const markText = w < 0 ? t('real.markRight', { v: dec(-w, 1, lang) })
    : w > 0 ? t('real.markLeft', { v: dec(w, 1, lang) }) : t('real.markCentre')

  // What the sensitivity step of crosswind does at the target (M2): one decimal below 10 cm, two in the angle.
  const perStepM = s.perMsM * SPEED_TO_MS[windUnit] * SENSITIVITY_STEP[windUnit]
  const windy = s.windSpeeds[1] > 0
  const windBlock = windy ? (
    <ul className="real-cols" aria-label={t('real.columns')}>
      {s.windColumns.map((c, i) => (
        <li key={i} aria-current={i === 1 ? 'true' : undefined}>
          <span className="real-col-v num">{arrowed(c, LEFT_RIGHT)}</span>
          <span className="real-col-speed num">{windText(s.windSpeeds[i], windUnit)}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="real-sub">
      {t('real.perWind', {
        w: sensitivityWind(windUnit),
        l: len(perStepM, system, lang),
        a: `${dec(angleOfOffset(perStepM, distanceM, unit), 2, lang)}${NBSP}${unitLabel}`,
      })}
    </p>
  )

  const hit = phone ? null : s.hit
  const extras = (
    <>
      {hit && (
        <div className="real-hit" data-testid="real-hit">
          <p>
            {t('real.hit', { cm: rounded(targetCm, 1), p: chanceText(hit.chance) })}
            {hit.dominant && ` ${t(`real.cost.${hit.dominant}`)}`}
          </p>
          {hit.group && <p className="real-group num">{t('real.group', { size: sizeText(hit.group.widthM, hit.group.heightM, system) })}</p>}
        </div>
      )}
      {(s.warnings.length > 0 || staleWeather) && (
        <div className="real-warnings">
          {s.warnings.map((warning) => <p key={warning} className="est"><b>≈</b> {t(`real.warn.${warning}`)}</p>)}
          {staleWeather && <p className="est"><b>≈</b> {t('real.warn.staleWeather')}</p>}
        </div>
      )}
      <button ref={calcBtn} type="button" className="btn ghost real-calc" aria-haspopup="dialog" aria-expanded={calcOpen}
        onClick={() => onCalc(true)}>
        {t('real.howCalc')}
      </button>
    </>
  )

  let body: ReactNode
  if (!s.reached) {
    body = (
      <div className="real-answer">
        <p className="real-unreached">{t('real.unreached')}</p>
        <p className="real-sub">{t('real.unreachedSub', { d: fmtDistance(distanceM, system) })}</p>
        {extras}
      </div>
    )
  } else if (mode === 'hold') {
    const holdingLeft = s.windage < 0
    body = (
      <>
        <div className="real-scope">
          <div className="glow" aria-hidden="true" />
          <ScopeView distanceM={distanceM} holdover={s.elevation} lead={Math.abs(s.windage)} direction={holdingLeft ? -1 : 1}
            pose="standing" aimAt="head" unit={unit} target={{ kind: 'disc', diameterM: targetCm / 100 }}
            spread={hit ? { x: angleOfOffset(hit.sigmaX, distanceM, unit), y: angleOfOffset(hit.sigmaY, distanceM, unit) } : null}
            labels={{ hold: t('real.scopeHold'), lead: t(holdingLeft ? 'real.scopeLeft' : 'real.scopeRight') }}
            legend={hit ? { aim: t('real.legendAim'), r68: t('sc.legend68'), r95: t('sc.legend95') } : undefined}
            caption={t('real.scope', { unit: unitLabel })} offViewLabel={t('real.offView')} />
        </div>
        <div className="real-answer">
          <div className="real-figs real-pair">
            <section>{key('elevation', 'hold')}{hero('elevation', s.elevation)}</section>
            <section>{key('windage', 'hold')}{hero('windage', s.windage)}</section>
          </div>
          {offView && (
            <p className="real-sub real-dial-instead" data-testid="real-dial-line">
              {capped ? dialText.charAt(0).toLocaleUpperCase(lang) + dialText.slice(1) : t('real.dialInstead', { line: dialText })}
            </p>
          )}
          {extras}
        </div>
      </>
    )
  } else {
    body = (
      <div className="real-answer">
        <div className="real-figs">
          <div className="glow" aria-hidden="true" />
          <section>
            {key('elevation', 'dial')}
            {hero('elevation', s.elevation)}
            <p className="real-sub" data-testid="real-dial-line">{dialText}</p>
          </section>
          <section>
            {key('windage', 'hold')}
            {hero('windage', s.windage)}
            <p className="real-sub">{markText}</p>
            {windBlock}
          </section>
        </div>
        {extras}
      </div>
    )
  }

  return (
    <div className={`real mode-${s.reached ? mode : 'none'}`}>
      {tags && (phone ? <div className="real-strip enter" style={step(0)}>{tags}</div> : <HeaderSlot>{tags}</HeaderSlot>)}
      {note && <p className="real-note">{note}</p>}
      {station}
      <div className="real-grid enter" style={step(1)}>{body}</div>
      <div className="real-bar-slot enter" style={step(2)}>{bar}</div>
      {calcOpen && <CalcSheet solution={s} onClose={() => onCalc(false)} returnFocus={calcBtn} />}
    </div>
  )
}

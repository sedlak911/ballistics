import { useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useModalSheet } from '../../../components/useModalSheet'
import { angleFromRad, cToF, MASS_TO_G, PRESSURE_TO_HPA, radFromAngle, SPEED_TO_MS, toDisplay, type UnitSystem } from '../../../engine/units'
import { fmtDistance } from '../../../format'
import type { T, TKey } from '../../../i18n'
import { useSettings } from '../../../settings/SettingsContext'
import type { Lang } from '../../../settings/url'
import { useRealProfile, type Effect } from '../profile'
import { LINK_SOURCE } from '../profiles'
import type { MissingInput, RealInput, RealShare, RealSolution } from '../solve'
import { angleLabel, fix, inputValue, len, num, shareLines, term } from './calcText'
import { CloseIcon } from './icons'
import {
  arrowed, chanceText, clickDigits, clicksText, LEFT_RIGHT, lengthText, NBSP, rounded, sensitivityWind, SENSITIVITY_STEP, sourceMaker, UP_DOWN, windText,
} from './realText'
import './calc.css'

const FT_M = 0.3048
const MM_PER_IN = 25.4

/** Where an input comes from, as a tag: a preset value by its maker (an estimate dashed), yours, a station source. */
function Src({ i, t, trued, sys }: { i: RealInput | null; t: T; trued?: number | null; sys: UnitSystem }) {
  if (!i) return null
  if (i.trust !== null) {
    if (trued != null) return <span className="tag acc">{t('rm.src.trued', { d: fmtDistance(trued, sys) })}</span>
    if (i.source === 'yours') return <span className="tag acc">{t('rm.src.yours')}</span>
    if (i.source === LINK_SOURCE) return <span className="tag acc">{t('rm.src.link')}</span>
    if (i.trust === 'N') return <span className="tag muted calc-est" title={i.source}>{t('rm.src.estimate')}</span>
    return <span className="tag muted" title={i.source}>{t('rm.src.preset', { src: sourceMaker(i.source) })}</span>
  }
  const word: Partial<Record<string, TKey>> = {
    manual: 'st.src.manual', standard: 'st.src.standard', model: 'st.src.model', location: 'st.src.location',
    air: 'st.airs', default: 'rm.src.default', scope: 'calc.src.scope', profile: 'calc.src.setting', preset: 'calc.src.preset',
  }
  const key = word[i.source]
  if (!key) return null
  return <span className={i.source === 'manual' ? 'tag acc' : 'tag muted'}>{t(key)}</span>
}

/** One input or figure of a step: its word, the value, the value in the other unit and where it comes from. */
function Item({ k, v, c, src }: { k?: string; v: ReactNode; c?: string; src?: ReactNode }) {
  return (
    <span className="calc-i">
      {k && <span className="calc-k">{k} </span>}
      <b>{v}</b>
      {c && <span className="calc-c"> ({c})</span>}
      {src && <> {src}</>}
    </span>
  )
}

/** Items on one line, `·` after each but the last, so a wrapped line never starts with one. */
function Line({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean)
  return (
    <p className="calc-d">
      {items.map((item, n) => (
        <span key={n} className="calc-di">
          {item}
          {n < items.length - 1 && <span className="calc-sep" aria-hidden="true">·</span>}
        </span>
      ))}
    </p>
  )
}

/** An effect's switch; disabled when the effect lacks an input, with the reason (`describedBy`) as its description. */
function Switch({ on, label, onChange, describedBy }: { on: boolean; label: string; onChange: (on: boolean) => void; describedBy?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="calc-sw" disabled={describedBy !== undefined}
      aria-describedby={describedBy} onClick={() => onChange(!on)}>
      <span aria-hidden="true" />
    </button>
  )
}

/** The ⓘ glyph, as the header draws it: a circle on a square button. */
function InfoMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="10" cy="10" r="8.2" />
      <path d="M10 9v5.2" />
      <circle cx="10" cy="6.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** A step: number, title, ⓘ and the result on one row; the learner's explanation under ⓘ; then the working. */
function Step({ n, title, why, result, off, sw, children, t, numbered = true }: {
  n?: number
  title: string
  why: string
  result: ReactNode
  off?: boolean
  sw?: ReactNode
  children?: ReactNode
  t: T
  numbered?: boolean
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const body = (
    <>
      <div className="calc-t">
        <span className="calc-n" aria-hidden="true">{n}</span>
        <h3 id={`${id}-h`}>{title}</h3>
        <button type="button" className="calc-q" aria-expanded={open} aria-controls={`${id}-why`}
          aria-label={t('calc.about', { step: title })} onClick={() => setOpen((o) => !o)}>
          <InfoMark />
        </button>
        <div className="calc-r">
          <div className="calc-v num">{result}</div>
          {sw}
        </div>
      </div>
      {open && <p id={`${id}-why`} className="calc-why">{why}</p>}
      {children}
    </>
  )
  const className = `calc-step${off ? ' off' : ''}`
  return numbered
    ? <li className={className} aria-labelledby={`${id}-h`}>{body}</li>
    : <section className={className} aria-labelledby={`${id}-h`}>{body}</section>
}

/** Result lines: one per axis of a share. */
const Lines = ({ lines }: { lines: string[] }) => <>{lines.map((l) => <span key={l} className="calc-vl">{l}</span>)}</>

/**
 * How the answer came about, step by step (research §10): every input with its value, units and source, every effect
 * with its share and a switch. Each step's ⓘ holds a learner's explanation, so the professional reads only the figures.
 * A modal sheet: it keeps the focus inside, closes on Escape, its ✕ or a press beside it, and gives the focus back to
 * the button that opened it.
 */
export function CalcSheet({ solution: s, customScope, onClose, returnFocus }: {
  solution: RealSolution
  /** A scope of your own: its magnification has no model yet, and the sheet says so. */
  customScope: boolean
  onClose: () => void
  returnFocus: RefObject<HTMLElement | null>
}) {
  const { t, display } = useSettings()
  const [profile, setProfile] = useRealProfile()
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const lang: Lang = display.lang
  const sys = display.system
  const unit = s.unit
  const U = angleLabel(unit)

  // The focus moves to the ✕ and stays inside; Escape closes; on closing the focus goes back to the button.
  const trap = useModalSheet(ref, closeRef, onClose, returnFocus)

  const input = (key: string) => s.inputs.find((i) => i.key === key) ?? null
  // An input the solution always lists; a miss throws in development and tests, and prints as a dash in production.
  const val = (key: string) => inputValue(s.inputs, key)
  // The inputs a custom item may lack: null where one is missing.
  const opt = (key: string): number | null => input(key)?.value ?? null
  const DASH = '—'
  const src = (key: string, trued?: number | null) => <Src i={input(key)} t={t} sys={sys} trued={trued} />
  const d = val('distanceM')
  const x = s.explain
  const shares = s.shares
  const fx = profile.effects
  const toggle = (e: Effect) => (on: boolean) => setProfile({ effects: { [e]: on } })

  const shareOf = (e: Effect): RealShare | null => shares?.[e] ?? null
  const isMissing = (sh: RealShare | null): sh is { missing: MissingInput } => sh !== null && 'missing' in sh
  const missingText = (sh: { missing: MissingInput }) => (sh.missing === 'reach' ? t('calc.missing.reach') : t(`calc.off.${sh.missing}`))
  const missingId = (e: Effect) => `calc-missing-${e}`
  const shareResult = (sh: RealShare | null, e?: Effect): ReactNode => {
    if (sh === null) return '—'
    if (isMissing(sh)) return <span id={e && missingId(e)} className={`calc-vl ${sh.missing === 'reach' ? 'calc-missing' : 'calc-off'}`}>{missingText(sh)}</span>
    return <Lines lines={shareLines(sh.yM, sh.xM, d, unit, sys)} />
  }
  // An effect that lacks an input is greyed whole and its switch is disabled, the reason as its description.
  const lacks = (e: Effect) => isMissing(shareOf(e))
  const effectOff = (e: Effect) => !fx[e] || lacks(e)
  const fxSwitch = (e: Effect, label: string) => (
    <Switch on={fx[e]} label={label} onChange={toggle(e)} describedBy={lacks(e) ? missingId(e) : undefined} />
  )

  // Values with the other unit beside them.
  const temp = (c: number) => ({ v: `${num(c, 1, lang)}${NBSP}°C`, c: `${num(cToF(c), 1, lang)}${NBSP}°F` })
  const metres = (m: number) => ({ v: `${num(m, 0, lang)}${NBSP}m`, c: `${num(m / FT_M, 0, lang)}${NBSP}ft` })
  const hPa = (p: number) => ({ v: `${fix(p, 1, lang)}${NBSP}hPa`, c: `${fix(p / PRESSURE_TO_HPA.inHg, 2, lang)}${NBSP}inHg` })
  const mmIn = (mm: number) => ({ v: `${num(mm, 1, lang)}${NBSP}mm`, c: `${num(mm / MM_PER_IN, 2, lang)}${NBSP}in` })
  const ms = (v: number) => `${num(v, 1, lang)}${NBSP}m/s`
  const angle = (rad: number, digits = 2) => `${fix(angleFromRad(rad, unit), digits, lang)}${NBSP}${U}`

  // A sub-row of steps 1 and 2: an effect inside the step, with its switch and share.
  const fxRow = (e: 'humidity' | 'powderTemp') => {
    const label = t(e === 'humidity' ? 'calc.fx.humidity' : 'calc.fx.powderTemp')
    return (
      <div className={`calc-fx${effectOff(e) ? ' off' : ''}`}>
        <span className="calc-fx-k">{label}</span>
        <div className="calc-r">
          <div className="calc-v num">{shareResult(shareOf(e), e)}</div>
          {fxSwitch(e, label)}
        </div>
      </div>
    )
  }

  // 1 Air
  const tempC = val('tempC')
  const qnh = input('qnhHPa')
  const air = (
    <Step n={1} t={t} title={t('calc.s.air')} why={t('calc.why.air')}
      result={`ρ ${fix(val('densityKgM3'), 3, 'en')}${NBSP}kg/m³`}>
      <Line>{[
        <Item key="t" k={t('calc.in.temp')} {...temp(tempC)} src={src('tempC')} />,
        qnh && <Item key="q" k={t('calc.in.qnh')} {...hPa(qnh.value)} src={src('qnhHPa')} />,
        <Item key="p" k={t('calc.in.station')} {...hPa(val('stationPressureHPa'))} src={src('stationPressureHPa')} />,
        <Item key="h" k={t('calc.in.humidity')} v={`${num(val('humidityPct'), 0, lang)}${NBSP}%`} src={src('humidityPct')} />,
        <Item key="a" k={t('calc.in.altitude')} {...metres(val('altitudeM'))} src={src('altitudeM')} />,
      ]}</Line>
      <Line>{[
        <Item key="c" k={t('calc.in.sound')} v={`${fix(val('speedOfSoundMs'), 1, lang)}${NBSP}m/s`} />,
        // An indication, to the nearest 10 m (10 ft) like a weather meter's.
        <Item key="da" k={t('calc.in.da')} v={`${num(Math.round(val('densityAltitudeM') / 10) * 10, 0, lang)}${NBSP}m`}
          c={`${num(Math.round(val('densityAltitudeM') / FT_M / 10) * 10, 0, lang)}${NBSP}ft`} />,
      ]}</Line>
      {fxRow('humidity')}
    </Step>
  )

  // 2 Muzzle velocity
  const refMv = val('muzzleVelocityMs')
  const mvRefTempC = opt('mvRefTempC')
  const powderSens = opt('powderSensMsPerC')
  const truedAt = input('truedAtM')?.value ?? null
  const shifted = x?.shiftedMvMs ?? val('mvUsedMs')
  const mvStep = (
    <Step n={2} t={t} title={t('calc.s.mv')} why={t('calc.why.mv')} result={`${num(val('mvUsedMs'), 1, 'en')}${NBSP}m/s`}>
      <Line>{[
        <Item key="r" k={t('calc.in.mvRef')} v={ms(refMv)} c={`${num(refMv / FT_M, 0, lang)}${NBSP}ft/s`} src={src('muzzleVelocityMs', truedAt)} />,
        <Item key="rt" k={t('calc.in.mvRefTemp')} {...(mvRefTempC === null ? { v: DASH } : temp(mvRefTempC))} src={src('mvRefTempC')} />,
        <Item key="p" k={t('calc.in.powder')} {...temp(val('powderTempC'))} src={src('powderTempC')} />,
        <Item key="k" k={t('calc.in.sens')} v={powderSens === null ? DASH : `${num(powderSens, 2, lang)}${NBSP}${t('rm.sensUnit')}`} src={src('powderSensMsPerC')} />,
      ]}</Line>
      <Line>{[
        <Item key="f" v={powderSens === null || mvRefTempC === null
          ? `${num(refMv, 1, lang)}${NBSP}m/s`
          : `${num(refMv, 1, lang)} + ${num(powderSens, 2, lang)} · (${num(val('powderTempC'), 1, lang)} − ${num(mvRefTempC, 1, lang)}) = ${num(shifted, 1, lang)}${NBSP}m/s`} />,
      ]}</Line>
      {fxRow('powderTemp')}
    </Step>
  )

  if (!s.reached || x === null) {
    return frame(
      <>
        <ol className="calc-steps">{air}{mvStep}</ol>
        <p className="calc-unreached">{t('calc.unreached')}</p>
      </>,
    )
  }

  // 3 Flight
  const flight = (
    <Step n={3} t={t} title={t('calc.s.flight')} why={t('calc.why.flight')}
      result={`${fix(s.timeS, 3, 'en')}${NBSP}s · ${num(s.velocityMs, 0, 'en')}${NBSP}m/s`}>
      <Line>{[
        x.dragModel === 'table'
          ? <Item key="d" v={t('rm.curve')} src={src('sectionalDensity')} />
          : <Item key="d" k={t('calc.in.bc', { model: x.dragModel })} v={num(val('bc'), 3, lang)} src={src('bc')} />,
        x.dragModel === 'table' && <Item key="sd" k={t('calc.in.sd')} v={`${num(val('sectionalDensity'), 3, lang)}${NBSP}lb/in²`} />,
        <Item key="m" v={t('calc.in.machAt', { m: fix(s.mach, 2, lang) })} />,
        s.warnings.includes('transonic') && <Item key="w" v={t('calc.in.transonic')} />,
        s.warnings.includes('subsonic') && <Item key="w" v={t('calc.in.subsonic')} />,
      ]}</Line>
      {/* A stand-in curve says so in plain text, not only in a tag's title, which a touch screen never shows. */}
      {x.dragNoteKey && <p className="calc-d calc-flag"><b aria-hidden="true">≈</b> {t(x.dragNoteKey)}</p>}
      <Line>{[<Item key="r" v={t('calc.in.method')} />]}</Line>
    </Step>
  )

  // 4 Elevation
  const { clicks, dialed, remainder, hold } = s.dial
  const click = val('clickValue')
  const digits = clickDigits(click)
  const capped = rounded(hold, digits) > 0
  const yM = Math.abs(x.hitYM)
  const yText = `${fix(yM, yM < 1 ? 3 : 2, lang)}${NBSP}m`
  const travel = input('travelUp')
  const elevationStep = (
    <Step n={4} t={t} title={t('calc.s.elevation')} why={t('calc.why.elevation')}
      result={`${arrowed(s.elevation, UP_DOWN)}${NBSP}${U} · ${clicksText(Math.abs(clicks), t, lang)}`}>
      <Line>{[
        <Item key="y" v={t(x.hitYM > 0 ? 'calc.in.above' : 'calc.in.below', {
          y: yText, d: `${num(d, 1, lang)}${NBSP}m`, e: `${fix(yM / d * 1000, 2, lang)}${NBSP}MRAD${unit === 'moa' ? ` = ${fix(Math.abs(s.elevation), 2, lang)}${NBSP}MOA` : ''}`,
        })} />,
        <Item key="v" v={t('calc.in.allVertical')} />,
      ]}</Line>
      <Line>{[
        capped
          ? <Item key="c" v={t('real.dialHold', { d: fix(dialed, digits, lang), clicks: clicksText(Math.abs(clicks), t, lang), h: `↑${fix(hold, digits, lang)}` })} />
          : <Item key="c" v={t('calc.in.clicksOf', { clicks: clicksText(Math.abs(clicks), t, lang), c: `${num(click, 3, lang)}${NBSP}${U}` })} src={src('clickValue')} />,
        // Whole cm, the same figure as the answer's dial line.
        !capped && <Item key="l" v={t('real.leftOver', { l: lengthText(radFromAngle(remainder, unit) * d, sys) })} />,
        travel
          ? <Item key="tr" k={t('calc.in.travel')} v={`${num(travel.value, 2, lang)}${NBSP}${U}`} src={src('travelUp')} />
          : <span key="tr" className="calc-off">{t('calc.off.travel')}</span>,
      ]}</Line>
      <Line>{[
        <Item key="z" k={t('calc.in.zero')} v={fmtDistance(val('zeroM'), sys)} src={src('zeroM')} />,
        <Item key="h" k={t('calc.in.sight')} {...mmIn(val('sightHeightMm'))} src={src('sightHeightMm')} />,
      ]}</Line>
      <Line>{[
        <Item key="b" v={t('calc.in.bore', { b: angle(val('boreAngleMrad') / 1000), mv: ms(x.zeroMvMs) })} />,
      ]}</Line>
    </Step>
  )

  // 5 Wind
  const windMs = val('windMs')
  const cross = x.lag.crossMs
  const crossText = (v: number) => `${fix(Math.abs(v), 1, lang)}${NBSP}m/s`
  const windUnit = profile.windUnit
  const windStep = (
    <Step n={5} t={t} title={t('calc.s.wind')} why={t('calc.why.wind')}
      result={x.wind ? <Lines lines={shareLines(x.wind.yM, x.wind.xM, d, unit, sys)} /> : '—'}>
      {windMs > 0 ? (
        <>
          <Line>{[
            <Item key="w" v={t('calc.in.windFrom', { s: windText(windMs, windUnit), h: val('windClock') })}
              c={windUnit === 'm/s' ? undefined : windText(windMs, 'm/s')} />,
            rounded(cross, 1) !== 0 && <Item key="x" v={t(cross > 0 ? 'calc.in.crossLeft' : 'calc.in.crossRight', { s: crossText(cross) })} />,
            rounded(x.tailMs, 1) !== 0 && <Item key="h" v={t(x.tailMs > 0 ? 'calc.in.tail' : 'calc.in.head', { s: crossText(x.tailMs) })} />,
          ]}</Line>
          <Line>{[
            <Item key="lag" v={t('calc.in.lag', {
              w: fix(Math.abs(cross), 1, lang), t: fix(x.lag.timeS, 3, lang), d: num(d, 1, lang), v: num(d / x.lag.vacuumTimeS, 1, lang),
              lag: fix(x.lag.timeS - x.lag.vacuumTimeS, 3, lang), drift: fix(Math.abs(x.lag.driftM), 2, lang),
            })} />,
          ]}</Line>
        </>
      ) : (
        <Line>{[<Item key="n" v={t('calc.in.noWind', {
          w: sensitivityWind(windUnit), l: len(s.perMsM * SPEED_TO_MS[windUnit] * SENSITIVITY_STEP[windUnit], sys, lang),
        })} />]}</Line>
      )}
    </Step>
  )

  // 6 Spin drift
  const sg = input('sg')
  const lengthMm = input('lengthMm')
  const twistIn = opt('twistIn')
  const diameterIn = opt('diameterIn')
  const twistDir = t(x.twist === 'right' ? 'rm.twistRight' : 'rm.twistLeft')
  const spin = shareOf('spinDrift')
  const spinStep = (
    <Step n={6} t={t} title={t('calc.s.spinDrift')} why={t('calc.why.spinDrift')} result={shareResult(spin, 'spinDrift')} off={effectOff('spinDrift')}
      sw={fxSwitch('spinDrift', t('calc.s.spinDrift'))}>
      <Line>{[
        sg && <Item key="sg" v={t('calc.in.sg', { sg: fix(sg.value, 2, lang) })} />,
        <Item key="tw" v={twistIn === null ? DASH : t('calc.in.twist', { t: num(twistIn, 2, lang), mm: `${num(twistIn * MM_PER_IN, 0, lang)}${NBSP}mm`, dir: twistDir })} src={src('twistIn')} />,
      ]}</Line>
      <Line>{[
        lengthMm && <Item key="l" k={t('calc.in.bullet')} {...mmIn(lengthMm.value)} src={src('lengthMm')} />,
        <Item key="m" v={`${num(val('massGr'), 1, lang)}${NBSP}gr`} c={`${num(val('massGr') * MASS_TO_G.gr, 1, lang)}${NBSP}g`} src={src('massGr')} />,
        <Item key="dm" v={diameterIn === null ? DASH : `${num(diameterIn, 3, lang)}${NBSP}in`} c={diameterIn === null ? undefined : `${num(diameterIn * MM_PER_IN, 2, lang)}${NBSP}mm`} src={src('diameterIn')} />,
      ]}</Line>
      {sg && spin && !isMissing(spin) && (
        <Line>{[
          <Item key="f" v={t('calc.in.litzDrift', { sg: fix(sg.value, 2, lang), t: fix(s.timeS, 3, lang), in: `${fix(Math.abs(spin.xM) / 0.0254, 1, lang)}${NBSP}in` })} />,
        ]}</Line>
      )}
    </Step>
  )

  // 7 Coriolis and Eötvös
  const lat = val('latitudeDeg')
  const azimuth = input('azimuthDeg')
  const coriolisStep = (
    <Step n={7} t={t} title={t('calc.s.coriolis')} why={t('calc.why.coriolis')} result={shareResult(shareOf('coriolis'), 'coriolis')} off={effectOff('coriolis')}
      sw={fxSwitch('coriolis', t('calc.s.coriolis'))}>
      <Line>{[
        <Item key="lat" k={t('calc.in.latitude')} v={t(lat < 0 ? 'calc.in.south' : 'calc.in.north', { v: num(Math.abs(lat), 2, lang) })} src={src('latitudeDeg')} />,
        azimuth
          ? <Item key="az" k={t('calc.in.azimuth')} v={`${num(azimuth.value, 1, lang)}°`} src={src('azimuthDeg')} />
          : <span key="az" className="calc-off">{t('calc.off.azimuth')}</span>,
      ]}</Line>
    </Step>
  )

  // 8 Aerodynamic jump
  const jump = shareOf('aeroJump')
  const calibres = lengthMm && diameterIn !== null ? lengthMm.value / MM_PER_IN / diameterIn : null
  const jumpStep = (
    <Step n={8} t={t} title={t('calc.s.aeroJump')} why={t('calc.why.aeroJump')} result={shareResult(jump, 'aeroJump')} off={effectOff('aeroJump')}
      sw={fxSwitch('aeroJump', t('calc.s.aeroJump'))}>
      <Line>{[
        rounded(cross, 1) !== 0
          ? <Item key="x" v={t(cross > 0 ? 'calc.in.crossLeft' : 'calc.in.crossRight', { s: crossText(cross) })} />
          : <Item key="x" v={t('calc.in.noCross')} />,
        <Item key="tw" v={twistDir} />,
        sg && <Item key="sg" v={t('calc.in.sg', { sg: fix(sg.value, 2, lang) })} />,
        calibres !== null && <Item key="l" v={t('calc.in.calibres', { l: fix(calibres, 1, lang) })} />,
      ]}</Line>
      <Line>{[<Item key="f" v={t('calc.in.litzJump')} />]}</Line>
    </Step>
  )

  // 9 The earth's curvature
  const curvatureStep = (
    <Step n={9} t={t} title={t('calc.s.curvature')} why={t('calc.why.curvature')} result={shareResult(shareOf('curvature'), 'curvature')}
      off={effectOff('curvature')} sw={fxSwitch('curvature', t('calc.s.curvature'))}>
      <Line>{[<Item key="g" v={t('calc.in.gravity')} />]}</Line>
    </Step>
  )

  // The windage: the wind, plus the spin drift and Coriolis when they are on.
  const parts = [x.wind?.xM ?? 0]
  if (spin && !isMissing(spin) && spin.on) parts.push(spin.xM)
  const cor = shareOf('coriolis')
  if (cor && !isMissing(cor) && cor.on) parts.push(cor.xM)
  const unitLen = toDisplay(1, 'length', sys).unit
  const windageStep = (
    <Step numbered={false} t={t} title={t('calc.s.windage')} why={t('calc.why.windage')}
      result={t('calc.in.hold', { v: `${arrowed(s.windage, LEFT_RIGHT)}${NBSP}${U}` })}>
      <Line>{[
        <Item key="sum" v={`${parts.map((m) => term(m, sys, LEFT_RIGHT, lang)).join(' + ')} = ${term(x.hitXM, sys, LEFT_RIGHT, lang)}${NBSP}${unitLen}`} />,
      ]}</Line>
    </Step>
  )

  // 10 Hit chance
  const hit = s.hit
  const sigmaPart = (m: number) => len(m, sys, lang).split(NBSP)[0]
  const xParts = hit && [
    hit.x.wind !== undefined && `${t('calc.src.wind', { s: windText(val('windSigmaMs'), windUnit) })} ${sigmaPart(hit.x.wind)}`,
    hit.x.rifle !== undefined && `${t('calc.src.rifle')} ${sigmaPart(hit.x.rifle)}`,
    hit.x.hold !== undefined && `${t('calc.src.hold')} ${sigmaPart(hit.x.hold)}`,
  ].filter(Boolean).join(' · ')
  const yParts = hit && [
    hit.y.rifle !== undefined && `${t('calc.src.rifle')} ${sigmaPart(hit.y.rifle)}`,
    hit.y.mv !== undefined && `${t('calc.src.mv')} ${sigmaPart(hit.y.mv)}`,
    hit.y.bc !== undefined && `${t('calc.src.bc', { p: `${num(val('bcSdPct'), 1, lang)}${NBSP}%` })} ${sigmaPart(hit.y.bc)}`,
    hit.y.hold !== undefined && `${t('calc.src.hold')} ${sigmaPart(hit.y.hold)}`,
  ].filter(Boolean).join(' · ')
  const accuracyMoa = opt('accuracyMoa')
  const mvSd = input('mvSdMs')
  const hitStep = (
    <Step n={10} t={t} title={t('calc.s.hit')} why={t('calc.why.hit')} result={hit ? chanceText(hit.chance) : '—'}>
      <Line>{[<Item key="tg" v={t('calc.in.target', { cm: `${num(val('targetCm'), 1, lang)}${NBSP}cm` })} />]}</Line>
      {hit && (
        <>
          <Line>{[<Item key="x" v={`${t('calc.in.sigmaX', { l: len(hit.sigmaX, sys, lang) })}: ${xParts}`} />]}</Line>
          <Line>{[<Item key="y" v={`${t('calc.in.sigmaY', { l: len(hit.sigmaY, sys, lang) })}: ${yParts}`} />]}</Line>
        </>
      )}
      <Line>{[
        accuracyMoa === null
          ? <span key="r" className="calc-off">{t('calc.off.accuracy')}</span>
          : <Item key="r" v={t('calc.in.rifle', { moa: num(accuracyMoa, 2, lang), n: val('groupShots') })} src={src('accuracyMoa')} />,
        mvSd
          ? <Item key="mv" k={t('calc.in.mvSd')} v={ms(mvSd.value)} src={src('mvSdMs')} />
          : <span key="mv" className="calc-off">{t('calc.off.mvSd')}</span>,
      ]}</Line>
      {customScope && <Line>{[<span key="mg" className="calc-off">{t('calc.off.magnification')}</span>]}</Line>}
      <Line>{[<Item key="h" v={t('calc.in.holdEst', { v: `${num(val('holdSigmaMrad'), 3, lang)}${NBSP}MRAD` })} />]}</Line>
      {hit?.dominant && <p className="calc-d calc-cost">{t(`real.cost.${hit.dominant}`)}</p>}
    </Step>
  )

  // The slope, against the rifleman's rule
  const slopeDeg = val('slopeDeg')
  const slopeStep = x.slope && (
    <Step numbered={false} t={t} title={t('calc.s.slope')} why={t('calc.why.slope')}
      result={<Lines lines={shareLines(x.slope.differenceM, 0, d, unit, sys).map((l) => t('calc.rule', { v: l }))} />}>
      <Line>{[
        <Item key="e" v={t('calc.in.slopeExact', { deg: `${num(slopeDeg, 1, lang)}°`, e: `${arrowed(x.slope.elevation, UP_DOWN, 2)}${NBSP}${U}` })} />,
        <Item key="r" v={t('calc.in.rifleman', { d: fmtDistance(x.slope.horizontalM, sys), e: `${arrowed(x.slope.riflemanElevation, UP_DOWN, 2)}${NBSP}${U}` })} />,
        term(x.slope.differenceM, sys, UP_DOWN) !== '0' &&
          <Item key="dd" v={t(x.slope.differenceM < 0 ? 'calc.in.ruleLow' : 'calc.in.ruleHigh', { l: len(x.slope.differenceM, sys, lang) })} />,
      ]}</Line>
    </Step>
  )

  // Cant, as a sensitivity
  const cantStep = (
    <Step numbered={false} t={t} title={t('calc.s.cant')} why={t('calc.why.cant')} result={t('calc.cantPer', { l: len(x.cantPerDegM, sys) })}>
      <Line>{[
        <Item key="c" v={t('calc.in.cant', { l: len(x.cantPerDegM, sys, lang), a: `${fix(x.cantAlphaRad * 1000, 2, lang)}${NBSP}MRAD` })} />,
      ]}</Line>
    </Step>
  )

  return frame(
    <>
      <ol className="calc-steps">
        {air}{mvStep}{flight}{elevationStep}{windStep}{spinStep}{coriolisStep}{jumpStep}{curvatureStep}
      </ol>
      {windageStep}
      <ol className="calc-steps" start={10}>{hitStep}</ol>
      {slopeStep}
      {cantStep}
    </>,
  )

  function frame(body: ReactNode) {
    // On <body>, so no sticky bar or stacked column paints over it.
    return createPortal(
      <div className="calc-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div ref={ref} className="calc-sheet panel" role="dialog" aria-modal="true" aria-labelledby="calc-title" tabIndex={-1} onKeyDown={trap}>
          <div className="calc-head">
            <h2 id="calc-title">{t('calc.title')} <span className="calc-dist num">· {fmtDistance(d, sys)}</span></h2>
            <button ref={closeRef} type="button" className="icon-btn calc-close" aria-label={t('calc.close')} title={t('calc.close')} onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
          <div className="calc-body">
            <p className="calc-note">{t('calc.note')}</p>
            {body}
          </div>
        </div>
      </div>,
      document.body,
    )
  }
}

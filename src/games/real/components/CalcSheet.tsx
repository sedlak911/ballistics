import { useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Switch } from '../../../components/Switch'
import { useModalSheet } from '../../../components/useModalSheet'
import type { BudgetSource } from '../../../engine/budget'
import { angleFromRad, cToF, MASS_TO_G, PRESSURE_TO_HPA, radFromAngle, SPEED_TO_MS, toDisplay, type UnitSystem } from '../../../engine/units'
import { fmtDistance } from '../../../format'
import type { T, TKey } from '../../../i18n'
import { useSettings } from '../../../settings/SettingsContext'
import type { Lang } from '../../../settings/url'
import { useRealProfile, type Effect } from '../profile'
import { LINK_SOURCE } from '../profiles'
import type { MissingInput, RealInput, RealShare, RealSolution } from '../solve'
import {
  angleLabel, calibresText, degreesText, elevationAngleText, fix, hitHeightText, holdText, inputValue, isYours, lagFigures, latitudeText, len,
  litzFigures, MM_PER_IN, muzzleCrossMs, num, sgText, shareLines, SIGMA_X, SIGMA_Y, sigmaPart, term, windageParts,
} from './calcText'
import { working, type StepId, type WorkEnv, type WorkLine } from './calcWorking'
import { CloseIcon } from './icons'
import {
  arrowed, chanceText, clickDigits, clicksText, LEFT_RIGHT, lengthText, NBSP, rounded, sensitivityWind, SENSITIVITY_STEP, sourceMaker, UP_DOWN, windText,
} from './realText'
import './calc.css'

const FT_M = 0.3048

/** The side sheets' backdrop (this one and how to read the wind): the dock's guards tell a press or an Escape on a sheet by it. */
export const SHEET_BACKDROP = 'calc-backdrop'

/** Where an input comes from, as a tag: a preset value by its maker (an estimate dashed), yours, a station source. */
function Src({ i, t, trued, sys }: { i: RealInput | null; t: T; trued?: number | null; sys: UnitSystem }) {
  if (!i) return null
  if (i.trust !== null) {
    if (trued != null) return <span className="tag yours">{t('rm.src.trued', { d: fmtDistance(trued, sys) })}</span>
    if (i.source === 'yours') return <span className="tag yours">{t('rm.src.yours')}</span>
    if (i.source === LINK_SOURCE) return <span className="tag yours">{t('rm.src.link')}</span>
    if (i.trust === 'N') return <span className="tag muted calc-est" title={i.source}>{t('rm.src.estimate')}</span>
    return <span className="tag muted" title={i.source}>{t('rm.src.preset', { src: sourceMaker(i.source) })}</span>
  }
  const word: Partial<Record<string, TKey>> = {
    manual: 'st.src.manual', standard: 'st.src.standard', model: 'st.src.model', location: 'st.src.location',
    air: 'st.airs', default: 'rm.src.default', scope: 'calc.src.scope', profile: 'calc.src.setting', preset: 'calc.src.preset',
  }
  const key = word[i.source]
  if (!key) return null
  return <span className={i.source === 'manual' ? 'tag yours' : 'tag muted'}>{t(key)}</span>
}

/** One input or figure of a step: its word, the value, the value in the other unit and where it comes from; `yours` marks a value you set. */
function Item({ k, v, c, src, yours }: { k?: string; v: ReactNode; c?: string; src?: ReactNode; yours?: boolean }) {
  return (
    <span className="calc-i">
      {k && <span className="calc-k">{k} </span>}
      <b className={yours ? 'calc-yours' : undefined}>{v}</b>
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

/** One line of a step's working; a value you set in it green, as in the body. */
function WorkRow({ line }: { line: WorkLine }) {
  return (
    <p className={`calc-w calc-w-${line.kind}`}>
      {line.pieces.map((p, i) => (typeof p === 'string' ? p : <b key={i} className="calc-yours">{p.yours}</b>))}
    </p>
  )
}

/**
 * A step: number, title, ⓘ and the result on one row; under ⓘ the learner's explanation and, after a blank line, the
 * step's working (its formula, then with this shot's numbers); then the body with the inputs.
 */
function Step({ n, title, why, work, result, off, sw, children, t, numbered = true }: {
  n?: number
  title: string
  why: string
  work?: WorkLine[]
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
      {open && (
        <div id={`${id}-why`} className="calc-why">
          <p className="calc-why-text">{why}</p>
          {work && work.length > 0 && (
            <div className="calc-work">
              {work.map((line, i) => <WorkRow key={i} line={line} />)}
            </div>
          )}
        </div>
      )}
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
export function CalcSheet({ solution: s, customScope, windByHand = false, onClose, returnFocus }: {
  solution: RealSolution
  /** A scope of your own: its magnification has no model yet, and the sheet says so. */
  customScope: boolean
  /** The wind was set by hand (not followed from the forecast): its figures are yours. */
  windByHand?: boolean
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
  // Whether you set an input (a trued muzzle velocity counts), for the green mark on its value.
  const yo = (key: string, trued?: number | null) => trued != null || isYours(input(key), windByHand)
  const d = val('distanceM')
  const x = s.explain
  const shares = s.shares
  const fx = profile.effects
  const toggle = (e: Effect) => (on: boolean) => setProfile({ effects: { [e]: on } })
  // The working under each ⓘ marks your values as the body does (a trued muzzle velocity counts).
  const env: WorkEnv = { t, lang, sys, effects: fx, yours: (key) => yo(key, key === 'muzzleVelocityMs' ? opt('truedAtM') : undefined) }
  const work = (step: StepId) => working(step, s, env)

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
    <Step n={1} t={t} title={t('calc.s.air')} why={t('calc.why.air')} work={work('air')}
      result={`ρ ${fix(val('densityKgM3'), 3, 'en')}${NBSP}kg/m³`}>
      <Line>{[
        <Item key="t" k={t('calc.in.temp')} {...temp(tempC)} src={src('tempC')} yours={yo('tempC')} />,
        qnh && <Item key="q" k={t('calc.in.qnh')} {...hPa(qnh.value)} src={src('qnhHPa')} yours={yo('qnhHPa')} />,
        <Item key="p" k={t('calc.in.station')} {...hPa(val('stationPressureHPa'))} src={src('stationPressureHPa')} yours={yo('stationPressureHPa')} />,
        <Item key="h" k={t('calc.in.humidity')} v={`${num(val('humidityPct'), 0, lang)}${NBSP}%`} src={src('humidityPct')} yours={yo('humidityPct')} />,
        <Item key="a" k={t('calc.in.altitude')} {...metres(val('altitudeM'))} src={src('altitudeM')} yours={yo('altitudeM')} />,
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
    <Step n={2} t={t} title={t('calc.s.mv')} why={t('calc.why.mv')} work={work('mv')} result={`${num(val('mvUsedMs'), 1, 'en')}${NBSP}m/s`}>
      <Line>{[
        <Item key="r" k={t('calc.in.mvRef')} v={ms(refMv)} c={`${num(refMv / FT_M, 0, lang)}${NBSP}ft/s`} src={src('muzzleVelocityMs', truedAt)} yours={yo('muzzleVelocityMs', truedAt)} />,
        <Item key="rt" k={t('calc.in.mvRefTemp')} {...(mvRefTempC === null ? { v: DASH } : temp(mvRefTempC))} src={src('mvRefTempC')} yours={yo('mvRefTempC')} />,
        <Item key="p" k={t('calc.in.powder')} {...temp(val('powderTempC'))} src={src('powderTempC')} yours={yo('powderTempC')} />,
        <Item key="k" k={t('calc.in.sens')} v={powderSens === null ? DASH : `${num(powderSens, 2, lang)}${NBSP}${t('rm.sensUnit')}`} src={src('powderSensMsPerC')} yours={yo('powderSensMsPerC')} />,
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
    <Step n={3} t={t} title={t('calc.s.flight')} why={t('calc.why.flight')} work={work('flight')}
      result={`${fix(s.timeS, 3, 'en')}${NBSP}s · ${num(s.velocityMs, 0, 'en')}${NBSP}m/s`}>
      <Line>{[
        // In your distance unit, as the title and the bar give it; under imperial the metres the working uses in brackets.
        <Item key="dist" k={t('calc.in.distance')} {...(sys === 'metric' ? { v: `${num(d, 1, lang)}${NBSP}m` } : { v: fmtDistance(d, sys), c: `${num(d, 1, lang)}${NBSP}m` })}
          yours src={<span className="tag yours">{t('rm.src.yours')}</span>} />,
        x.dragModel === 'table'
          ? <Item key="d" v={t('rm.curve')} src={src('sectionalDensity')} yours={yo('sectionalDensity')} />
          : <Item key="d" k={t('calc.in.bc', { model: x.dragModel })} v={num(val('bc'), 3, lang)} src={src('bc')} yours={yo('bc')} />,
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
  const travel = input('travelUp')
  const elevationStep = (
    <Step n={4} t={t} title={t('calc.s.elevation')} why={t('calc.why.elevation')} work={work('elevation')}
      result={`${arrowed(s.elevation, UP_DOWN)}${NBSP}${U} · ${clicksText(Math.abs(clicks), t, lang)}`}>
      <Line>{[
        <Item key="y" v={t(x.hitYM > 0 ? 'calc.in.above' : 'calc.in.below', {
          y: hitHeightText(x.hitYM, lang), d: `${num(d, 1, lang)}${NBSP}m`, e: elevationAngleText(x.hitYM, d, s.elevation, unit, lang),
        })} />,
        <Item key="v" v={t('calc.in.allVertical')} />,
      ]}</Line>
      <Line>{[
        capped
          ? <Item key="c" v={t('real.dialHold', { d: fix(dialed, digits, lang), clicks: clicksText(Math.abs(clicks), t, lang), h: `↑${fix(hold, digits, lang)}` })} />
          : <Item key="c" v={t('calc.in.clicksOf', { clicks: clicksText(Math.abs(clicks), t, lang), c: `${num(click, 3, lang)}${NBSP}${U}` })} src={src('clickValue')} yours={yo('clickValue')} />,
        // Whole cm, the same figure as the answer's dial line.
        !capped && <Item key="l" v={t('real.leftOver', { l: lengthText(radFromAngle(remainder, unit) * d, sys) })} />,
        travel
          ? <Item key="tr" k={t('calc.in.travel')} v={`${num(travel.value, 2, lang)}${NBSP}${U}`} src={src('travelUp')} yours={yo('travelUp')} />
          : <span key="tr" className="calc-off">{t('calc.off.travel')}</span>,
      ]}</Line>
      <Line>{[
        <Item key="z" k={t('calc.in.zero')} v={fmtDistance(val('zeroM'), sys)} src={src('zeroM')} yours={yo('zeroM')} />,
        <Item key="h" k={t('calc.in.sight')} {...mmIn(val('sightHeightMm'))} src={src('sightHeightMm')} yours={yo('sightHeightMm')} />,
      ]}</Line>
      <Line>{[
        <Item key="b" v={t('calc.in.bore', { b: angle(val('boreAngleMrad') / 1000), mv: ms(x.zeroMvMs) })} />,
      ]}</Line>
    </Step>
  )

  // 5 Wind
  const windMs = val('windMs')
  const cross = muzzleCrossMs(x)
  const crossText = (v: number) => `${fix(Math.abs(v), 1, lang)}${NBSP}m/s`
  const windUnit = profile.windUnit
  const unitLen = toDisplay(1, 'length', sys).unit
  // The view's predicate: any zone's wind, or the near one, above 0.
  const windy = s.zoneSpeeds === null ? windMs > 0 : s.zoneSpeeds[1].some((v) => v > 0)
  // Signed like the sum in step 6: `→20 cm`, `←5.6 cm` or `0`.
  const zoneDrift = (m: number) => {
    const tm = term(m, sys, LEFT_RIGHT, lang)
    return tm === '0' ? tm : `${tm}${NBSP}${unitLen}`
  }
  // A zone is yours when it has a wind of its own, or follows a near wind you set by hand (the near one has none of its own).
  const zoneByHand = (zn: { own: boolean }) => zn.own || windByHand
  const windStep = (
    <Step n={5} t={t} title={t('calc.s.wind')} why={t('calc.why.wind')} work={work('wind')}
      result={x.wind ? <Lines lines={shareLines(x.wind.yM, x.wind.xM, d, unit, sys)} /> : '—'}>
      {windy ? (
        <>
          <Line>{[
            <Item key="w" v={`${x.zones ? `${t('zones.near')}: ` : ''}${t('calc.in.windFrom', { s: windText(windMs, windUnit), h: val('windClock') })}`}
              c={windUnit === 'm/s' ? undefined : windText(windMs, 'm/s')} yours={windByHand}
              src={windByHand ? <span className="tag yours">{t('rm.src.yours')}</span> : undefined} />,
            // Yours as the working's lag line marks its crosswind.
            x.zones === null && rounded(cross, 1) !== 0 && <Item key="x" v={t(cross > 0 ? 'calc.in.crossLeft' : 'calc.in.crossRight', { s: crossText(cross) })} yours={yo('windMs')} />,
            rounded(x.tailMs, 1) !== 0 && <Item key="h" v={t(x.tailMs > 0 ? 'calc.in.tail' : 'calc.in.head', { s: crossText(x.tailMs) })} />,
          ]}</Line>
          {x.zones !== null && x.zones.map((zn) => (
            <Line key={zn.name}>{[
              <Item key="zone" v={t(
                rounded(zn.crossMs, 1) === 0 ? 'calc.in.zone' : zn.crossMs > 0 ? 'calc.in.zoneLeft' : 'calc.in.zoneRight',
                { zone: t(`zones.${zn.name}`), s: crossText(zn.crossMs), d: zoneDrift(zn.driftM) },
              )} yours={zoneByHand(zn)}
                src={zoneByHand(zn) ? <span className="tag yours">{t('rm.src.yours')}</span> : undefined} />,
            ]}</Line>
          ))}
          {x.lag !== null && (
            <Line>{[
              <Item key="lag" v={t('calc.in.lag', lagFigures(x.lag, d, lang))} />,
            ]}</Line>
          )}
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
  const litzLine = (f: ReturnType<typeof litzFigures>) => t('calc.in.litzDrift', { ...f, in: `${f.in}${NBSP}in` })
  const spinStep = (
    <Step n={6} t={t} title={t('calc.s.spinDrift')} why={t('calc.why.spinDrift')} work={work('spinDrift')} result={shareResult(spin, 'spinDrift')} off={effectOff('spinDrift')}
      sw={fxSwitch('spinDrift', t('calc.s.spinDrift'))}>
      <Line>{[
        sg && <Item key="sg" v={t('calc.in.sg', { sg: sgText(sg.value, lang) })} />,
        <Item key="tw" v={twistIn === null ? DASH : t('calc.in.twist', { t: num(twistIn, 2, lang), mm: `${num(twistIn * MM_PER_IN, 0, lang)}${NBSP}mm`, dir: twistDir })} src={src('twistIn')} yours={yo('twistIn')} />,
      ]}</Line>
      <Line>{[
        lengthMm && <Item key="l" k={t('calc.in.bullet')} {...mmIn(lengthMm.value)} src={src('lengthMm')} yours={yo('lengthMm')} />,
        <Item key="m" v={`${num(val('massGr'), 1, lang)}${NBSP}gr`} c={`${num(val('massGr') * MASS_TO_G.gr, 1, lang)}${NBSP}g`} src={src('massGr')} yours={yo('massGr')} />,
        <Item key="dm" v={diameterIn === null ? DASH : `${num(diameterIn, 3, lang)}${NBSP}in`} c={diameterIn === null ? undefined : `${num(diameterIn * MM_PER_IN, 2, lang)}${NBSP}mm`} src={src('diameterIn')} yours={yo('diameterIn')} />,
      ]}</Line>
      {sg && spin && !isMissing(spin) && (
        <Line>{[
          <Item key="f" v={litzLine(litzFigures(sg.value, s.timeS, spin.xM, lang))} />,
        ]}</Line>
      )}
    </Step>
  )

  // 7 Coriolis and Eötvös
  const lat = val('latitudeDeg')
  const azimuth = input('azimuthDeg')
  const coriolisStep = (
    <Step n={7} t={t} title={t('calc.s.coriolis')} why={t('calc.why.coriolis')} work={work('coriolis')} result={shareResult(shareOf('coriolis'), 'coriolis')} off={effectOff('coriolis')}
      sw={fxSwitch('coriolis', t('calc.s.coriolis'))}>
      <Line>{[
        <Item key="lat" k={t('calc.in.latitude')} v={latitudeText(lat, t, lang)} src={src('latitudeDeg')} yours={yo('latitudeDeg')} />,
        azimuth
          ? <Item key="az" k={t('calc.in.azimuth')} v={degreesText(azimuth.value, lang)} src={src('azimuthDeg')} yours={yo('azimuthDeg')} />
          : <span key="az" className="calc-off">{t('calc.off.azimuth')}</span>,
      ]}</Line>
    </Step>
  )

  // 8 Aerodynamic jump
  const jump = shareOf('aeroJump')
  const calibres = lengthMm && diameterIn !== null ? calibresText(lengthMm.value, diameterIn, lang) : null
  const jumpStep = (
    <Step n={8} t={t} title={t('calc.s.aeroJump')} why={t('calc.why.aeroJump')} work={work('aeroJump')} result={shareResult(jump, 'aeroJump')} off={effectOff('aeroJump')}
      sw={fxSwitch('aeroJump', t('calc.s.aeroJump'))}>
      <Line>{[
        // The crosswind and the length are yours as the working's W and L are.
        rounded(cross, 1) !== 0
          ? <Item key="x" v={t(cross > 0 ? 'calc.in.crossLeft' : 'calc.in.crossRight', { s: crossText(cross) })} yours={yo('windMs')} />
          : <Item key="x" v={t('calc.in.noCross')} yours={yo('windMs')} />,
        <Item key="tw" v={twistDir} />,
        sg && <Item key="sg" v={t('calc.in.sg', { sg: sgText(sg.value, lang) })} />,
        calibres !== null && <Item key="l" v={t('calc.in.calibres', { l: calibres })} yours={yo('lengthMm')} />,
      ]}</Line>
      <Line>{[<Item key="f" v={t('calc.in.litzJump')} />]}</Line>
    </Step>
  )

  // 9 The earth's curvature
  const curvatureStep = (
    <Step n={9} t={t} title={t('calc.s.curvature')} why={t('calc.why.curvature')} work={work('curvature')} result={shareResult(shareOf('curvature'), 'curvature')}
      off={effectOff('curvature')} sw={fxSwitch('curvature', t('calc.s.curvature'))}>
      <Line>{[<Item key="g" v={t('calc.in.gravity')} />]}</Line>
    </Step>
  )

  // The windage: the wind, plus the spin drift and Coriolis when they are on.
  const parts = windageParts(s)
  const windageStep = (
    <Step numbered={false} t={t} title={t('calc.s.windage')} why={t('calc.why.windage')} work={work('windage')}
      result={t('calc.in.hold', { v: holdText(s.windage, unit) })}>
      <Line>{[
        <Item key="sum" v={`${parts.map((m) => term(m, sys, LEFT_RIGHT, lang)).join(' + ')} = ${term(x.hitXM, sys, LEFT_RIGHT, lang)}${NBSP}${unitLen}`} />,
      ]}</Line>
    </Step>
  )

  // 10 Hit chance
  const hit = s.hit
  const sourceWord = (source: BudgetSource) =>
    source === 'wind' ? t('calc.src.wind', { s: windText(val('windSigmaMs'), windUnit) })
      : source === 'bc' ? t('calc.src.bc', { p: `${num(val('bcSdPct'), 1, lang)}${NBSP}%` })
      : t(`calc.src.${source}`)
  // Each source the budget has, in the order the working squares them.
  const budgetParts = (parts: Partial<Record<BudgetSource, number>>, order: BudgetSource[]) => order
    .flatMap((source) => (parts[source] === undefined ? [] : [`${sourceWord(source)} ${sigmaPart(parts[source], sys, lang)}`]))
    .join(' · ')
  const xParts = hit && budgetParts(hit.x, SIGMA_X)
  const yParts = hit && budgetParts(hit.y, SIGMA_Y)
  const accuracyMoa = opt('accuracyMoa')
  const mvSd = input('mvSdMs')
  const hitStep = (
    <Step n={10} t={t} title={t('calc.s.hit')} why={t('calc.why.hit')} work={work('hit')} result={hit ? chanceText(hit.chance) : '—'}>
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
          : <Item key="r" v={t('calc.in.rifle', { moa: num(accuracyMoa, 2, lang), n: val('groupShots') })} src={src('accuracyMoa')} yours={yo('accuracyMoa')} />,
        mvSd
          ? <Item key="mv" k={t('calc.in.mvSd')} v={ms(mvSd.value)} src={src('mvSdMs')} yours={yo('mvSdMs')} />
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
    <Step numbered={false} t={t} title={t('calc.s.slope')} why={t('calc.why.slope')} work={work('slope')}
      result={<Lines lines={shareLines(x.slope.differenceM, 0, d, unit, sys).map((l) => t('calc.rule', { v: l }))} />}>
      <Line>{[
        <Item key="sl" k={t('calc.in.slope')} v={degreesText(slopeDeg, lang)} yours src={<span className="tag yours">{t('rm.src.yours')}</span>} />,
        <Item key="e" v={t('calc.in.slopeExact', { deg: degreesText(slopeDeg, lang), e: `${arrowed(x.slope.elevation, UP_DOWN, 2)}${NBSP}${U}` })} />,
        <Item key="r" v={t('calc.in.rifleman', { d: fmtDistance(x.slope.horizontalM, sys), e: `${arrowed(x.slope.riflemanElevation, UP_DOWN, 2)}${NBSP}${U}` })} />,
        term(x.slope.differenceM, sys, UP_DOWN) !== '0' &&
          <Item key="dd" v={t(x.slope.differenceM < 0 ? 'calc.in.ruleLow' : 'calc.in.ruleHigh', { l: len(x.slope.differenceM, sys, lang) })} />,
      ]}</Line>
    </Step>
  )

  // Cant, as a sensitivity
  const cantStep = (
    <Step numbered={false} t={t} title={t('calc.s.cant')} why={t('calc.why.cant')} work={work('cant')} result={t('calc.cantPer', { l: len(x.cantPerDegM, sys) })}>
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
      <div className={SHEET_BACKDROP} onClick={(e) => e.target === e.currentTarget && onClose()}>
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

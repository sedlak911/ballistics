import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { NumberField } from '../../../components/NumberField'
import { Stepper } from '../../../components/Stepper'
import { useWheelSteps } from '../../../components/useWheelSteps'
import { SPEED_TO_MS, type UnitSystem } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import { cardinalIndex, forecastOffer } from '../forecastWind'
import { WIND_SIGMA_MS, WIND_STEP, useRealProfile, type WindUnit } from '../profile'
import { BOUNDS, type RealSetup } from '../setup'
import { useStation } from '../station'
import { COMPASS_TIMEOUT_MS, hasCompass, readHeading } from './compass'
import { NBSP, dec, rounded, windText } from './realText'
import { FT_M } from './stationText'

const M_PER_YD = 0.9144
const DISTANCE_STEP = 10
const SLOPE_STEP = 1
const AZIMUTH = { min: 0, max: 360 }
/** At or under this height the forecast is the wind near the ground. */
const GROUND_M = 2

type Update = (patch: Partial<RealSetup>) => void

/**
 * The distance: typed, or − and + to the next 10 m or 10 yd. With `wheel`, a wheel notch over it is one such step too.
 */
export function DistanceTool({ setup, update, system, wheel = false }: { setup: RealSetup; update: Update; system: UnitSystem; wheel?: boolean }) {
  const { t } = useSettings()
  const ref = useRef<HTMLDivElement>(null)

  // Distance in the display unit, whole yards or a tenth of a metre (M1); the setup keeps metres. The field commits only
  // what was typed, so a shown 1094 yd never replaces 1000 m; − and + go to the next ten in the unit shown.
  const yards = system === 'imperial'
  const distUnit = yards ? 'yd' : 'm'
  const shown = yards ? Math.round(setup.distanceM / M_PER_YD) : rounded(setup.distanceM, 1)
  const toMetres = (v: number) => (yards ? rounded(v * M_PER_YD, 3) : v)
  const lo = yards ? Math.ceil(BOUNDS.distanceM.min / M_PER_YD) : BOUNDS.distanceM.min
  const hi = yards ? Math.floor(BOUNDS.distanceM.max / M_PER_YD) : BOUNDS.distanceM.max
  const stepDistance = (dir: 1 | -1, times = 1) => {
    let at = shown
    for (let i = 0; i < times; i++) {
      const next = dir > 0 ? Math.floor(at / DISTANCE_STEP + 1e-9) * DISTANCE_STEP + DISTANCE_STEP : Math.ceil(at / DISTANCE_STEP - 1e-9) * DISTANCE_STEP - DISTANCE_STEP
      at = Math.min(hi, Math.max(lo, next))
    }
    update({ distanceM: toMetres(at) })
  }
  // A 100 px mouse notch is one step.
  useWheelSteps(ref, (n) => stepDistance(n > 0 ? 1 : -1, Math.abs(n)), { enabled: wheel, pxPerStep: 100 })
  const distanceWord = t('real.distance')
  return (
    <div ref={ref} className="real-tool real-distance">
      <button type="button" className="real-step" aria-label={t('step.dec', { what: distanceWord })} disabled={shown <= lo}
        onClick={() => stepDistance(-1)}>−</button>
      <NumberField label={distanceWord} value={shown} unit={distUnit} min={lo} max={hi} step={DISTANCE_STEP} snap
        onChange={(v) => update({ distanceM: toMetres(v) })}
        invalidText={t('real.distanceInvalid', { min: lo, max: `${hi}${NBSP}${distUnit}` })} />
      <button type="button" className="real-step" aria-label={t('step.inc', { what: distanceWord })} disabled={shown >= hi}
        onClick={() => stepDistance(1)}>+</button>
    </div>
  )
}

/**
 * The slope, typed or − and + by a degree. Its hint (which way is plus) is a line under the segment, or with `title` only
 * the segment's tooltip and description, where there is no room for a line.
 */
export function SlopeTool({ setup, update, hint }: { setup: RealSetup; update: Update; hint: 'line' | 'title' }) {
  const { t } = useSettings()
  const hintId = `real-slope-hint-${useId()}`
  const word = t('real.slope')
  const hintText = t('real.slopeHint')
  const { min, max } = BOUNDS.slopeDeg
  const go = (dir: 1 | -1) => update({ slopeDeg: Math.min(max, Math.max(min, setup.slopeDeg + dir * SLOPE_STEP)) })
  return (
    <>
      <div className="real-tool real-slope" title={hint === 'title' ? hintText : undefined} aria-describedby={hint === 'title' ? hintId : undefined}
        role={hint === 'title' ? 'group' : undefined} aria-label={hint === 'title' ? word : undefined}>
        <button type="button" className="real-step" aria-label={t('step.dec', { what: word })} disabled={setup.slopeDeg <= min}
          onClick={() => go(-1)}>−</button>
        <NumberField label={word} value={setup.slopeDeg} unit="°" min={min} max={max} step={SLOPE_STEP}
          onChange={(v) => update({ slopeDeg: v })} invalidText={t('real.slopeInvalid')} />
        <button type="button" className="real-step" aria-label={t('step.inc', { what: word })} disabled={setup.slopeDeg >= max}
          onClick={() => go(1)}>+</button>
        {hint === 'title' && <span id={hintId} className="real-hint-vh">{hintText}</span>}
      </div>
      {hint === 'line' && <p className="real-hint">{hintText}</p>}
    </>
  )
}

/**
 * The wind speed in the owner's unit, snapped to that unit's step; the setup keeps m/s. Until the wind is set, typing the
 * calm it shows sets it too.
 */
export function WindSpeedTool({ setup, update, windUnit }: { setup: RealSetup; update: Update; windUnit: WindUnit }) {
  const { t, display } = useSettings()
  const perUnit = SPEED_TO_MS[windUnit]
  const windStep = WIND_STEP[windUnit]
  const windShown = setup.windMs / perUnit
  const speedWord = t('real.windSpeed')
  const windMax = Math.floor((BOUNDS.windMs.max / perUnit) * 10 + 1e-9) / 10
  const storeWind = (v: number) => update({ windMs: Math.min(BOUNDS.windMs.max, Math.round(rounded(v, 1) * perUnit * 1000) / 1000) })
  const stepWind = (dir: 1 | -1) => {
    const base = rounded(windShown, 1)
    const next = (dir > 0 ? Math.floor(base / windStep + 1e-9) + 1 : Math.ceil(base / windStep - 1e-9) - 1) * windStep
    storeWind(Math.min(windMax, Math.max(0, +next.toPrecision(10))))
  }
  return (
    <>
      <button type="button" className="real-step" aria-label={t('step.dec', { what: speedWord })} disabled={windShown <= 0}
        onClick={() => stepWind(-1)}>−</button>
      <NumberField label={speedWord} value={rounded(windShown, 1)} unit={windUnit} min={0} max={windMax} step={windStep} snap
        commitSame={!setup.windSet} onChange={(v) => storeWind(v)}
        invalidText={t('real.windInvalid', { max: `${dec(windMax, 1, display.lang).replace(/[.,]0$/, '')}${NBSP}${windUnit}` })} />
      <button type="button" className="real-step" aria-label={t('step.inc', { what: speedWord })} disabled={windShown >= windMax}
        onClick={() => stepWind(1)}>+</button>
    </>
  )
}

/** How far the real wind may be from the one set, 1σ, in the wind unit: − and +, from 0.5 to 3 m/s. */
export function WindSigmaTool() {
  const { t } = useSettings()
  const [profile, setProfile] = useRealProfile()
  const word = t('st.windSigma')
  return (
    <Stepper label={word} value={profile.windSigmaMs} min={WIND_SIGMA_MS.min} max={WIND_SIGMA_MS.max} step={WIND_SIGMA_MS.step}
      format={(v) => `±${windText(v, profile.windUnit)}`} onChange={(windSigmaMs) => setProfile({ windSigmaMs })}
      decLabel={t('step.dec', { what: word })} incLabel={t('step.inc', { what: word })} />
  )
}

/**
 * The bearing to the target, typed or from the phone's compass (on a phone only). Empty is unknown. The nearest compass
 * point shows beside the unit. A reading in progress is dropped when the field goes.
 */
export function DirectionField({ compass, inputRef }: { compass: boolean; inputRef?: RefObject<HTMLInputElement | null> }) {
  const { t } = useSettings()
  const [station, set] = useStation()
  const [reading, setReading] = useState<'idle' | 'busy' | 'failed'>('idle')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const takeReading = async () => {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setReading('busy')
    const deg = await readHeading(ctl.signal)
    if (ctl.signal.aborted) return
    if (deg === null) setReading('failed')
    else {
      set({ azimuthDeg: { value: deg, source: 'manual' } })
      setReading('idle')
    }
  }

  const value = station.azimuthDeg?.value ?? null
  const point = value === null ? '' : `${NBSP}·${NBSP}${t('real.cardinals').split(' ')[cardinalIndex(value)]}`
  return (
    <div className="real-direction">
      <div className="real-direction-row">
        <NumberField commitSame label={t('real.direction')} value={value} unit={`°${point}`} min={AZIMUTH.min} max={AZIMUTH.max} step={5}
          placeholder={t('st.unknown')} inputRef={inputRef} invalidText={t('rm.range', { min: AZIMUTH.min, max: AZIMUTH.max })}
          onChange={(v) => set({ azimuthDeg: { value: v, source: 'manual' } })} onClear={() => set({ azimuthDeg: null })} />
        {compass && hasCompass() && (
          <button type="button" className="btn ghost" disabled={reading === 'busy'} onClick={takeReading}>{t('st.compass')}</button>
        )}
      </div>
      <span className="rm-note">{t('real.directionNote')}</span>
      {reading === 'busy' && <span className="rm-note" role="status">{t('st.compassBusy', { s: COMPASS_TIMEOUT_MS / 1000 })}</span>}
      {reading === 'failed' && <span className="rm-msg bad" role="alert">{t('st.compassFail')}</span>}
    </div>
  )
}

/**
 * The forecast wind as an offer, never applied by itself: Use is the only way it reaches the wind. A calm offers Use
 * without a direction; otherwise, with no direction there is no hour to set, and a hint asks for the direction instead.
 */
export function ForecastLine({ update, now, onNeedDirection }: { update: Update; now: number; onNeedDirection: () => void }) {
  const { t, display } = useSettings()
  const [profile] = useRealProfile()
  const [station] = useStation()
  const offer = forecastOffer(station, now, profile.windUnit)
  if (!offer) return null

  const feet = display.system === 'imperial'
  const height = feet ? `${Math.round(offer.heightM / FT_M)}${NBSP}ft` : `${rounded(offer.heightM, 1)}${NBSP}m`
  const where = offer.heightM <= GROUND_M ? t('fc.ground') : t('fc.at', { h: height })
  const speed = `${dec(offer.shown, 1, display.lang).replace(/[.,]0$/, '')}${NBSP}${profile.windUnit}`
  const from = t('real.cardinals').split(' ')[offer.cardinal]
  const text = offer.calm ? t('fc.calm', { where })
    : offer.hour === null ? t('fc.line', { where, speed, from })
    : t('fc.lineHour', { where, speed, from, h: offer.hour })
  const use = () => update({ windMs: offer.speedMs, ...(!offer.calm && offer.hour !== null && { windClock: offer.hour }), windSet: true })
  return (
    <div className="est real-forecast">
      <span>{text}</span>
      {(offer.calm || offer.hour !== null) && <button type="button" className="btn ghost real-forecast-use" onClick={use}>{t('fc.use')}</button>}
      {!offer.calm && offer.hour === null && (
        <button type="button" className="real-forecast-ask" onClick={onNeedDirection}>{t('fc.needDirection')}</button>
      )}
    </div>
  )
}

/** Why the wind is read to half the distance. */
export function ReadingHint() {
  const { t } = useSettings()
  return <p className="real-hint">{t('real.windHint')}</p>
}

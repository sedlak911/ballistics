import { useId, useRef, type RefObject } from 'react'
import { NumberField } from '../../../components/NumberField'
import { Ruler } from '../../../components/Ruler'
import { Stepper } from '../../../components/Stepper'
import { useWheelSteps } from '../../../components/useWheelSteps'
import { SPEED_TO_MS, type UnitSystem } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import { cardinalIndex, forecastOffer } from '../forecastWind'
import { WIND_SIGMA_MS, WIND_STEP, useRealProfile, type WindUnit } from '../profile'
import { BOUNDS, type RealSetup } from '../setup'
import { useStation } from '../station'
import { useSetDirection } from '../useSetDirection'
import { setZoneWind, zoneWind, zonesActive, type ZoneName } from '../zones'
import { offerWind, windSource } from '../windFollow'
import { saveWindMemory, useWindMemory, windMemoryNow } from '../windMemory'
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
 * With `ruler` (the phone), − and + give way to a scale under the figure: the whole box drags sideways in the same steps,
 * a tap on the figure types, and the arrow keys step it. `shortWord` shows in place of the word Distance (the camera
 * view's), which stays the field's name.
 */
export function DistanceTool({ setup, update, system, wheel = false, ruler = false, shortWord }: {
  setup: RealSetup; update: Update; system: UnitSystem; wheel?: boolean; ruler?: boolean; shortWord?: string
}) {
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
  const field = (
    <NumberField label={shortWord ?? distanceWord} ariaLabel={shortWord ? distanceWord : undefined} value={shown} unit={distUnit} min={lo} max={hi}
      step={DISTANCE_STEP} snap sideArrows={ruler}
      onChange={(v) => update({ distanceM: toMetres(v) })}
      invalidText={t('real.distanceInvalid', { min: lo, max: `${hi}${NBSP}${distUnit}` })} />
  )
  return (
    <div ref={ref} className={ruler ? 'real-tool real-distance has-ruler' : 'real-tool real-distance'}>
      {!ruler && <button type="button" className="real-step" aria-label={t('step.dec', { what: distanceWord })} disabled={shown <= lo}
        onClick={() => stepDistance(-1)}>−</button>}
      {ruler ? (
        <Ruler value={shown} min={lo} max={hi} step={DISTANCE_STEP} pxPerStep={6} labelEvery={100}
          onChange={(v) => update({ distanceM: toMetres(v) })}>{field}</Ruler>
      ) : field}
      {!ruler && <button type="button" className="real-step" aria-label={t('step.inc', { what: distanceWord })} disabled={shown >= hi}
        onClick={() => stepDistance(1)}>+</button>}
    </div>
  )
}

/**
 * The slope, typed or − and + by a degree. Its hint (which way is plus) is a line under the segment, or with `title` only
 * the segment's tooltip and description, where there is no room for a line. With `live`, the field shows that reading in the
 * accent and can't be changed until the aiming ends.
 */
export function SlopeTool({ setup, update, hint, live, aiming = false, inputRef }: {
  setup: RealSetup; update: Update; hint: 'line' | 'title'
  /** The phone's reading, shown in the accent instead of the stored slope. */
  live?: number
  /** The phone is measuring: the field takes no typing, even while it has no reading to show. */
  aiming?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const { t } = useSettings()
  const off = aiming || live !== undefined
  const hintId = `real-slope-hint-${useId()}`
  const word = t('real.slope')
  const hintText = t('real.slopeHint')
  const { min, max } = BOUNDS.slopeDeg
  const shown = live ?? setup.slopeDeg
  const go = (dir: 1 | -1) => update({ slopeDeg: Math.min(max, Math.max(min, setup.slopeDeg + dir * SLOPE_STEP)) })
  return (
    <>
      <div className={live === undefined ? 'real-tool real-slope' : 'real-tool real-slope real-live'} title={hint === 'title' ? hintText : undefined} aria-describedby={hint === 'title' ? hintId : undefined}
        role={hint === 'title' ? 'group' : undefined} aria-label={hint === 'title' ? word : undefined}>
        <button type="button" className="real-step" aria-label={t('step.dec', { what: word })} disabled={off || shown <= min}
          onClick={() => go(-1)}>−</button>
        <NumberField label={word} value={shown} unit="°" min={min} max={max} step={SLOPE_STEP} disabled={off}
          inputRef={inputRef} onChange={(v) => update({ slopeDeg: v })} invalidText={t('real.slopeInvalid')} />
        <button type="button" className="real-step" aria-label={t('step.inc', { what: word })} disabled={off || shown >= max}
          onClick={() => go(1)}>+</button>
        {hint === 'title' && <span id={hintId} className="real-hint-vh">{hintText}</span>}
      </div>
      {hint === 'line' && <p className="real-hint">{hintText}</p>}
    </>
  )
}

/**
 * The wind speed in the owner's unit, snapped to that unit's step; the setup keeps m/s. Until the wind is set, typing the
 * calm it shows sets it too. With `zone`, it edits that zone's wind (the first edit of a mid or far zone gives it a wind of
 * its own); without, the near wind.
 */
export function WindSpeedTool({ setup, update, windUnit, zone }: { setup: RealSetup; update: Update; windUnit: WindUnit; zone?: ZoneName }) {
  const { t, display } = useSettings()
  const perUnit = SPEED_TO_MS[windUnit]
  const windStep = WIND_STEP[windUnit]
  const windShown = (zone ? zoneWind(setup, zone).ms : setup.windMs) / perUnit
  const speedWord = t('real.windSpeed')
  const windMax = Math.floor((BOUNDS.windMs.max / perUnit) * 10 + 1e-9) / 10
  const storeWind = (v: number) => {
    const ms = Math.min(BOUNDS.windMs.max, Math.round(rounded(v, 1) * perUnit * 1000) / 1000)
    update(zone ? setZoneWind(setup, zone, { ms }) : { windMs: ms })
  }
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
 * The bearing to the target, typed (the phone's Aim fills it from the dock's shot panel). Empty is unknown. The nearest
 * compass point shows beside the unit. With `live`, the field shows that heading in the accent and can't be changed until
 * the aiming ends.
 */
export function DirectionField({ setup, update, inputRef, live }: {
  setup: RealSetup
  update: Update
  inputRef?: RefObject<HTMLInputElement | null>
  live?: number
}) {
  const { t } = useSettings()
  const [station] = useStation()
  const setDirection = useSetDirection(setup, update)

  const value = live ?? station.azimuthDeg?.value ?? null
  const point = value === null ? '' : `${NBSP}·${NBSP}${t('real.cardinals').split(' ')[cardinalIndex(value)]}`
  return (
    <div className="real-direction">
      <div className={live === undefined ? 'real-direction-row' : 'real-direction-row real-live'}>
        <NumberField commitSame label={t('real.direction')} value={value} unit={`°${point}`} min={AZIMUTH.min} max={AZIMUTH.max} step={5}
          placeholder={t('st.unknown')} inputRef={inputRef} invalidText={t('rm.range', { min: AZIMUTH.min, max: AZIMUTH.max })}
          disabled={live !== undefined} onChange={(v) => setDirection(v)} onClear={() => setDirection(null)} />
      </div>
      <span className="rm-note">{t('real.directionNote')}</span>
    </div>
  )
}

/**
 * The forecast wind line: an offer by default, where Use is the way it reaches the wind. In Automaticky (useForecastFollow)
 * it applies by itself, and the line then says the wind is from the forecast, until a hand wind takes over. A calm offers
 * Use without a direction; otherwise, with no direction there is no hour to set, and a hint asks for the direction instead.
 */
export function ForecastLine({ setup, update, now, onNeedDirection }: { setup: RealSetup; update: Update; now: number; onNeedDirection: () => void }) {
  const { t, display } = useSettings()
  const [profile] = useRealProfile()
  const [station] = useStation()
  const mem = useWindMemory()
  const offer = forecastOffer(station, now, profile.windUnit)
  if (!offer) return null

  const feet = display.system === 'imperial'
  const height = feet ? `${Math.round(offer.heightM / FT_M)}${NBSP}ft` : `${rounded(offer.heightM, 1)}${NBSP}m`
  const where = offer.heightM <= GROUND_M ? t('fc.ground') : t('fc.at', { h: height })
  const speed = `${dec(offer.shown, 1, display.lang).replace(/[.,]0$/, '')}${NBSP}${profile.windUnit}`
  const from = t('real.cardinals').split(' ')[offer.cardinal]
  const following = profile.forecastWind === 'auto' && windSource(setup, mem) === 'forecast' && (offer.calm || offer.hour !== null)
  // Use fills every zone only while the line says ` (all zones)`: under 1000 m the mid and far winds are off screen, and stay.
  const allZones = zonesActive(setup)
  const all = allZones ? t('fc.allZones') : ''
  const text = following ? (offer.calm ? t('fc.followingCalm', { where }) : t('fc.following', { where, speed, from, h: offer.hour ?? 0 }))
    : (offer.calm ? t('fc.calm', { where })
    : offer.hour === null ? t('fc.line', { where, speed, from })
    : t('fc.lineHour', { where, speed, from, h: offer.hour })) + all
  const use = () => {
    const model = station.model
    if (!model || model.windFromDeg == null) return
    const { patch, memory } = offerWind(offer, model.windFromDeg, setup, windMemoryNow(), station.azimuthDeg?.value ?? null, allZones)
    saveWindMemory(memory)
    update(patch)
  }
  return (
    <div className="est real-forecast">
      <span>{text}</span>
      {!following && (offer.calm || offer.hour !== null) && <button type="button" className="btn ghost real-forecast-use" onClick={use}>{t('fc.use')}</button>}
      {!following && !offer.calm && offer.hour === null && (
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

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NumberField } from '../../../components/NumberField'
import { Popover } from '../../../components/Popover'
import { Stepper } from '../../../components/Stepper'
import { WindClock } from '../../../components/WindClock'
import { SPEED_TO_MS, type UnitSystem } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import type { WindUnit } from '../profile'
import { BOUNDS, type RealSetup } from '../setup'
import { NBSP, dec, rounded, windText } from './realText'

const M_PER_YD = 0.9144
const DISTANCE_STEP = 10
const TARGET_STEP_CM = 5
/** The wind stepper's step in each unit; the setup keeps m/s. */
const WIND_STEP: Record<WindUnit, number> = { 'm/s': 0.5, 'km/h': 2, mph: 1, kn: 1 }

/** The clock face in small: where the wind blows from, an accent line toward the centre. */
function MiniClock({ hour }: { hour: number }) {
  const a = (hour * Math.PI) / 6
  const at = (r: number) => ({ x: 12 + r * Math.sin(a), y: 12 - r * Math.cos(a) })
  const from = at(9.5)
  const to = at(2.5)
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" className="real-mini-face" />
      <path d="M12 2.5V5" className="real-mini-tick" />
      <path d={`M${from.x.toFixed(2)} ${from.y.toFixed(2)}L${to.x.toFixed(2)} ${to.y.toFixed(2)}`} className="real-mini-arrow" />
    </svg>
  )
}

/**
 * The inputs that change at the range: the distance (typed, or − and + to the next 10 m or 10 yd), the slope, the wind speed
 * in the owner's unit with where it blows from, and on a large screen the target's diameter. On a phone the bar is
 * fixed to the bottom of the screen in two rows.
 */
export function BottomBar({ setup, update, system, windUnit, phone }: {
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  system: UnitSystem
  windUnit: WindUnit
  phone: boolean
}) {
  const { t, display } = useSettings()
  const lang = display.lang
  const [clockOpen, setClockOpen] = useState(false)
  const clockRef = useRef<HTMLButtonElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)

  // Distance in the display unit, whole yards or a tenth of a metre (M1); the setup keeps metres. The field commits only
  // what was typed, so a shown 1094 yd never replaces 1000 m; − and + go to the next ten in the unit shown.
  const yards = system === 'imperial'
  const distUnit = yards ? 'yd' : 'm'
  const shown = yards ? Math.round(setup.distanceM / M_PER_YD) : rounded(setup.distanceM, 1)
  const toMetres = (v: number) => (yards ? rounded(v * M_PER_YD, 3) : v)
  const lo = yards ? Math.ceil(BOUNDS.distanceM.min / M_PER_YD) : BOUNDS.distanceM.min
  const hi = yards ? Math.floor(BOUNDS.distanceM.max / M_PER_YD) : BOUNDS.distanceM.max
  const stepDistance = (dir: 1 | -1) => {
    const next = dir > 0 ? Math.floor(shown / DISTANCE_STEP + 1e-9) * DISTANCE_STEP + DISTANCE_STEP : Math.ceil(shown / DISTANCE_STEP - 1e-9) * DISTANCE_STEP - DISTANCE_STEP
    update({ distanceM: toMetres(Math.min(hi, Math.max(lo, next))) })
  }
  const distanceWord = t('real.distance')
  const distance = (
    <div className="real-tool real-distance">
      <button type="button" className="real-step" aria-label={t('step.dec', { what: distanceWord })} disabled={shown <= lo}
        onClick={() => stepDistance(-1)}>−</button>
      <NumberField label={distanceWord} value={shown} unit={distUnit} min={lo} max={hi} step={DISTANCE_STEP} snap
        onChange={(v) => update({ distanceM: toMetres(v) })}
        invalidText={t('real.distanceInvalid', { min: lo, max: `${hi}${NBSP}${distUnit}` })} />
      <button type="button" className="real-step" aria-label={t('step.inc', { what: distanceWord })} disabled={shown >= hi}
        onClick={() => stepDistance(1)}>+</button>
    </div>
  )

  const slope = (
    <div className="real-tool real-slope">
      <NumberField label={t('real.slope')} value={setup.slopeDeg} unit="°" min={BOUNDS.slopeDeg.min} max={BOUNDS.slopeDeg.max}
        onChange={(v) => update({ slopeDeg: v })} invalidText={t('real.slopeInvalid')} />
    </div>
  )

  // Wind in the owner's unit, snapped to that unit's step; the setup keeps m/s.
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
  const from = t('real.windFrom', { h: setup.windClock })
  const wind = (
    <div className="real-tool real-wind">
      <span className="label" aria-hidden="true">{t('real.wind')}</span>
        <button type="button" className="real-step" aria-label={t('step.dec', { what: speedWord })} disabled={windShown <= 0}
          onClick={() => stepWind(-1)}>−</button>
        {/* Until the wind is set, typing the calm it shows sets it too. */}
        <NumberField label={speedWord} value={rounded(windShown, 1)} unit={windUnit} min={0} max={windMax} step={windStep} snap
          commitSame={!setup.windSet} onChange={(v) => storeWind(v)}
          invalidText={t('real.windInvalid', { max: `${dec(windMax, 1, lang).replace(/[.,]0$/, '')}${NBSP}${windUnit}` })} />
        <button type="button" className="real-step" aria-label={t('step.inc', { what: speedWord })} disabled={windShown >= windMax}
          onClick={() => stepWind(1)}>+</button>
      <button ref={clockRef} type="button" className="real-clock-btn" aria-haspopup="dialog" aria-expanded={clockOpen}
        aria-label={`${t('real.windDir')}: ${from}`} onClick={() => setClockOpen((o) => !o)}>
        <MiniClock hour={setup.windClock} />
        <span className="num">{from}</span>
      </button>
      {/* Over the bar: on a phone it hangs from the whole dock, so the distance row stays in sight. */}
      <Popover open={clockOpen} onClose={() => setClockOpen(false)} anchorRef={clockRef} hangFrom={phone ? dockRef : undefined}
        label={t('real.windDir')} placement="above" className="real-clock-menu">
        <WindClock label={t('real.windBlows')} value={setup.windClock} onChange={(h) => update({ windClock: h })}
          speedMs={rounded(windShown, 1)} unit={windUnit}
          valueText={t('real.clockValue', { h: setup.windClock, s: windText(setup.windMs, windUnit) })} />
      </Popover>
    </div>
  )

  const targetWord = t('real.target')
  const target = (
    <div className="real-tool real-target">
      <span className="label" aria-hidden="true">{targetWord}</span>
      <Stepper label={targetWord} value={setup.targetCm} min={BOUNDS.targetCm.min} max={BOUNDS.targetCm.max} step={TARGET_STEP_CM}
        format={(v) => `${rounded(v, 1)}${NBSP}cm`} onChange={(v) => update({ targetCm: v })}
        decLabel={t('step.dec', { what: targetWord })} incLabel={t('step.inc', { what: targetWord })} />
    </div>
  )

  if (phone) {
    return createPortal(
      <div ref={dockRef} className="real-dock" data-testid="real-dock">
        <div className="real-dock-row">{distance}{slope}</div>
        <div className="real-dock-row">{wind}</div>
      </div>,
      document.body,
    )
  }
  return <div className="real-bar" data-testid="real-bar">{distance}{slope}{wind}{target}</div>
}

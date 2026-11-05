import { useRef, useState } from 'react'
import { cToF, PRESSURE_TO_HPA } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import { useStation, weatherUnset } from '../station'
import { dec, NBSP, rounded } from './realText'
import { StationSheet } from './StationSheet'
import { ageOf, clockOf, FT_M, LINE_DIGITS, modelFreshness, shownHPa, weakestSource, type PressureUnit } from './stationText'
import './station.css'

/**
 * The atmosphere in one line under the tags, `15 °C · QNH 1013 hPa · 0 % · 0 m · standard`; a tap opens the sheet that
 * edits it. The source named last is the weakest one in use.
 */
export function StationLine({ now }: { now: number }) {
  const { t, display } = useSettings()
  const [station] = useStation()
  const [open, setOpen] = useState(false)
  const [pUnit, setPUnit] = useState<PressureUnit>('hPa')
  const btn = useRef<HTMLButtonElement>(null)
  const lang = display.lang
  const imperial = display.system === 'imperial'

  const temp = `${dec(imperial ? cToF(station.tempC.value) : station.tempC.value, 0, lang)}${NBSP}${imperial ? '°F' : '°C'}`
  const p = dec(shownHPa(station) / PRESSURE_TO_HPA[pUnit], LINE_DIGITS[pUnit], lang)
  const pressure = `${station.pressureKind === 'qnh' ? `${t('st.kind.qnh')} ` : ''}${p}${NBSP}${pUnit}`
  const humidity = `${rounded(station.humidityPct.value, 0)}${NBSP}%`
  const altitude = imperial
    ? `${rounded(station.altitudeM.value / FT_M, 0)}${NBSP}ft`
    : `${rounded(station.altitudeM.value, 0)}${NBSP}m`
  // The forecast behind 'model' fields: its time, then how old it is once it ages, or that it has gone stale.
  const weakest = weakestSource(station)
  const fresh = modelFreshness(station, now)
  const clock = station.model ? clockOf(station.model.time) : null
  const tail: string[] = []
  if (fresh) {
    tail.push(clock ? t('st.line.model', { time: clock }) : t('st.src.model'))
    if (fresh === 'aging' && station.model) {
      const age = ageOf(station.model.fetchedAt, now)
      tail.push(t(age.key, { n: age.n }))
    } else if (fresh === 'stale') tail.push(t('st.line.stale'))
  }
  if (!(fresh && weakest === 'model')) tail.push(t(`st.src.${weakest}`))
  const line = [temp, pressure, humidity, altitude, ...tail].join(' · ')

  return (
    <div className="real-station">
      <button ref={btn} type="button" className={weatherUnset(station) ? 'real-station-btn num glow-want' : 'real-station-btn num'} aria-haspopup="dialog" aria-expanded={open}
        aria-label={t('st.line', { line })} onClick={() => setOpen((o) => !o)}>
        {line}
      </button>
      <StationSheet now={now} open={open} onClose={() => setOpen(false)} anchorRef={btn} pUnit={pUnit} setPUnit={setPUnit} />
    </div>
  )
}

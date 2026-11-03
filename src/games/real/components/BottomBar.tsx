import { useId, useRef, useState } from 'react'
import { Popover } from '../../../components/Popover'
import { WindClock } from '../../../components/WindClock'
import { SPEED_TO_MS, type UnitSystem } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import type { WindUnit } from '../profile'
import type { RealSetup } from '../setup'
import { useStation } from '../station'
import { DirectionField, DistanceTool, ForecastLine, ReadingHint, SlopeTool, WindSigmaTool, WindSpeedTool } from './controls'
import { Dock } from './Dock'
import { clockCardinals, rounded, windText } from './realText'

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
 * The inputs that change at the range, as two labelled groups on one row: the shot (distance, slope, direction) and the wind
 * (speed with where it blows from, uncertainty, the forecast offer). Under 1366px they wrap. On a phone it is the dock (`Dock`).
 */
export function BottomBar({ setup, update, system, windUnit, phone, now }: {
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  system: UnitSystem
  windUnit: WindUnit
  phone: boolean
  now: number
}) {
  const { t } = useSettings()
  const [station] = useStation()
  const directionRef = useRef<HTMLInputElement>(null)
  const [clockOpen, setClockOpen] = useState(false)
  const clockRef = useRef<HTMLButtonElement>(null)

  const from = t('real.windFrom', { h: setup.windClock })
  const shotId = `${useId()}-shot`
  const windId = `${useId()}-wind`
  const needDirection = () => directionRef.current?.focus()

  if (phone) return <Dock setup={setup} update={update} system={system} windUnit={windUnit} now={now} />
  return (
    <div className="real-bar" data-testid="real-bar">
      <div role="group" aria-labelledby={shotId} className="real-group">
        <div className="real-group-head"><span id={shotId} className="label">{t('dock.shot')}</span></div>
        <div className="real-group-items">
          <DistanceTool setup={setup} update={update} system={system} wheel />
          <SlopeTool setup={setup} update={update} hint="title" />
          <div className="real-tool real-dir"><DirectionField compass={false} inputRef={directionRef} /></div>
        </div>
      </div>
      <div className="real-bar-rule" aria-hidden="true" />
      <div role="group" aria-labelledby={windId} className="real-group real-group-wind">
        <div className="real-group-head">
          <span id={windId} className="label">{t('real.wind')}</span>
          <ReadingHint />
          <ForecastLine update={update} now={now} onNeedDirection={needDirection} />
        </div>
        <div className="real-group-items">
          <div className="real-tool real-wind">
            <WindSpeedTool setup={setup} update={update} windUnit={windUnit} />
            <button ref={clockRef} type="button" className="real-clock-btn" aria-haspopup="dialog" aria-expanded={clockOpen}
              aria-label={`${t('real.windDir')}: ${from}`} onClick={() => setClockOpen((o) => !o)}>
              <MiniClock hour={setup.windClock} />
              <span className="num">{from}</span>
            </button>
            <Popover open={clockOpen} onClose={() => setClockOpen(false)} anchorRef={clockRef} label={t('real.windDir')} placement="above" className="real-clock-menu">
              <WindClock label={t('real.windBlows')} value={setup.windClock} onChange={(h) => update({ windClock: h })}
                speedMs={rounded(setup.windMs / SPEED_TO_MS[windUnit], 1)} unit={windUnit}
                cardinals={clockCardinals(station.azimuthDeg?.value, t('real.cardinals'))}
                valueText={t('real.clockValue', { h: setup.windClock, s: windText(setup.windMs, windUnit) })} />
            </Popover>
          </div>
          <div className="real-tool"><WindSigmaTool /></div>
        </div>
      </div>
    </div>
  )
}

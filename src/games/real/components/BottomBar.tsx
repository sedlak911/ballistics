import { useId, useRef, useState } from 'react'
import { Popover } from '../../../components/Popover'
import { WindClock } from '../../../components/WindClock'
import { SPEED_TO_MS, type UnitSystem } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import type { WindUnit } from '../profile'
import type { RealSetup } from '../setup'
import { forecastUseOffered } from '../forecastWind'
import { useStation } from '../station'
import { useWindFlash } from '../windFlash'
import { zoneWind, zonesActive } from '../zones'
import { DirectionField, DistanceTool, ForecastLine, ReadingHint, SlopeTool, WindSigmaTool, WindSpeedTool } from './controls'
import { Dock } from './Dock'
import { WindZones, ZoneButtons, ZoneReset, useZoneSelection, zoneClockPatch } from './WindZones'
import { WindHelpSheet } from './WindHelpSheet'
import { WindTurnedStatus } from './WindTurnedStatus'
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
export function BottomBar({ setup, update, system, windUnit, phone, now, weights = null }: {
  setup: RealSetup
  update: (patch: Partial<RealSetup>) => void
  system: UnitSystem
  windUnit: WindUnit
  phone: boolean
  now: number
  /** Each shown zone's share of the drift, near to far (the solution's `zoneWeights`). */
  weights?: number[] | null
}) {
  const { t } = useSettings()
  const [station] = useStation()
  const directionRef = useRef<HTMLInputElement>(null)
  const [clockOpen, setClockOpen] = useState(false)
  const clockRef = useRef<HTMLButtonElement>(null)
  // The sheet on how to read the wind, for the dock's ? and the desktop one; the focus goes back to the ? that opened it.
  const [helpOpen, setHelpOpen] = useState(false)
  const helpFrom = useRef<HTMLElement | null>(null)
  const onHelp = (from: HTMLElement) => {
    helpFrom.current = from
    setHelpOpen(true)
  }
  const closeHelp = () => {
    // That ? can be gone by now (the phone turned and the dock became the bar): the ? on screen takes the focus.
    if (helpFrom.current?.isConnected === false) document.querySelector<HTMLElement>('[data-wind-help]')?.focus()
    setHelpOpen(false)
  }
  const helpSheet = helpOpen && <WindHelpSheet onClose={closeHelp} returnFocus={helpFrom} />

  const flash = useWindFlash()
  const [zone, setZone] = useZoneSelection(setup)
  const zones = zonesActive(setup)
  const zw = zoneWind(setup, zone)
  const from = t('real.windFrom', { h: zw.clock })
  const shotId = `${useId()}-shot`
  const windId = `${useId()}-wind`
  const windGlow = !setup.windSet
  const offered = forecastUseOffered(station, now, windUnit)
  const needDirection = () => directionRef.current?.focus()

  if (phone) {
    return (
      <>
        <Dock setup={setup} update={update} system={system} windUnit={windUnit} now={now} weights={weights} onHelp={onHelp} />
        {helpSheet}
      </>
    )
  }
  return (
    <div className="real-bar" data-testid="real-bar">
      <WindTurnedStatus />
      <div role="group" aria-labelledby={shotId} className="real-group">
        <div className="real-group-head"><span id={shotId} className="label">{t('dock.shot')}</span></div>
        <div className="real-group-items">
          <DistanceTool setup={setup} update={update} system={system} wheel />
          <SlopeTool setup={setup} update={update} hint="title" />
          <div className="real-tool real-dir"><DirectionField setup={setup} update={update} inputRef={directionRef} glow={station.azimuthDeg === null} /></div>
        </div>
      </div>
      <div className="real-bar-rule" aria-hidden="true" />
      <div role="group" aria-labelledby={windId} className="real-group real-group-wind">
        <div className="real-group-head">
          <span id={windId} className="label">{zones ? t('zones.title') : t('real.wind')}</span>
          <ZoneButtons setup={setup} update={update} onHelp={onHelp} />
          {!zones && <ReadingHint />}
          <ForecastLine glow={windGlow} setup={setup} update={update} now={now} onNeedDirection={needDirection} />
        </div>
        {zones && <WindZones setup={setup} system={system} windUnit={windUnit} weights={weights} selected={zone} onSelect={setZone} />}
        <div className="real-group-items">
          <div className="real-tool real-wind">
            <WindSpeedTool setup={setup} update={update} windUnit={windUnit} zone={zones ? zone : undefined} glow={windGlow && !offered} />
            <button ref={clockRef} type="button" className="real-clock-btn" aria-haspopup="dialog" aria-expanded={clockOpen}
              aria-label={`${t('real.windDir')}: ${from}`} onClick={() => setClockOpen((o) => !o)}>
              <MiniClock hour={zw.clock} />
              <span key={flash?.key} className={flash?.hour === zw.clock && zone === 'near' ? 'num real-hour-flash' : 'num'}>{from}</span>
            </button>
            <Popover open={clockOpen} onClose={() => setClockOpen(false)} anchorRef={clockRef} label={t('real.windDir')} placement="above" className="real-clock-menu">
              <WindClock label={t('real.windBlows')} value={zw.clock} onChange={(h) => update(zoneClockPatch(setup, zones ? zone : null, h))}
                speedMs={rounded(zw.ms / SPEED_TO_MS[windUnit], 1)} unit={windUnit}
                cardinals={clockCardinals(station.azimuthDeg?.value, t('real.cardinals'))}
                valueText={t('real.clockValue', { h: zw.clock, s: windText(zw.ms, windUnit) })} />
            </Popover>
          </div>
          <div className="real-tool"><WindSigmaTool /></div>
          {zones && <ZoneReset setup={setup} update={update} zone={zone} />}
        </div>
      </div>
      {helpSheet}
    </div>
  )
}

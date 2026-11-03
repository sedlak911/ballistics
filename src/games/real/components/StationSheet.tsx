import { useState, type RefObject } from 'react'
import { NumberField } from '../../../components/NumberField'
import { Popover } from '../../../components/Popover'
import { Segmented } from '../../../components/Segmented'
import { Switch } from '../../../components/Switch'
import { cToF, fToC, PRESSURE_TO_HPA } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import { useRealProfile } from '../profile'
import {
  applyWeather, HEIGHT_ABOVE_GROUND, resetWeather, STANDARD_STATION, updateStation, useStation, withAltitude, withPressureKind, type Field, type Station,
  type WeatherField,
} from '../station'
import { locationPermission, weatherByLocation, type WeatherError } from '../weather'
import { ageOf, clockOf, FT_M, PRESSURE_DIGITS, shownHPa, weatherInUse, type PressureUnit } from './stationText'
import './menus.css'
import './station.css'

// What each field accepts, in the stored units (the same bounds station.ts clamps to).
const TEMP_C = { min: -60, max: 60 }
const PRESSURE_HPA = { min: 500, max: 1100 }
const HUMIDITY = { min: 0, max: 100 }
const ALTITUDE_M = { min: -500, max: 9000 }
const LATITUDE = { min: -90, max: 90 }
const POWDER_C = { min: -60, max: 80 }
const PRESSURE_UNITS = Object.keys(PRESSURE_TO_HPA) as PressureUnit[]

const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
const ceilTo = (v: number, d: number) => Math.ceil(v * 10 ** d - 1e-9) / 10 ** d
const floorTo = (v: number, d: number) => Math.floor(v * 10 ** d + 1e-9) / 10 ** d
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** A stored quantity in a display unit: `to` shows it (rounded for reading), `from` stores a typed value clamped to the bounds. */
function conv(toDisp: (stored: number) => number, fromDisp: (shown: number) => number, digits: number, range: { min: number; max: number }) {
  const a = roundTo(toDisp(range.min), digits)
  const b = roundTo(toDisp(range.max), digits)
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return {
    show: (stored: number) => roundTo(toDisp(stored), digits),
    store: (shown: number) => clamp(roundTo(fromDisp(shown), 2), range.min, range.max),
    min: ceilTo(lo, digits) > hi ? lo : ceilTo(lo, digits),
    max: floorTo(hi, digits) < lo ? hi : floorTo(hi, digits),
  }
}

function Source({ field, empty, t }: { field: Field<number> | null; empty: string; t: ReturnType<typeof useSettings>['t'] }) {
  if (!field) return <span className="rm-src"><span className="tag muted">{empty}</span></span>
  return (
    <span className="rm-src">
      <span className={field.source === 'manual' ? 'tag acc' : 'tag muted'}>{t(`st.src.${field.source}`)}</span>
    </span>
  )
}

/**
 * The atmosphere by hand: temperature, pressure (station or QNH), humidity, altitude, height above ground, latitude and
 * powder temperature, each with where it comes from. Editing a field makes it manual; Standard atmosphere resets them all.
 * Powder temperature can be emptied (the air's); every other field keeps its last good value.
 */
export function StationSheet({ now, open, onClose, anchorRef, pUnit, setPUnit }: {
  /** The page's clock, for the age of the weather. */
  now: number
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  pUnit: PressureUnit
  setPUnit: (u: PressureUnit) => void
}) {
  const { t, display } = useSettings()
  const [s, set] = useStation()
  const [profile, setProfile] = useRealProfile()
  const imperial = display.system === 'imperial'

  // By location. 'denied' lives here, in this page view only: a later tap reads the permission state without asking, and
  // shows the text again unless location has been allowed since (or the denial was a dismissed prompt).
  const [stage, setStage] = useState<'idle' | 'note' | 'locating' | 'loading'>('idle')
  const [failure, setFailure] = useState<WeatherError | null>(null)
  const [fallbackAt, setFallbackAt] = useState<number | null>(null)
  const [approx, setApprox] = useState(false)
  const [denied, setDenied] = useState(false)
  // The values the last forecast lacked (I1), named while they are still standard.
  const [dropped, setDropped] = useState<WeatherField[]>([])
  const busy = stage === 'locating' || stage === 'loading'

  const apply = (r: Parameters<typeof applyWeather>[1]) => {
    let lacked: WeatherField[] = []
    updateStation((cur) => {
      const a = applyWeather(cur, r)
      lacked = a.dropped
      return a.patch
    })
    setDropped(lacked)
  }

  const locate = async () => {
    setFailure(null)
    setFallbackAt(null)
    setDropped([])
    setStage('locating')
    // A typed altitude is the forecast's elevation: the model weather is then for the height in the sheet (C1).
    const elevationM = s.altitudeM.source === 'manual' ? s.altitudeM.value : undefined
    const r = await weatherByLocation(Date.now(), { elevationM, onStage: () => setStage('loading') })
    setStage('idle')
    if (r.ok) {
      apply(r)
      setApprox(r.accuracyM > 1000)
      return
    }
    setFailure(r.error)
    if (r.error === 'denied') setDenied(true)
    if (r.error === 'offline' || r.error === 'service') {
      setApprox(false)
      if (r.cached) {
        // The last weather of this cell, under 3 h old, with its age shown.
        const c = r.cached
        apply({ cell: c.cell, elevationM: c.elevationM, weather: c })
        setFallbackAt(c.fetchedAt)
      } else {
        // No weather to fall back on: the model weather goes back to standard, so the text saying so is true.
        updateStation(resetWeather)
      }
    }
  }
  const tapLocation = async () => {
    if (denied) {
      const state = await locationPermission()
      if (state !== 'granted' && state !== 'prompt') {
        setFailure('denied')
        return
      }
      setDenied(false)
    }
    if (!profile.locationNoteSeen) setStage('note')
    else void locate()
  }
  const confirmNote = () => {
    setProfile({ locationNoteSeen: true })
    void locate()
  }

  const modelShown = weatherInUse(s) || s.altitudeM.source === 'model'
  const lackedNames = dropped.filter((k) => s[k].source === 'standard').map((k) => t(`st.loc.no.${k}`))
  const droppedText = lackedNames.length === 0 ? null : lackedNames.length === 1
    ? t('st.loc.dropped.one', { what: lackedNames[0]! })
    : t('st.loc.dropped.many', { what: t('st.loc.no.join', { list: lackedNames.slice(0, -1).join(', '), last: lackedNames.at(-1)! }) })
  const clock = s.model ? clockOf(s.model.time) : null

  const manual = (v: number): Field<number> => ({ value: v, source: 'manual' })
  const range = (min: number, max: number) => t('rm.range', { min, max })

  const temp = imperial
    ? conv(cToF, fToC, 1, TEMP_C)
    : conv((c) => c, (c) => c, 1, TEMP_C)
  const powder = imperial ? conv(cToF, fToC, 1, POWDER_C) : conv((c) => c, (c) => c, 1, POWDER_C)
  const factor = PRESSURE_TO_HPA[pUnit]
  const press = conv((hpa) => hpa / factor, (v) => v * factor, PRESSURE_DIGITS[pUnit], PRESSURE_HPA)
  const alt = imperial ? conv((m) => m / FT_M, (ft) => ft * FT_M, 0, ALTITUDE_M) : conv((m) => m, (m) => m, 0, ALTITUDE_M)
  const height = imperial ? conv((m) => m / FT_M, (ft) => ft * FT_M, 0, HEIGHT_ABOVE_GROUND) : conv((m) => m, (m) => m, 0, HEIGHT_ABOVE_GROUND)
  const tempUnit = imperial ? '°F' : '°C'
  const altUnit = imperial ? 'ft' : 'm'

  // Both convert in station.ts: a model pressure through the altitude on a change of kind, and the model weather with
  // the altitude on an altitude edit (C1), so the air is the same in either order.
  const setKind = (kind: Station['pressureKind']) => updateStation((cur) => withPressureKind(cur, kind))
  const setAltitude = (m: number) => updateStation((cur) => withAltitude(cur, manual(m)))

  const resetAll = () => {
    // Only the air resets: the shooting direction and the height above ground are set in the shot and wind panels.
    set({ ...STANDARD_STATION, azimuthDeg: s.azimuthDeg, heightAboveGroundM: s.heightAboveGroundM })
    setFailure(null)
    setFallbackAt(null)
    setApprox(false)
    setDropped([])
  }

  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} label={t('st.sheet')} className="rm-menu st-sheet">
      <div className="st-head">
        <h2>{t('st.sheet')}</h2>
        <button type="button" className="btn ghost" onClick={resetAll}>{t('st.standard')}</button>
      </div>
      <div className="st-slot" data-slot="by-location">
        {stage === 'note' ? (
          <div className="st-note">
            <p className="rm-msg">{t('st.loc.note')}</p>
            <div className="st-actions">
              <button type="button" className="btn primary" onClick={confirmNote}>{t('st.loc.continue')}</button>
              <button type="button" className="btn ghost" onClick={() => setStage('idle')}>{t('st.loc.cancel')}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn ghost st-loc" disabled={busy} onClick={() => void tapLocation()}>
            {stage === 'locating' ? t('st.loc.locating') : stage === 'loading' ? t('st.loc.loading')
              : s.model || weatherInUse(s) ? t('st.loc.refresh') : t('st.loc.button')}
          </button>
        )}
        {profile.locationNoteSeen && stage !== 'note' && (
          <div className="st-auto">
            <span className="label">{t('st.loc.auto')}</span>
            <Switch on={profile.weatherAutoRefresh} label={t('st.loc.auto')} onChange={(on) => setProfile({ weatherAutoRefresh: on })} />
          </div>
        )}
        {(failure || droppedText) && stage !== 'note' && (
          <div className="st-status" role="status">
            {failure && <p className="rm-msg">{t(`st.loc.err.${failure === 'timeout' ? 'unavailable' : failure}`)}</p>}
            {(failure === 'unavailable' || failure === 'timeout') && !busy && (
              <button type="button" className="btn ghost" onClick={() => void tapLocation()}>{t('st.loc.retry')}</button>
            )}
            {(failure === 'service' || failure === 'offline') && fallbackAt === null && <p className="rm-msg">{t('st.loc.err.serviceStd')}</p>}
            {fallbackAt !== null && (
              <p className="rm-msg">{t('st.loc.cacheUsed', { age: t(ageOf(fallbackAt, now).key, { n: ageOf(fallbackAt, now).n }) })}</p>
            )}
            {droppedText && <p className="rm-msg">{droppedText}</p>}
          </div>
        )}
      </div>

      <div className="rm-grid">
        <div className="rm-field rm-wide">
          <div className="st-kind">
            <span className="label">{t('st.kind')}</span>
            <Segmented label={t('st.kind')} value={s.pressureKind} onChange={setKind}
              options={[{ value: 'station', label: t('st.kind.station') }, { value: 'qnh', label: t('st.kind.qnh') }]} />
          </div>
          <NumberField commitSame label={t('st.pressure')} value={press.show(shownHPa(s))} unit={pUnit} units={PRESSURE_UNITS}
            onUnit={(u) => setPUnit(u as PressureUnit)} min={press.min} max={press.max} step={pUnit === 'hPa' ? 1 : pUnit === 'mmHg' ? 1 : 0.1}
            invalidText={range(press.min, press.max)} onChange={(v) => set({ pressureHPa: manual(press.store(v)) })} />
          <span className="rm-note">{t('st.pressureNote')}</span>
          <Source field={s.pressureHPa} empty="" t={t} />
        </div>

        <div className="rm-field">
          <NumberField commitSame label={t('st.temp')} value={temp.show(s.tempC.value)} unit={tempUnit} min={temp.min} max={temp.max} step={1}
            invalidText={range(temp.min, temp.max)} onChange={(v) => set({ tempC: manual(temp.store(v)) })} />
          <Source field={s.tempC} empty="" t={t} />
        </div>
        <div className="rm-field">
          <NumberField commitSame label={t('st.humidity')} value={s.humidityPct.value} unit="%" min={HUMIDITY.min} max={HUMIDITY.max} step={5}
            invalidText={range(HUMIDITY.min, HUMIDITY.max)} onChange={(v) => set({ humidityPct: manual(v) })} />
          <Source field={s.humidityPct} empty="" t={t} />
        </div>
        <div className="rm-field">
          <NumberField commitSame label={t('st.altitude')} value={alt.show(s.altitudeM.value)} unit={altUnit} min={alt.min} max={alt.max} step={imperial ? 100 : 50}
            invalidText={range(alt.min, alt.max)} onChange={(v) => setAltitude(alt.store(v))} />
          <Source field={s.altitudeM} empty="" t={t} />
          {approx && s.altitudeM.source === 'model' && <span className="rm-note">{t('st.loc.approx')}</span>}
        </div>
        <div className="rm-field">
          <NumberField commitSame label={t('st.height')} value={height.show(s.heightAboveGroundM.value)} unit={altUnit} min={height.min} max={height.max} step={1}
            invalidText={range(height.min, height.max)} onChange={(v) => set({ heightAboveGroundM: manual(height.store(v)) })} />
          <span className="rm-note">{t('st.heightNote')}</span>
          <Source field={s.heightAboveGroundM} empty="" t={t} />
        </div>
        <div className="rm-field">
          <NumberField commitSame label={t('st.latitude')} value={s.latitudeDeg.value} unit="°" min={LATITUDE.min} max={LATITUDE.max} step={1}
            invalidText={range(LATITUDE.min, LATITUDE.max)} onChange={(v) => set({ latitudeDeg: manual(v) })} />
          <Source field={s.latitudeDeg} empty="" t={t} />
        </div>
        {modelShown && (
          <div className="rm-field rm-wide st-attr rm-note">
            <p>
              {t('st.loc.attrBy')} <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>
              {' · '}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
              {clock && ` · ${t('st.line.model', { time: clock })}`}
            </p>
            {s.altitudeM.source === 'model' && <p>{t('st.loc.elevation')}</p>}
            <p>{t('st.loc.modelNote')}</p>
          </div>
        )}

        <div className="rm-field">
          <NumberField commitSame label={t('st.powder')} value={s.powderTempC ? powder.show(s.powderTempC.value) : null} unit={tempUnit}
            min={powder.min} max={powder.max} step={1} placeholder={t('st.airs')} invalidText={range(powder.min, powder.max)}
            onChange={(v) => set({ powderTempC: manual(powder.store(v)) })} onClear={() => set({ powderTempC: null })} />
          <span className="rm-note">{t('st.powderNote')}</span>
          <Source field={s.powderTempC} empty={t('st.airs')} t={t} />
        </div>
      </div>
    </Popover>
  )
}

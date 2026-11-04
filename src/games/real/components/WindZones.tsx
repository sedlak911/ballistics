import { useState } from 'react'
import type { UnitSystem } from '../../../engine/units'
import { useSettings } from '../../../settings/SettingsContext'
import type { TKey } from '../../../i18n'
import { SPEED_TO_MS } from '../../../engine/units'
import type { WindUnit } from '../profile'
import type { RealSetup } from '../setup'
import { setZoneWind, shownZones, zoneRanges, zoneSameAsNear, zoneWind, zonesActive, type ZoneName } from '../zones'
import { HelpIcon, ZonesIcon } from './icons'
import { NBSP, rounded, windText } from './realText'

type Update = (patch: Partial<RealSetup>) => void
const M_PER_YD = 0.9144

/**
 * Which zone the wind editor works on: the near zone until a cell is tapped, and again when the zone shown goes (the
 * distance crossed a threshold) or the zones are off. Returns the zone to edit and the setter.
 */
// eslint-disable-next-line react/only-export-components -- a hook that goes with the strip
export function useZoneSelection(setup: RealSetup): [ZoneName, (z: ZoneName) => void] {
  const [zone, setZone] = useState<ZoneName>('near')
  // Handed back to Blízko at once, so a zone that comes back with the distance doesn't come back selected.
  if (zone !== 'near' && (!zonesActive(setup) || !shownZones(setup.distanceM).includes(zone))) setZone('near')
  return [zonesActive(setup) ? zone : 'near', setZone]
}

/** What an edit of the clock changes: the selected zone's hour, or with `zone` null the one wind's. */
// eslint-disable-next-line react/only-export-components -- a pure helper that goes with the strip
export function zoneClockPatch(setup: RealSetup, zone: ZoneName | null, clock: number): Partial<RealSetup> {
  return zone === null ? { windClock: clock } : setZoneWind(setup, zone, { clock })
}

/** The `?` (how to read the wind) and, while the distance has zones, the zones icon that turns them on and off. */
export function ZoneButtons({ setup, update, onHelp }: { setup: RealSetup; update: Update; onHelp?: (from: HTMLElement) => void }) {
  const { t } = useSettings()
  return (
    <>
      <button type="button" className="icon-btn" aria-label={t('zones.help')} title={t('zones.help')} data-wind-help
        onClick={(e) => onHelp?.(e.currentTarget)}><HelpIcon /></button>
      {shownZones(setup.distanceM).length > 0 && (
        <button type="button" className="icon-btn" aria-label={t('zones.toggle')} title={t('zones.toggle')} aria-pressed={setup.zonesOn}
          onClick={() => update({ zonesOn: !setup.zonesOn })}>
          <ZonesIcon />
        </button>
      )}
    </>
  )
}

/** `Jako blízko` under the editor of a mid or far zone that has a wind of its own: it follows the near wind again. */
export function ZoneReset({ setup, update, zone }: { setup: RealSetup; update: Update; zone: ZoneName }) {
  const { t } = useSettings()
  if (zone === 'near' || !zoneWind(setup, zone).own) return null
  return <button type="button" className="real-zone-reset" onClick={() => update(zoneSameAsNear(zone))}>{t('zones.reset')}</button>
}

/**
 * The strip of the shot's stretches, near to far: one cell each with its name, its weight in the drift, its wind (or that it
 * follows the near one) and its range. A tap selects the zone that the clock and the speed under the strip edit.
 */
export function WindZones({ setup, system, windUnit, weights, selected, onSelect }: {
  setup: RealSetup
  system: UnitSystem
  windUnit: WindUnit
  weights: number[] | null
  selected: ZoneName
  onSelect: (z: ZoneName) => void
}) {
  const { t } = useSettings()
  const yards = system === 'imperial'
  const unit = yards ? 'yd' : 'm'
  // Yards come from the unrounded fractions of the distance, rounded once to 10 yd.
  const ranges = yards
    ? zoneRanges(setup.distanceM).map((r, i, all) => {
      const yd = setup.distanceM / M_PER_YD
      const edge = (k: number) => Math.round((yd * k) / all.length / 10) * 10
      return { name: r.name, from: edge(i), to: edge(i + 1) }
    })
    : zoneRanges(setup.distanceM).map((r) => ({ name: r.name, from: Math.round(r.fromM / 10) * 10, to: Math.round(r.toM / 10) * 10 }))
  return (
    <div className="real-zones" role="group" aria-label={t('zones.title')}>
      {ranges.map((r, i) => {
        const w = zoneWind(setup, r.name)
        const weight = weights?.[i]
        const name = t(`zones.${r.name}` as TKey)
        const weightText = weight === undefined ? '' : t('zones.weight', { n: weight })
        const range = `${r.from}–${r.to}${NBSP}${unit}`
        // The unit is left off the cell (it would clip the hour); it stays in the stepper under the strip.
        const short = t('dock.windValue', { s: `${rounded(w.ms / SPEED_TO_MS[windUnit], 1)}`, h: w.clock })
        const full = t('dock.windValue', { s: windText(w.ms, windUnit), h: w.clock })
        return (
          <button key={r.name} type="button" className="real-zone" aria-pressed={selected === r.name} onClick={() => onSelect(r.name)}
            aria-label={[name, weightText, w.own ? full : t('zones.same'), range].filter(Boolean).join(', ')}>
            <span className="real-zone-top">
              <span className="label">{name}</span>
              {weight !== undefined && <span className="real-zone-weight">{weightText}</span>}
            </span>
            {w.own
              ? <span className="real-zone-wind num">{short}</span>
              : <span className="real-zone-wind real-zone-same">{t('zones.same')}</span>}
            <span className="real-zone-range">{range}</span>
          </button>
        )
      })}
    </div>
  )
}

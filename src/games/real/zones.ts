import { windFromClock } from '../../engine/flight'
import type { RealSetup, ZoneWind } from './setup'

export type ZoneName = 'near' | 'mid' | 'far'
/** From this distance the wind can change along the way: two zones. */
export const ZONES_FROM_M = 300
/** From this distance there are three. */
export const THREE_FROM_M = 600

/** The zones the distance has, near to far; none under 300 m. */
export function shownZones(distanceM: number): ZoneName[] {
  if (distanceM >= THREE_FROM_M) return ['near', 'mid', 'far']
  if (distanceM >= ZONES_FROM_M) return ['near', 'far']
  return []
}

/** Zones are on and the distance has some; the mid and far winds stay stored under 300 m but count for nothing. */
export const zonesActive = (s: RealSetup): boolean => s.zonesOn && shownZones(s.distanceM).length > 0

/** Halves or thirds of the distance along the slant range, each end rounded to 10 m. */
export function zoneRanges(distanceM: number): { name: ZoneName; fromM: number; toM: number }[] {
  const names = shownZones(distanceM)
  const edge = (i: number) => (i === names.length ? distanceM : Math.round((distanceM * i) / names.length / 10) * 10)
  return names.map((name, i) => ({ name, fromM: edge(i), toM: edge(i + 1) }))
}

/** A zone's wind; a mid or far zone without its own follows the near one (`own: false`). */
export function zoneWind(s: RealSetup, z: ZoneName): ZoneWind & { own: boolean } {
  if (z === 'near') return { ms: s.windMs, clock: s.windClock, own: true }
  const w = z === 'mid' ? s.windMid : s.windFar
  return w === null ? { ms: s.windMs, clock: s.windClock, own: false } : { ...w, own: true }
}

/** The setup fields an edit of one zone's wind changes; the first edit of a mid or far zone copies the near wind's other value. */
export function setZoneWind(s: RealSetup, z: ZoneName, patch: Partial<ZoneWind>): Partial<RealSetup> {
  if (z === 'near') return { windMs: patch.ms ?? s.windMs, windClock: patch.clock ?? s.windClock, windSet: true }
  const { ms, clock } = zoneWind(s, z)
  const w = { ms: patch.ms ?? ms, clock: patch.clock ?? clock }
  return { [z === 'mid' ? 'windMid' : 'windFar']: w, windSet: true }
}

/** A mid or far zone back to following the near wind. */
export const zoneSameAsNear = (z: 'mid' | 'far'): Partial<RealSetup> => (z === 'mid' ? { windMid: null } : { windFar: null })

/**
 * A wind by horizontal distance from the muzzle, taking each zone's wind from `wind`; the zones' ends are the slant
 * range's, mapped to horizontal metres by cos θ. For the flight, so only meaningful while the zones are active.
 */
export function windAtBy(s: RealSetup, wind: (z: ZoneName) => { x: number; z: number }): (xM: number) => { x: number; z: number } {
  const cos = Math.cos((s.slopeDeg * Math.PI) / 180)
  const zones = zoneRanges(s.distanceM).map((r) => ({ toX: r.toM * cos, wind: wind(r.name) }))
  if (zones.length === 0) return () => ({ x: 0, z: 0 })
  return (xM) => (zones.find((r) => xM < r.toX) ?? zones[zones.length - 1]).wind
}

/** The wind by horizontal distance from the muzzle, for the flight; undefined with one wind (the solver then uses the setup's). */
export function windAtFor(s: RealSetup): ((xM: number) => { x: number; z: number }) | undefined {
  if (!zonesActive(s)) return undefined
  return windAtBy(s, (z) => {
    const w = zoneWind(s, z)
    return windFromClock(w.ms, w.clock)
  })
}

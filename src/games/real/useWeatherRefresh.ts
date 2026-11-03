import { useEffect, useRef } from 'react'
import { useRealProfile } from './profile'
import { applyWeather, updateStation, useStation, type Station } from './station'
import { freshness, lastCell, locationPermission, REFRESH_MS, weatherByLocation, weatherForCell } from './weather'

/** One refresh at a time, across mounts. */
let inFlight = false

/** When the last attempt started, across mounts: a failing network is tried once per REFRESH_MS. */
let lastAttemptAt = 0
/** For tests: forget the last attempt. */
export function resetRefreshAttempt(): void { lastAttemptAt = 0 }

const CHECK_MS = 60_000

/**
 * The weather refreshes by itself once the person has accepted the location note, with the switch on, while the page is
 * visible and the station has model weather (after Standard atmosphere nothing refreshes until it is loaded by hand).
 * It is due REFRESH_MS after the later of the last fetch and the last attempt, checked at mount, every minute and when
 * the page becomes visible. With the location permission granted it asks for the position; otherwise it asks again for
 * the last cell, and only while that weather is under 3 h old, so an old one ages and shows its stale cue.
 * A failure changes nothing and says nothing. Hand-typed values stay (applyWeather).
 */
export function useWeatherRefresh(): void {
  const [profile] = useRealProfile()
  const [station] = useStation()
  const stationNow = useRef<Station>(station)
  useEffect(() => { stationNow.current = station })
  const enabled = profile.locationNoteSeen && profile.weatherAutoRefresh

  useEffect(() => {
    if (!enabled) return
    const refresh = async () => {
      if (inFlight || document.visibilityState !== 'visible') return
      const last = lastCell()
      const model = stationNow.current.model
      if (!last || !model) return
      const now = Date.now()
      if (now - Math.max(model.fetchedAt, lastAttemptAt) < REFRESH_MS) return
      inFlight = true
      lastAttemptAt = now
      try {
        const granted = (await locationPermission()) === 'granted'
        if (!granted && freshness(model.fetchedAt, now) === 'stale') return
        const alt = stationNow.current.altitudeM
        const typed = alt.source === 'manual' ? alt.value : undefined
        const r = granted
          ? await weatherByLocation(now, { elevationM: typed, maxCacheAgeMs: REFRESH_MS })
          : await weatherForCell(last.cell, now, { elevationM: typed ?? last.elevationM, maxCacheAgeMs: REFRESH_MS })
        if (r.ok) updateStation((cur) => applyWeather(cur, r).patch)
      } finally {
        inFlight = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), CHECK_MS)
    const onVisible = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
}

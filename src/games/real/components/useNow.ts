import { useEffect, useState } from 'react'

const readClock = () => Date.now()

/**
 * The clock, refreshed once a minute, and read again whenever `key` changes (the time of a fresh fetch), so a forecast
 * fetched since the last tick never reads as being in the future. It is also read again when the page becomes visible
 * (M7): a phone woken after hours shows the weather's real age on the first frame, not on the next tick.
 */
export function useNow(key: unknown, periodMs = 60_000): number {
  const [clock, setClock] = useState(() => ({ now: readClock(), key }))
  if (!Object.is(clock.key, key)) setClock({ now: readClock(), key })
  useEffect(() => {
    const tick = () => setClock((c) => ({ ...c, now: readClock() }))
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    const id = setInterval(tick, periodMs)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [periodMs])
  return clock.now
}

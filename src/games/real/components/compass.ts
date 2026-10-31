/** What the browser may give for a heading: iOS `webkitCompassHeading` after a permission, Android `deviceorientationabsolute`. */
type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }
type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> }

export const COMPASS_TIMEOUT_MS = 5000

export const hasCompass = () => typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined'

/**
 * One compass reading in whole degrees (0..359), or null if permission is refused or nothing arrives within 5 s.
 * It must be called from the tap itself: iOS asks for the permission only inside a user gesture. The listeners are
 * removed after the reading, after the timeout, or when `signal` aborts.
 */
export function readHeading(signal?: AbortSignal): Promise<number | null> {
  return new Promise((resolve) => {
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (deg: number | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      window.removeEventListener('deviceorientation', onEvent as EventListener)
      window.removeEventListener('deviceorientationabsolute', onEvent as EventListener)
      signal?.removeEventListener('abort', onAbort)
      resolve(deg)
    }
    const onAbort = () => finish(null)
    const onEvent = (e: OrientationEvent) => {
      let deg: number | null = null
      if (typeof e.webkitCompassHeading === 'number') deg = e.webkitCompassHeading
      else if (e.type === 'deviceorientationabsolute' && typeof e.alpha === 'number') deg = 360 - e.alpha
      if (deg === null || !Number.isFinite(deg)) return
      finish(((Math.round(deg) % 360) + 360) % 360)
    }
    const listen = () => {
      if (done) return
      window.addEventListener('deviceorientation', onEvent as EventListener)
      window.addEventListener('deviceorientationabsolute', onEvent as EventListener)
      timer = setTimeout(() => finish(null), COMPASS_TIMEOUT_MS)
    }
    signal?.addEventListener('abort', onAbort)
    const ask = (window.DeviceOrientationEvent as unknown as OrientationCtor).requestPermission
    if (typeof ask === 'function') {
      ask.call(window.DeviceOrientationEvent).then((r) => (r === 'granted' ? listen() : finish(null)), () => finish(null))
    } else {
      listen()
    }
  })
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { BOUNDS } from '../setup'
import { angularSpread, cameraReading, circularMean, topEdgeReading, type RawOrientation, type Reading } from './orientation'

export const AIM_WINDOW_MS = 1000
export const AIM_TIMEOUT_MS = 5000
export const MIN_SAMPLES = 5
export const STEADY_PITCH_DEG = 2
export const STEADY_HEADING_DEG = 5
/** While locked, the mean of this much of the newest readings is compared with the lock. */
export const UNLOCK_WINDOW_MS = 300
/** Raw samples older than this are dropped. */
const KEEP_MS = 1500

export type AimMode = 'simple' | 'camera'
export type AimState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'failed' }
  /** `tilted`: before the lock, the newest reading is past the slope range, so the phone isn't held the way the mode reads. */
  | { status: 'live'; reading: Reading | null; steady: number; locked: AimLock | null; tilted: boolean }
/** What the phone settled on: the mean of the steady second, rounded and clamped like the fields take it. */
export type AimLock = { headingDeg: number; slopeDeg: number }

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }
type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> }
interface Sample { t: number; o: RawOrientation }
interface Timed { t: number; r: Reading }

const EVENTS = ['deviceorientationabsolute', 'deviceorientation'] as const

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * The pitch rounds, as the Slope field takes it, past the field's range: no shot is that steep, so the phone is held another
 * way (up to read the screen, or flat in front of the camera). Such a reading never locks.
 */
const tiltedPast = (r: Reading) => {
  const p = Math.round(r.pitchDeg)
  return p < BOUNDS.slopeDeg.min || p > BOUNDS.slopeDeg.max
}

/** Both spreads of the readings are within their thresholds, and none is tilted past the slope range. */
function isSteady(rs: Reading[]): boolean {
  const pitches = rs.map((r) => r.pitchDeg)
  const p = mean(pitches)
  const headings = rs.map((r) => r.headingDeg)
  return (
    !rs.some(tiltedPast) &&
    Math.max(...pitches.map((x) => Math.abs(x - p))) <= STEADY_PITCH_DEG &&
    angularSpread(headings, circularMean(headings)) <= STEADY_HEADING_DEG
  )
}

/**
 * How much of the window the newest readings have stayed steady for (0..1), measured over everything kept (1.5 s) so it
 * reaches 1 at any sample rate: it is 1 once the steady stretch, from its oldest reading to the newest, lasts the whole window.
 */
function steadyShare(kept: Timed[]): number {
  let from = kept.length
  while (from > 0 && isSteady(kept.slice(from - 1).map((x) => x.r))) from--
  if (from === kept.length) return 0
  return Math.min(1, (kept[kept.length - 1].t - kept[from].t) / AIM_WINDOW_MS)
}

const roundLock = (heading: number, pitch: number): AimLock => ({
  headingDeg: Math.round(heading) % 360,
  // `+ 0` turns a rounded -0 into 0.
  slopeDeg: Math.max(BOUNDS.slopeDeg.min, Math.min(BOUNDS.slopeDeg.max, Math.round(pitch))) + 0,
})

/**
 * Reads the phone's orientation while aiming. `start()` must be called from the tap (iOS asks for the permission
 * only inside a gesture). Raw samples are kept for 1.5 s and turned into readings for the mode current at read time.
 */
export function useAiming(mode: AimMode): { state: AimState; start: () => void; take: () => AimLock | null; stop: () => void } {
  const [state, setState] = useState<AimState>({ status: 'idle' })
  const modeRef = useRef(mode)
  const statusRef = useRef<AimState['status']>('idle')
  const samples = useRef<Sample[]>([])
  // The lock, and the unrounded mean it was made from (what the unlock compares against).
  const lock = useRef<{ lock: AimLock; heading: number; pitch: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const session = useRef(0)
  const gotReading = useRef(false)
  const onEventRef = useRef<((e: Event) => void) | null>(null)

  // A mode change mid-aim (a camera that failed falls back to the top edge) gives the phone a fresh 5 s to read.
  useEffect(() => {
    if (modeRef.current === mode) return
    modeRef.current = mode
    // The lock, the samples kept so far (taken while the camera prompt was up) and the reading belong to the other mode: the
    // new hold needs a fresh steady second.
    lock.current = null
    samples.current = []
    setState((s) => (s.status === 'live' ? { ...s, reading: null, locked: null, steady: 0, tilted: false } : s))
    if (!onEventRef.current || gotReading.current) return
    const mine = session.current
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (session.current === mine && !gotReading.current) fail() }, AIM_TIMEOUT_MS)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `fail` is recreated every render and only reads refs and the stable setters
  }, [mode])

  const toReading = (o: RawOrientation) => (modeRef.current === 'camera' ? cameraReading(o) : topEdgeReading(o))

  /** The kept samples as readings in the current mode, up to `now`. */
  const kept = (now: number): Timed[] => {
    const out: Timed[] = []
    for (const s of samples.current) {
      if (s.t > now) continue
      const r = toReading(s.o)
      if (r) out.push({ t: s.t, r })
    }
    return out
  }

  const unlisten = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (onEventRef.current) {
      for (const n of EVENTS) window.removeEventListener(n, onEventRef.current)
      onEventRef.current = null
    }
  }, [])

  const setStatus = (s: AimState) => {
    statusRef.current = s.status
    setState(s)
  }

  const stop = useCallback(() => {
    session.current++
    unlisten()
    samples.current = []
    lock.current = null
    statusRef.current = 'idle'
    setState({ status: 'idle' })
  }, [unlisten])

  const fail = () => {
    session.current++
    unlisten()
    setStatus({ status: 'failed' })
  }

  const listen = () => {
    const mine = session.current
    gotReading.current = false
    const onEvent = (e: Event) => {
      if (session.current !== mine) return
      const ev = e as OrientationEvent
      const now = Date.now()
      const o: RawOrientation = {
        alpha: ev.alpha ?? null,
        beta: ev.beta ?? null,
        gamma: ev.gamma ?? null,
        absolute: ev.absolute === true || ev.type === 'deviceorientationabsolute',
        webkitCompassHeading: typeof ev.webkitCompassHeading === 'number' ? ev.webkitCompassHeading : undefined,
      }
      samples.current = [...samples.current.filter((s) => s.t >= now - KEEP_MS), { t: now, o }]
      const latest = toReading(o)
      if (latest && !gotReading.current) {
        gotReading.current = true
        clearTimeout(timer.current)
        timer.current = undefined
      }
      let win = kept(now)
      if (lock.current) {
        // The mean of the newest 300 ms against the lock: one trembling sample can't move it past the threshold.
        const recent = win.filter((x) => x.t >= now - UNLOCK_WINDOW_MS).map((x) => x.r)
        if (recent.length >= 3) {
          const pitch = mean(recent.map((r) => r.pitchDeg))
          const hs = recent.map((r) => r.headingDeg)
          if (Math.abs(pitch - lock.current.pitch) > STEADY_PITCH_DEG ||
              angularSpread([circularMean(hs)], lock.current.heading) > STEADY_HEADING_DEG) {
            lock.current = null
            // The old readings can't lock it again.
            samples.current = samples.current.filter((s) => s.t >= now - UNLOCK_WINDOW_MS)
            win = win.filter((x) => x.t >= now - UNLOCK_WINDOW_MS)
          }
        }
      }
      let steady = 0
      if (!lock.current) {
        const share = steadyShare(win)
        const last = win.filter((x) => x.t >= now - AIM_WINDOW_MS).map((x) => x.r)
        if (share >= 1 && last.length >= MIN_SAMPLES) {
          const heading = circularMean(last.map((r) => r.headingDeg))
          const pitch = mean(last.map((r) => r.pitchDeg))
          lock.current = { lock: roundLock(heading, pitch), heading, pitch }
        } else steady = Math.min(share, 0.99)
      }
      if (lock.current) steady = 1
      const reading = latest ?? win[win.length - 1]?.r ?? null
      setStatus({
        status: 'live',
        reading,
        steady,
        locked: lock.current ? lock.current.lock : null,
        tilted: !lock.current && reading !== null && tiltedPast(reading),
      })
    }
    onEventRef.current = onEvent
    for (const n of EVENTS) window.addEventListener(n, onEvent)
    timer.current = setTimeout(() => { if (session.current === mine && !gotReading.current) fail() }, AIM_TIMEOUT_MS)
    setStatus({ status: 'live', reading: null, steady: 0, locked: null, tilted: false })
  }

  const start = () => {
    unlisten()
    session.current++
    samples.current = []
    lock.current = null
    const mine = session.current
    const ask = typeof window.DeviceOrientationEvent === 'undefined'
      ? undefined
      : (window.DeviceOrientationEvent as unknown as OrientationCtor).requestPermission
    if (typeof ask === 'function') {
      // Called synchronously, before any await: iOS accepts the prompt only inside the tap.
      let asked: Promise<string>
      try {
        asked = ask.call(window.DeviceOrientationEvent)
      } catch {
        fail()
        return
      }
      setStatus({ status: 'asking' })
      asked.then(
        (r) => { if (session.current === mine) { if (r === 'granted') listen(); else fail() } },
        () => { if (session.current === mine) fail() },
      )
    } else {
      listen()
    }
  }

  /** The lock, or null before it. */
  const take = (): AimLock | null => (statusRef.current === 'live' && lock.current ? lock.current.lock : null)

  useEffect(() => () => {
    session.current++
    unlisten()
  }, [unlisten])

  return { state, start, take, stop }
}

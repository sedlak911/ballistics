import { useCallback, useEffect, useRef, useState } from 'react'
import { BOUNDS } from '../setup'
import { angularSpread, cameraReading, circularMean, topEdgeReading, type RawOrientation, type Reading } from './orientation'

export const AIM_WINDOW_MS = 1000
export const AIM_TIMEOUT_MS = 5000
export const MIN_SAMPLES = 5
export const STEADY_PITCH_DEG = 2
export const STEADY_HEADING_DEG = 5
/** Raw samples older than this are dropped. */
const KEEP_MS = 1500

export type AimMode = 'simple' | 'camera'
export type AimState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'failed' }
  | { status: 'live'; reading: Reading | null; steady: number }
export type AimResult = { headingDeg: number; slopeDeg: number } | 'moving'

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }
type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> }
interface Sample { t: number; o: RawOrientation }
interface Timed { t: number; r: Reading }

const EVENTS = ['deviceorientationabsolute', 'deviceorientation'] as const

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Both spreads of the readings are within their thresholds. */
function isSteady(rs: Reading[]): boolean {
  const pitches = rs.map((r) => r.pitchDeg)
  const p = mean(pitches)
  const headings = rs.map((r) => r.headingDeg)
  return (
    Math.max(...pitches.map((x) => Math.abs(x - p))) <= STEADY_PITCH_DEG &&
    angularSpread(headings, circularMean(headings)) <= STEADY_HEADING_DEG
  )
}

/** The share of the last window, counted back from the newest reading, that has stayed steady (0..1). */
function steadyShare(window: Timed[], now: number): number {
  let from = window.length
  while (from > 0 && isSteady(window.slice(from - 1).map((x) => x.r))) from--
  if (from === window.length) return 0
  return Math.min(1, (now - window[from].t) / AIM_WINDOW_MS)
}

/**
 * Reads the phone's orientation while aiming. `start()` must be called from the tap (iOS asks for the permission
 * only inside a gesture). Raw samples are kept for 1.5 s and turned into readings for the mode current at read time.
 */
export function useAiming(mode: AimMode): { state: AimState; start: () => void; take: () => AimResult | null; stop: () => void } {
  const [state, setState] = useState<AimState>({ status: 'idle' })
  const modeRef = useRef(mode)
  const statusRef = useRef<AimState['status']>('idle')
  const samples = useRef<Sample[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const session = useRef(0)
  const gotReading = useRef(false)
  const onEventRef = useRef<((e: Event) => void) | null>(null)

  // A mode change mid-aim (a camera that failed falls back to the top edge) gives the phone a fresh 5 s to read.
  useEffect(() => {
    if (modeRef.current === mode) return
    modeRef.current = mode
    if (!onEventRef.current || gotReading.current) return
    const mine = session.current
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (session.current === mine && !gotReading.current) fail() }, AIM_TIMEOUT_MS)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `fail` is recreated every render and only reads refs and the stable setters
  }, [mode])

  const toReading = (o: RawOrientation) => (modeRef.current === 'camera' ? cameraReading(o) : topEdgeReading(o))

  const window1s = (now: number): Timed[] => {
    const out: Timed[] = []
    for (const s of samples.current) {
      if (s.t < now - AIM_WINDOW_MS || s.t > now) continue
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
      const win = window1s(now)
      setStatus({ status: 'live', reading: latest ?? win[win.length - 1]?.r ?? null, steady: steadyShare(win, now) })
    }
    onEventRef.current = onEvent
    for (const n of EVENTS) window.addEventListener(n, onEvent)
    timer.current = setTimeout(() => { if (session.current === mine && !gotReading.current) fail() }, AIM_TIMEOUT_MS)
    setStatus({ status: 'live', reading: null, steady: 0 })
  }

  const start = () => {
    unlisten()
    session.current++
    samples.current = []
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

  const take = (): AimResult | null => {
    if (statusRef.current !== 'live') return null
    const win = window1s(Date.now()).map((x) => x.r)
    if (win.length < MIN_SAMPLES || !isSteady(win)) return 'moving'
    const headingDeg = Math.round(circularMean(win.map((r) => r.headingDeg))) % 360
    const slope = Math.round(mean(win.map((r) => r.pitchDeg)))
    // `+ 0` turns a rounded -0 into 0.
    return { headingDeg, slopeDeg: Math.max(BOUNDS.slopeDeg.min, Math.min(BOUNDS.slopeDeg.max, slope)) + 0 }
  }

  useEffect(() => () => {
    session.current++
    unlisten()
  }, [unlisten])

  return { state, start, take, stop }
}

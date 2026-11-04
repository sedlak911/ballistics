import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** The drag has to be this far sideways, and more sideways than up or down, before it moves the value. */
const LOCK_PX = 6
/** A coasting flick loses this much speed per 60 Hz frame and stops under `STOP_SPEED` (px/ms). */
const DECAY = 0.95
const STOP_SPEED = 0.05
/** A flick's release speed is capped here (px/ms), so one flick carries about 55 steps at most. */
const MAX_SPEED = 1
const FRAME_MS = 1000 / 60
/** Only the last stretch of the drag counts toward the speed of the release. */
const VELOCITY_WINDOW_MS = 100
/** How far the scale is drawn to each side of the centre; wider than any phone. */
const HALF_PX = 280
const HEIGHT = 24

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The ticks and labels around `base`, unshifted: memoised, so a step only moves them and a new label period redraws them. */
const Scale = memo(function Scale({ base, min, max, step, pxPerStep, labelEvery }: {
  base: number; min: number; max: number; step: number; pxPerStep: number; labelEvery: number
}) {
  const half = Math.ceil(HALF_PX / pxPerStep)
  const small: string[] = []
  const mid: string[] = []
  const long: string[] = []
  const labels: number[] = []
  for (let i = -half; i <= half; i++) {
    const v = base + i * step
    if (v < min || v > max) continue
    const x = i * pxPerStep
    if (v % labelEvery === 0) { long.push(`M${x} 12v10`); labels.push(v) }
    else if (Math.round(v / step) % 5 === 0) mid.push(`M${x} 14v8`)
    else small.push(`M${x} 18v4`)
  }
  return (
    <>
      <path className="ruler-tick" d={small.join('')} />
      <path className="ruler-tick ruler-tick-mid" d={mid.join('')} />
      <path className="ruler-tick ruler-tick-long" d={long.join('')} />
      {labels.map((v) => <text key={v} className="ruler-label" x={((v - base) / step) * pxPerStep} y={9} textAnchor="middle">{v}</text>)}
    </>
  )
})

type Drag = {
  id: number
  x: number
  y: number
  /** Where the scale stood when the finger went down. */
  from: number
  /** Where the scale is now, between steps: what a release settles from, whatever React has rendered. */
  pos: number
  state: 'wait' | 'sideways' | 'vertical'
  /** The last step handed to `onChange` (or the one it started on). */
  last: number
  samples: { t: number; x: number }[]
}

/**
 * A scale to drag sideways, a tape measure under a number. Drag left to go up, as when pulling a tape. The drag starts
 * only once it is more sideways than up or down, so a swipe along the page still scrolls it (`touch-action: pan-y`).
 * It calls `onChange` for every new step, coasts on after a flick unless the user prefers less motion, and always ends
 * on a multiple of `step` within `min`–`max`. The scale is `aria-hidden`: the number beside it is the accessible control.
 */
export function Ruler({ value, min, max, step, pxPerStep, labelEvery, onChange }: {
  value: number
  min: number
  max: number
  step: number
  pxPerStep: number
  labelEvery: number
  onChange: (v: number) => void
}) {
  // While dragging or coasting, where the scale is, between steps; null at rest, when it sits on `value`.
  const [at, setAt] = useState<number | null>(null)
  const callback = useRef(onChange)
  useEffect(() => {
    callback.current = onChange
  })
  const drag = useRef<Drag | null>(null)
  const frame = useRef(0)
  // The scale's position while dragging or coasting (like `at`, but current before a render), else null.
  const where = useRef<number | null>(null)
  const stopCoast = () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }
  useEffect(() => stopCoast, [])

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const snapped = (v: number) => clamp(Math.round(v / step) * step)
  /** Moves the scale to `v` and tells the owner when that is a new step. */
  const moveTo = (d: Drag, v: number) => {
    const to = clamp(v)
    d.pos = to
    where.current = to
    setAt(to)
    const s = snapped(to)
    if (s !== d.last) {
      d.last = s
      callback.current(s)
    }
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    stopCoast()
    const from = where.current ?? value
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from, pos: from, state: 'wait', last: snapped(from), samples: [{ t: performance.now(), x: e.clientX }] }
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || d.state === 'vertical') return
    const dx = e.clientX - d.x
    if (d.state === 'wait') {
      const dy = e.clientY - d.y
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= LOCK_PX) { d.state = 'vertical'; return }
      if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < LOCK_PX) return
      d.state = 'sideways'
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    const now = performance.now()
    d.samples.push({ t: now, x: e.clientX })
    while (d.samples.length > 2 && now - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
    moveTo(d, d.from - (dx / pxPerStep) * step)
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (d.state !== 'sideways') { where.current = null; setAt(null); return }
    const unit = step / pxPerStep
    const first = d.samples[0]
    const lastSample = d.samples[d.samples.length - 1]
    const dt = lastSample.t - first.t
    // In value units per ms; the scale moves against the finger. A cancelled touch or a lost capture doesn't coast.
    let speed = e.type === 'pointerup' && dt > 0 ? -Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (lastSample.x - first.x) / dt)) * unit : 0
    let pos = d.pos
    const settle = () => {
      const s = snapped(pos)
      if (s !== d.last) callback.current(s)
      where.current = null
      setAt(null)
    }
    if (reducedMotion() || Math.abs(speed) / unit < STOP_SPEED) { settle(); return }
    let prev = 0
    const tick = (t: number) => {
      const dtMs = prev ? Math.min(64, t - prev) : FRAME_MS
      prev = t
      pos = clamp(pos + speed * dtMs)
      speed *= Math.pow(DECAY, dtMs / FRAME_MS)
      if (Math.abs(speed) / unit < STOP_SPEED || pos <= min || pos >= max) { frame.current = 0; settle(); return }
      moveTo(d, pos)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }

  const shown = at ?? value
  const base = Math.floor(shown / labelEvery) * labelEvery
  const x = ((shown - base) / step) * pxPerStep
  return (
    <div className={at === null ? 'ruler' : 'ruler is-moving'} aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      <svg width="100%" height={HEIGHT} focusable="false">
        <svg x="50%" overflow="visible">
          <g transform={`translate(${-x} 0)`}>
            <Scale base={base} min={min} max={max} step={step} pxPerStep={pxPerStep} labelEvery={labelEvery} />
          </g>
        </svg>
      </svg>
      <span className="ruler-mark" />
    </div>
  )
}

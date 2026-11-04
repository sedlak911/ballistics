import { memo, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

/** The drag has to be this far sideways before it moves the value; a swipe more than twice as far up or down as sideways is no drag. */
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
 * A tape measure under a number (`children`, drawn above the scale): the whole surface drags sideways, wherever the press
 * lands. Drag left to go up, as when pulling a tape. It takes the whole touch (`touch-action: none`), so the browser never
 * turns a slanted swipe into a scroll; the drag starts once it is 6 px sideways, unless it runs more than twice as far up or down, and a press that
 * doesn't get that far is left to what it pressed (a tap on a field types). A drag takes the focus from a field inside.
 * It calls `onChange` for every new step, coasts on after a flick unless the user prefers less motion, and always ends
 * on a multiple of `step` within `min`–`max`. The scale is `aria-hidden`: the number is the accessible control.
 */
export function Ruler({ value, min, max, step, pxPerStep, labelEvery, onChange, children }: {
  value: number
  min: number
  max: number
  step: number
  pxPerStep: number
  labelEvery: number
  onChange: (v: number) => void
  children?: ReactNode
}) {
  // While dragging or coasting, where the scale is, between steps; null at rest, when it sits on `value`.
  const [at, setAt] = useState<number | null>(null)
  const callback = useRef(onChange)
  useEffect(() => {
    callback.current = onChange
  })
  const drag = useRef<Drag | null>(null)
  // Whether the last press dragged: a browser still makes a tap of a swipe within its slop, and its mousedown or click
  // would focus a field inside, or the field of a label pressed (the keyboard after a swipe).
  const dragged = useRef(false)
  const afterDrag = (e: ReactMouseEvent) => {
    if (dragged.current) e.preventDefault()
  }
  // The click ends the press: once it is swallowed, a click that comes without a pointerdown (assistive technology) isn't.
  const afterDragClick = (e: ReactMouseEvent) => {
    if (dragged.current) { e.preventDefault(); dragged.current = false }
  }
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
    // A press that stops a coast belongs to the flick: its click must not focus a field (the keyboard).
    dragged.current = frame.current !== 0
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
      if (Math.abs(dy) > 2 * Math.abs(dx) && Math.abs(dy) >= LOCK_PX) { d.state = 'vertical'; return }
      if (Math.abs(dx) < LOCK_PX) return
      d.state = 'sideways'
      dragged.current = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
      // The drag owns the value now: a field inside gives up the focus it had, or that a mouse press gave it.
      const focused = document.activeElement
      if (focused instanceof HTMLElement && e.currentTarget.contains(focused)) focused.blur()
    }
    const now = performance.now()
    d.samples.push({ t: now, x: e.clientX })
    while (d.samples.length > 2 && now - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
    moveTo(d, d.from - (dx / pxPerStep) * step)
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    // A touch is captured by what it pressed: when the surface takes the capture at the lock, that element loses it, and
    // its lostpointercapture bubbles up here. The drag goes on.
    if (e.type === 'lostpointercapture' && e.target !== e.currentTarget) return
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
    <div className={at === null ? 'ruler' : 'ruler is-moving'} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onLostPointerCapture={up} onMouseDown={afterDrag} onClick={afterDragClick}>
      {children}
      <div className="ruler-scale" aria-hidden="true">
        <svg width="100%" height={HEIGHT} focusable="false">
          <svg x="50%" overflow="visible">
            <g transform={`translate(${-x} 0)`}>
              <Scale base={base} min={min} max={max} step={step} pxPerStep={pxPerStep} labelEvery={labelEvery} />
            </g>
          </svg>
        </svg>
        <span className="ruler-mark" />
      </div>
    </div>
  )
}

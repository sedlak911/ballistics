import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'

export interface WindClockProps {
  label: string
  /** 1–12: the hour the wind blows from (12 = from the target, 3 = from the right, 6 = from behind, 9 = from the left). */
  value: number
  onChange: (clock: number) => void
  speedMs: number
  /** The speed's unit, written small under it in the hub, so the figure doesn't read as an hour. */
  unit?: string
  /** The slider's spoken value, localized by the caller (e.g. "9 o'clock, 4 m/s"). */
  valueText: string
  /** Four compass letters on a ring outside the face (N E S W, in the caller's language), turned so the azimuth is at the top. */
  cardinals?: { azimuthDeg: number; letters: readonly [n: string, e: string, s: string, w: string] }
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
/** The dial is drawn in a 0–100 box; hour positions sit on this radius around 50 50. */
const RING = 38
/** The compass letters sit a little outside the face (radius 54). */
const CARDINAL_RING = 54
/** Bearings of the four letters, in the order the caller gives them: N, E, S, W. */
const CARDINAL_BEARINGS = [0, 90, 180, 270]
const at = (hour: number, r: number) => {
  const a = (hour * Math.PI) / 6
  return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) }
}

/** The hour (1–12) a point lies toward, from its offset from the centre (y down): each hour owns a 30° wedge centred on it, 12 at the top, clockwise. */
// eslint-disable-next-line react/only-export-components -- a pure helper, exported for its test
export function hourAt(dx: number, dy: number): number {
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
  return (Math.round(deg / 30) % 12) || 12
}

/** A press this close to the centre (a share of the radius) is the hub, not an hour. */
const DEAD_ZONE = 0.3

/**
 * A 12-position dial for where the wind blows from, the target at the top. One focusable control (`role="slider"`
 * with `valueText` as its value text); arrow keys step the hour and wrap at 12 and 1, and a press or drag anywhere on the dial
 * (outside the hub) picks the nearest hour. The arrow runs from the chosen hour toward the centre.
 */
export function WindClock({ label, value, onChange, speedMs, unit, valueText, cardinals }: WindClockProps) {
  const labelId = `wc-${useId()}`
  // The tail starts inside the ring of hours, so the chosen hour's number stays clear of it.
  const from = at(value, RING - 9)
  // The head stops short of the hub, where the speed is written.
  const to = at(value, 17)
  const step = (d: 1 | -1) => onChange(((value - 1 + d + 12) % 12) + 1)
  const lastHour = useRef<number | null>(null)
  const hourFor = (e: PointerEvent<HTMLDivElement>): number | null => {
    const r = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    if (Math.hypot(dx, dy) < DEAD_ZONE * (Math.min(r.width, r.height) / 2)) return null
    return hourAt(dx, dy)
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const h = hourFor(e)
    if (h === null) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    lastHour.current = h
    onChange(h)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (lastHour.current === null) return
    const h = hourFor(e)
    if (h === null || h === lastHour.current) return
    lastHour.current = h
    onChange(h)
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    lastHour.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); step(-1) }
  }
  return (
    <div className={cardinals ? 'wind-clock has-cardinals' : 'wind-clock'}>
      <span id={labelId} className="label">{label}</span>
      <div
        className="wind-clock-dial"
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={1}
        aria-valuemax={12}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onKeyDown={onKey}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx={50} cy={50} r={RING + 9} className="wind-clock-face" />
          <g data-testid="wind-arrow" data-x1={from.x.toFixed(2)} data-y1={from.y.toFixed(2)} data-x2={to.x.toFixed(2)} data-y2={to.y.toFixed(2)}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="wind-clock-arrow" />
            <path data-testid="wind-head" d="M-3.2 -4.6L0 0L3.2 -4.6" className="wind-clock-arrow"
              transform={`translate(${to.x} ${to.y}) rotate(${value * 30})`} />
          </g>
          <text x={50} y={unit ? 47 : 50} textAnchor="middle" dominantBaseline="central" className="wind-clock-speed">
            {speedMs}
            {unit && <tspan x={50} dy={8} className="wind-clock-unit">{unit}</tspan>}
          </text>
        </svg>
        {HOURS.map((h) => {
          const p = at(h, RING)
          return (
            <div key={h} data-hour={h} className="wind-clock-hour" data-on={h === value || undefined}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              {h}
            </div>
          )
        })}
        {cardinals && CARDINAL_BEARINGS.map((bearing, i) => {
          const letter = cardinals.letters[i]
          // Relative bearing from the azimuth to this point, so the letter sits where that way lies from the shot.
          const rel = ((bearing - cardinals.azimuthDeg + 360) % 360) * (Math.PI / 180)
          const left = 50 + CARDINAL_RING * Math.sin(rel)
          const top = 50 - CARDINAL_RING * Math.cos(rel)
          return (
            <div key={bearing} data-cardinal={letter} className="wind-clock-cardinal" aria-hidden="true"
              style={{ left: `${left}%`, top: `${top}%` }}>
              {letter}
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useId, type KeyboardEvent } from 'react'

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
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
/** The dial is drawn in a 0–100 box; hour positions sit on this radius around 50 50. */
const RING = 38
const at = (hour: number, r: number) => {
  const a = (hour * Math.PI) / 6
  return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) }
}

/**
 * A 12-position dial for where the wind blows from, the target at the top. One focusable control (`role="slider"`
 * with `valueText` as its value text); arrow keys step the hour and wrap at 12 and 1, and each hour is a
 * click target of at least 44 px on a phone. The arrow runs from the chosen hour toward the centre.
 */
export function WindClock({ label, value, onChange, speedMs, unit, valueText }: WindClockProps) {
  const labelId = `wc-${useId()}`
  // The tail starts inside the ring of hours, so the chosen hour's number stays clear of it.
  const from = at(value, RING - 9)
  // The head stops short of the hub, where the speed is written.
  const to = at(value, 17)
  const step = (d: 1 | -1) => onChange(((value - 1 + d + 12) % 12) + 1)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); step(-1) }
  }
  return (
    <div className="wind-clock">
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
              style={{ left: `${p.x}%`, top: `${p.y}%` }} onClick={() => onChange(h)}>
              {h}
            </div>
          )
        })}
      </div>
    </div>
  )
}

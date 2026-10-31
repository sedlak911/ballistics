/** A number moved in fixed steps with − and +, in place of a dropdown of every step. */
export function Stepper({ label, value, min, max, step, format, onChange, decLabel, incLabel }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  decLabel: string
  incLabel: string
}) {
  const go = (v: number) => onChange(Math.min(max, Math.max(min, v)))
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={decLabel} disabled={value <= min} onClick={() => go(value - step)}>−</button>
      <output className="num">{format(value)}</output>
      <button type="button" aria-label={incLabel} disabled={value >= max} onClick={() => go(value + step)}>+</button>
    </div>
  )
}

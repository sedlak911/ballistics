import { useId } from 'react'

/**
 * A number moved in fixed steps with − and +, in place of a dropdown of every step. A null `value` is not set: it shows
 * `—`, and the first press of either button gives `start`. `invalid` flags it with `invalidText` under it, as NumberField
 * flags a bad entry (aria-invalid, tied with aria-describedby).
 */
export function Stepper({ label, value, min, max, step, format, onChange, decLabel, incLabel, start = min, invalid = false, invalidText }: {
  label: string
  value: number | null
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  decLabel: string
  incLabel: string
  /** What the first press gives while `value` is null. */
  start?: number
  invalid?: boolean
  invalidText?: string
}) {
  const errorId = `st-err-${useId()}`
  const go = (v: number) => onChange(Math.min(max, Math.max(min, v)))
  const by = (dir: 1 | -1) => (value === null ? go(start) : go(value + dir * step))
  const flagged = invalid && invalidText !== undefined
  return (
    <>
      <div className="stepper" role="group" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={flagged ? errorId : undefined}>
        <button type="button" aria-label={decLabel} disabled={value !== null && value <= min} onClick={() => by(-1)}>−</button>
        <output className={value === null ? 'num unset' : 'num'}>{value === null ? '—' : format(value)}</output>
        <button type="button" aria-label={incLabel} disabled={value !== null && value >= max} onClick={() => by(1)}>+</button>
      </div>
      {flagged && <p id={errorId} className="number-field-error" role="alert">{invalidText}</p>}
    </>
  )
}

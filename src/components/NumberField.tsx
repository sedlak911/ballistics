import { useId, useState, type ReactNode } from 'react'
import { Segmented } from './Segmented'

export interface NumberFieldProps {
  label: string
  /** Null: nothing set yet, so the box is empty (see `placeholder`) and leaving it empty is fine. */
  value: number | null
  unit: string
  /** More than one unit: a segmented control beside the input switches them. */
  units?: string[]
  onUnit?: (u: string) => void
  /** Inclusive on both ends; callers pass min > 0 for physical quantities, so zero is refused. */
  min: number
  max: number
  /** Arrow-key step. */
  step?: number
  /** The arrow keys go to the next multiple of `step` rather than add it (1094 up by 10 is 1100, not 1104). */
  snap?: boolean
  onChange: (v: number) => void
  invalidText: string
  placeholder?: string
  /** Emptying the box means "forget it": calls this instead of showing `invalidText`. */
  onClear?: () => void
  /** The field has no valid value for what was just chosen (e.g. a BC for a new drag model): empty, flagged, and the next valid entry is passed on even if it equals `value`. */
  needed?: boolean
  /** Called with what the box holds right now on every edit, step and commit: the number if it is valid (in range), else null. For a button that must act on what is shown, not on the last committed value. */
  onDraft?: (v: number | null) => void
  /** Typing the value that is already there still counts as an entry (a value that was only a default becomes a chosen one). */
  commitSame?: boolean
  /** At the end of the label's row, e.g. where the value comes from. */
  aside?: ReactNode
}

const show = (v: number | null) => (v === null ? '' : String(+v.toPrecision(10)))
const NUMBER = /^[+-]?(\d+[.,]?\d*|[.,]\d+)$/

/** A number typed with `.` or `,`; null for empty, anything else, or a value outside min..max. */
function parse(text: string, min: number, max: number): number | null {
  const t = text.trim()
  if (!NUMBER.test(t)) return null
  const v = Number(t.replace(',', '.'))
  return Number.isFinite(v) && v >= min && v <= max ? v : null
}

/**
 * A typed number. It commits on blur or Enter and never passes on a bad value: empty, non-numeric or out of range
 * text keeps the last good value, and the bad text stays in the box beside `invalidText` (aria-invalid, tied with
 * aria-describedby) until the user corrects it. A new `value` or `unit` from outside replaces the text.
 */
export function NumberField({ label, value, unit, units, onUnit, min, max, step = 1, onChange, invalidText, placeholder, onClear, needed = false, onDraft, commitSame = false, snap = false, aside }: NumberFieldProps) {
  const uid = useId()
  const inputId = `nf-${uid}`
  const errorId = `nf-err-${uid}`
  const [text, setText] = useState(() => (needed ? '' : show(value)))
  const [invalid, setInvalid] = useState(needed)
  // Whether the text was typed in since the last commit, so a mere tab through the box commits nothing.
  const [typed, setTyped] = useState(false)

  // A new value, unit or need from outside replaces the text (state adjusted during render, not in an effect).
  const [seen, setSeen] = useState({ value, unit, needed })
  if (seen.value !== value || seen.unit !== unit || seen.needed !== needed) {
    setSeen({ value, unit, needed })
    setText(needed ? '' : show(value))
    setInvalid(needed)
  }

  const commit = () => {
    const wasTyped = typed
    setTyped(false)
    if (text.trim() === '' && !needed && (value === null || onClear)) {
      // Empty is a fair answer for a value that may be missing; with onClear it clears the stored one.
      setInvalid(false)
      if (value !== null) onClear?.()
      return
    }
    const v = parse(text, min, max)
    if (v === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setText(show(v))
    onDraft?.(v)
    if (v !== value || needed || (commitSame && wasTyped)) onChange(v)
  }

  const stepBy = (dir: 1 | -1) => {
    const base = parse(text, min, max) ?? value ?? min
    const to = snap
      ? (dir > 0 ? Math.floor(base / step + 1e-9) + 1 : Math.ceil(base / step - 1e-9) - 1) * step
      : base + dir * step
    const v = Math.min(max, Math.max(min, +to.toPrecision(10)))
    setInvalid(false)
    setText(show(v))
    onDraft?.(v)
    if (v !== value || needed) onChange(v)
  }

  const labelEl = <label htmlFor={inputId} className="label">{label}</label>
  return (
    <div className="number-field">
      {aside ? <div className="number-field-head">{labelEl}{aside}</div> : labelEl}
      <div className="number-field-row">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => { setText(e.target.value); setInvalid(false); setTyped(true); onDraft?.(parse(e.target.value, min, max)) }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'ArrowUp') { e.preventDefault(); stepBy(1) }
            else if (e.key === 'ArrowDown') { e.preventDefault(); stepBy(-1) }
          }}
        />
        {units && units.length > 1 && onUnit
          ? <Segmented label={`${label} (${unit})`} value={unit} onChange={onUnit} options={units.map((u) => ({ value: u, label: u }))} />
          : <span className="unit">{unit}</span>}
      </div>
      {invalid && <p id={errorId} className="number-field-error" role="alert">{invalidText}</p>}
    </div>
  )
}

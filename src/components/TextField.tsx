import { useId, useState, type ReactNode } from 'react'

export interface TextFieldProps {
  label: string
  value: string
  /** Called with the trimmed text on a commit that changes it. */
  onChange: (v: string) => void
  /** The input holds the typing at this length; a longer value from outside shows whole and is never cut. */
  maxLength?: number
  /** Empty is refused: `invalidText` shows and the last value stays. */
  required?: boolean
  /** The field is asked for (a form's refused save): flagged while it is, whatever the box holds. */
  needed?: boolean
  invalidText?: string
  placeholder?: string
  /** A short note after the label word, inside the label (e.g. `optional`). */
  mark?: string
  /** At the end of the label's row, e.g. where the value comes from. */
  aside?: ReactNode
}

/**
 * A typed text, in NumberField's markup and classes. It commits on blur or Enter, trimmed. A required field never
 * passes on an empty text: the text stays in the box beside `invalidText` (aria-invalid, tied with aria-describedby)
 * until it is corrected. A new `value` from outside replaces the text. A `needed` one shows `invalidText` while it is.
 */
export function TextField({ label, value, onChange, maxLength, required = false, needed = false, invalidText, placeholder, mark, aside }: TextFieldProps) {
  const uid = useId()
  const inputId = `tf-${uid}`
  const errorId = `tf-err-${uid}`
  const [text, setText] = useState(value)
  const [invalid, setInvalid] = useState(false)
  const flagged = invalid || needed

  // A new value from outside replaces the text (state adjusted during render, not in an effect).
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setText(value)
    setInvalid(false)
  }

  const commit = () => {
    const v = text.trim()
    if (v === '' && required) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    // A text left as it came isn't trimmed or passed on, so a stored value is never changed by a tab through the box.
    if (text === value) return
    setText(v)
    if (v !== value) onChange(v)
  }

  const labelEl = <label htmlFor={inputId} className="label">{label}{mark && <> <span className="label-mark">{mark}</span></>}</label>
  return (
    <div className="number-field">
      {aside ? <div className="number-field-head">{labelEl}{aside}</div> : labelEl}
      <div className="number-field-row">
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          value={text}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={flagged}
          aria-describedby={flagged && invalidText ? errorId : undefined}
          onChange={(e) => { setText(e.target.value); setInvalid(false) }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
          }}
        />
      </div>
      {flagged && invalidText && <p id={errorId} className="number-field-error" role="alert">{invalidText}</p>}
    </div>
  )
}

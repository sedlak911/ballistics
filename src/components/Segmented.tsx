interface Option<V extends string> {
  value: V
  label: string
}

/** Small connected toggle buttons, e.g. EN | CS. Options that are words take the `words` class for the label role. */
export function Segmented<V extends string>({ options, value, onChange, label, className }: {
  options: Option<V>[]
  value: V
  onChange: (v: V) => void
  label: string
  className?: string
}) {
  return (
    <div className={`segmented${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

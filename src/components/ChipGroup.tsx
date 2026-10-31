export interface ChipOption<V> {
  value: V
  label: string
  title?: string
}

/** Preset chips: a short set of visible options, the chosen one filled with the accent. */
export function ChipGroup<V extends string | number>({ label, options, value, onChange, className }: {
  label: string
  options: ChipOption<V>[]
  value: V | null
  onChange: (v: V) => void
  className?: string
}) {
  return (
    <div className={`chips${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
